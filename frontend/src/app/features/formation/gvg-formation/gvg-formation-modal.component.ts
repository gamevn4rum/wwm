import { Component, HostListener, OnDestroy, OnInit, computed, inject, output, signal } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { toBlob } from 'html-to-image';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { captureScale } from '../../../core/utils/card-shot';
import { cardFontCss } from '../../../core/utils/card-fonts';
import { GvgChipComponent } from './gvg-chip.component';
import { GvgFormationService } from './gvg-formation.service';
import {
  BoxId, DropTarget, FORMATION_BOXES, FormationLayout, FormationPool, PoolMember, SLOTS_PER_BOX,
  ShareChannel, emptyLayout,
} from './gvg-formation.models';

type Busy = 'idle' | 'working' | 'done' | 'failed';

const ERROR_TEXT: Record<string, string> = {
  channel_not_allowed: 'Kênh này không nằm trong danh mục cho phép.',
  no_bot_token: 'API chưa cấu hình bot Discord.',
  discord_unavailable: 'Discord từ chối hoặc không phản hồi.',
  image_too_large: 'Ảnh quá lớn.',
};

/**
 * "Form GvG Team": the commander drags the people who said yes (or everyone, when no match is
 * coming) into six boxes of six, saves the layout in this browser, and copies or posts the picture.
 */
@Component({
  selector: 'app-gvg-formation-modal',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, FormsModule, GvgChipComponent],
  templateUrl: './gvg-formation-modal.component.html',
  styleUrls: ['./gvg-formation-modal.component.scss'],
})
export class GvgFormationModalComponent implements OnInit, OnDestroy {
  private readonly service = inject(GvgFormationService);

  readonly closed = output<void>();

  readonly boxes = FORMATION_BOXES;
  readonly slotIndexes = Array.from({ length: SLOTS_PER_BOX }, (_, i) => i);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly pool = signal<FormationPool | null>(null);
  readonly layout = signal<FormationLayout>(emptyLayout());
  readonly filter = signal('');
  readonly maybeOpen = signal(false);
  readonly hover = signal<string | null>(null);
  readonly note = signal<string | null>(null);

  readonly channels = signal<ShareChannel[]>([]);
  readonly channelId = signal('');

  readonly copyState = signal<Busy>('idle');
  readonly copyText = signal('');
  readonly shareState = signal<Busy>('idle');
  readonly shareText = signal('');
  readonly saveText = signal('');

  private noteTimer: ReturnType<typeof setTimeout> | null = null;

  /** Every member that can be placed, by key. */
  private readonly byKey = computed(() => {
    const map = new Map<string, PoolMember>();
    const p = this.pool();
    if (p) for (const m of [...p.going, ...p.maybe, ...p.roster]) map.set(m.key, m);
    return map;
  });

  private readonly placed = computed(() => {
    const keys = new Set<string>();
    for (const slots of Object.values(this.layout())) for (const k of slots) if (k) keys.add(k);
    return keys;
  });

  readonly hasEvent = computed(() => !!this.pool()?.event);
  readonly going = computed(() => this.unplaced(this.pool()?.going ?? []));
  readonly maybe = computed(() => this.unplaced(this.pool()?.maybe ?? []));
  readonly everyone = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return this.unplaced(this.pool()?.roster ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));
  });

  readonly headline = computed(() => {
    const ev = this.pool()?.event;
    if (!ev) return 'Tất cả thành viên';
    return `RSVP Có · ${ev.title}`;
  });

  /** "Thứ Bảy, 26/10 20:00" in Vietnam time, whatever the commander's own zone is. */
  readonly startText = computed(() => {
    const iso = this.pool()?.event?.startsAtUtc;
    if (!iso) return '';
    const utc = /[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(utc));
  });

  readonly shotTitle = computed(() => {
    const ev = this.pool()?.event;
    return ev ? `Đội hình GvG · ${ev.title}` : 'Đội hình GvG';
  });

  async ngOnInit(): Promise<void> {
    document.body.style.overflow = 'hidden';
    this.channelId.set(this.service.loadChannelId() ?? '');

    // The channel list is independent of the pool: a failure there only disables Share.
    firstValueFrom(this.service.getChannels()).then((list) => {
      this.channels.set(list);
      if (!list.some((c) => c.id === this.channelId())) this.channelId.set('');
    }).catch(() => this.channels.set([]));

    try {
      const pool = await firstValueFrom(this.service.getPool());
      this.pool.set(pool);
      this.restoreSaved();
    } catch (err) {
      this.loadError.set(err instanceof HttpErrorResponse && err.status === 403
        ? 'Bạn không có quyền (cần Commander trở lên).'
        : 'Không tải được danh sách thành viên.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    if (this.noteTimer) clearTimeout(this.noteTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closed.emit(); }

  memberAt(box: BoxId, idx: number): PoolMember | null {
    const key = this.layout()[box][idx];
    return key ? (this.byKey().get(key) ?? null) : null;
  }

  // ── Drag and drop ────────────────────────────────────────────────────────────────────────────

  slotTarget(box: BoxId, idx: number): DropTarget { return { kind: 'slot', box, idx }; }
  readonly poolTarget: DropTarget = { kind: 'pool' };

  hoverId(box: BoxId, idx: number): string { return `${box}:${idx}`; }

  /**
   * The state is the source of truth, so CDK's own array transfer is not used. Dropping a pool chip
   * on a filled slot puts the occupant back in the pool (it is simply no longer placed); dropping a
   * boxed chip on another slot swaps; dropping it on the pool empties its slot.
   */
  drop(ev: CdkDragDrop<DropTarget>): void {
    this.hover.set(null);
    const key = ev.item.data as string;
    const from = ev.previousContainer.data;
    const to = ev.container.data;
    if (!key || !from || !to) return;
    if (from.kind === 'pool' && to.kind === 'pool') return;
    if (from.kind === 'slot' && to.kind === 'slot' && from.box === to.box && from.idx === to.idx) return;

    const next = this.cloneLayout();
    if (to.kind === 'slot') {
      const displaced = next[to.box][to.idx];
      next[to.box][to.idx] = key;
      if (from.kind === 'slot') next[from.box][from.idx] = displaced;
    } else if (from.kind === 'slot') {
      next[from.box][from.idx] = null;
    }
    this.layout.set(next);
  }

  clear(): void {
    this.layout.set(emptyLayout());
    this.saveText.set('');
  }

  // ── Save ─────────────────────────────────────────────────────────────────────────────────────

  save(): void {
    this.saveText.set(this.service.saveLayout(this.layout()) ? 'Đã lưu' : 'Không lưu được (trình duyệt chặn lưu trữ)');
    setTimeout(() => this.saveText.set(''), 3000);
  }

  /** Puts the saved layout back, dropping anyone who is not in this match's pool. */
  private restoreSaved(): void {
    const saved = this.service.loadLayout();
    if (!saved) return;
    const known = this.byKey();
    let dropped = 0;
    const layout = emptyLayout();
    const seen = new Set<string>();
    for (const box of FORMATION_BOXES) {
      for (let i = 0; i < SLOTS_PER_BOX; i++) {
        const key = saved[box.id][i];
        if (!key) continue;
        if (!known.has(key) || seen.has(key)) { dropped++; continue; }
        seen.add(key);
        layout[box.id][i] = key;
      }
    }
    this.layout.set(layout);
    if (dropped > 0) {
      this.note.set(`${dropped} người không đăng ký trận này đã được bỏ ra khỏi đội hình đã lưu.`);
    }
  }

  // ── Picture: copy and share ──────────────────────────────────────────────────────────────────

  /**
   * Photographs the boxes without their empty rows. Those are removed from an off-screen clone
   * rather than hidden on screen, so the commander's own view keeps every slot to drop on, and the
   * picture is measured at its trimmed height — the same approach the member card's share uses. The
   * rows keep their numbers, so a box with only slots 1 and 4 filled still reads as 1 and 4.
   */
  private async capture(): Promise<Blob | null> {
    const el = document.getElementById('gvg-formation-shot');
    if (!el) return null;

    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('.gf-row.empty').forEach((row) => row.remove());

    const host = document.createElement('div');
    host.style.cssText =
      `position: fixed; left: -10000px; top: 0; width: ${el.offsetWidth}px; pointer-events: none;`;
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      const rect = clone.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      return await toBlob(clone, {
        pixelRatio: captureScale(width, height),
        width,
        height,
        backgroundColor: '#f4f6f9',
        fontEmbedCSS: await cardFontCss(),
      });
    } finally {
      host.remove();
    }
  }

  async copy(): Promise<void> {
    if (this.copyState() === 'working') return;
    this.copyState.set('working');
    this.copyText.set('Đang chụp…');
    try {
      const blob = await this.capture();
      if (!blob) throw new Error('empty');
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.copyText.set('Đã chép vào clipboard');
      } catch {
        this.download(blob);
        this.copyText.set('Clipboard bị chặn — đã tải ảnh về máy');
      }
      this.copyState.set('done');
    } catch {
      this.copyState.set('failed');
      this.copyText.set('Không chụp được ảnh');
    }
    setTimeout(() => { this.copyState.set('idle'); this.copyText.set(''); }, 3500);
  }

  async share(): Promise<void> {
    const channelId = this.channelId();
    if (!channelId || this.shareState() === 'working') return;
    this.shareState.set('working');
    this.shareText.set('Đang gửi…');
    try {
      const blob = await this.capture();
      if (!blob) throw new Error('empty');
      await firstValueFrom(this.service.share(blob, channelId, this.pool()?.event?.title ?? ''));
      const name = this.channels().find((c) => c.id === channelId)?.name;
      this.shareState.set('done');
      this.shareText.set(name ? `Đã gửi vào #${name}` : 'Đã gửi');
    } catch (err) {
      this.shareState.set('failed');
      const code = err instanceof HttpErrorResponse ? (err.error?.error as string | undefined) : undefined;
      this.shareText.set((code && ERROR_TEXT[code]) || 'Gửi không thành công');
    }
    setTimeout(() => { this.shareState.set('idle'); this.shareText.set(''); }, 4500);
  }

  onChannelChange(id: string): void {
    this.channelId.set(id);
    if (id) this.service.saveChannelId(id);
  }

  private download(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'doi-hinh-gvg.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  private unplaced(list: PoolMember[]): PoolMember[] {
    const placed = this.placed();
    return list.filter((m) => !placed.has(m.key));
  }

  private cloneLayout(): FormationLayout {
    const copy = {} as FormationLayout;
    for (const [box, slots] of Object.entries(this.layout())) copy[box as BoxId] = [...slots];
    return copy;
  }
}
