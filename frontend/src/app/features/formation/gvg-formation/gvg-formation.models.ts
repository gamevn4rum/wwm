/** The six squad boxes of a GvG formation, in the order they are laid out. */
export type BoxId = 'cong1' | 'cong2' | 'cong3' | 'thu1' | 'thu2' | 'thu3';

export interface FormationBox {
  id: BoxId;
  label: string;
  /** Which colour family the box wears. */
  side: 'cong' | 'thu';
}

export const FORMATION_BOXES: readonly FormationBox[] = [
  { id: 'cong1', label: 'Công 1', side: 'cong' },
  { id: 'cong2', label: 'Công 2', side: 'cong' },
  { id: 'cong3', label: 'Công 3', side: 'cong' },
  { id: 'thu1', label: 'Thủ 1', side: 'thu' },
  { id: 'thu2', label: 'Thủ 2', side: 'thu' },
  { id: 'thu3', label: 'Thủ 3', side: 'thu' },
];

/** Slots per box. Slot 0 is the leader. */
export const SLOTS_PER_BOX = 6;

/** A member the commander can drag. `key` is stable across reloads: `m:<member id>` for someone on
 *  the roster, `d:<handle>` for a responder who is not. */
export interface PoolMember {
  key: string;
  name: string;
  /** Combat role (tank | dps | healer) — no longer drawn on the chip, kept for the tooltip. */
  mainRole: string | null;
  /** `MemberPath` ids — the two icons on the chip. */
  mainPath: string | null;
  subPath: string | null;
  team: string | null;
  onRoster: boolean;
}

export interface FormationEvent {
  eventId: string;
  title: string;
  eventType: string;
  startsAtUtc: string | null;
}

/** `event` is null when there is no upcoming GvG/Event: `roster` then holds everyone. */
export interface FormationPool {
  event: FormationEvent | null;
  going: PoolMember[];
  maybe: PoolMember[];
  roster: PoolMember[];
}

export interface ShareChannel {
  id: string;
  name: string;
  position: number;
}

/** Member keys per box, one entry per slot (null = empty). */
export type FormationLayout = Record<BoxId, (string | null)[]>;

export function emptyLayout(): FormationLayout {
  const layout = {} as FormationLayout;
  for (const box of FORMATION_BOXES) layout[box.id] = Array<string | null>(SLOTS_PER_BOX).fill(null);
  return layout;
}

/** Where a drag started or ended. */
export type DropTarget =
  | { kind: 'pool' }
  | { kind: 'slot'; box: BoxId; idx: number };

/** The jobs a commander can pin on a placed member. One per member, none by default. */
export type TaskId = 'chicken' | 'tree' | 'money';

export interface TaskOption {
  id: TaskId;
  emoji: string;
  label: string;
}

export const TASK_OPTIONS: readonly TaskOption[] = [
  { id: 'chicken', emoji: '🐔', label: 'Gà' },
  { id: 'tree', emoji: '🌳', label: 'Cây' },
  { id: 'money', emoji: '💰', label: 'Tiền' },
];

/** Member key → task. Keyed by member, not by slot, so the job follows a name that is moved or
 *  swapped into another box — "one per member" is what the commander assigned, not "one per seat". */
export type FormationTasks = Record<string, TaskId>;

export function taskOption(id: TaskId | null | undefined): TaskOption | null {
  return id ? (TASK_OPTIONS.find((t) => t.id === id) ?? null) : null;
}

/** One rolling save: who is where, and what each of them is doing. */
export interface SavedFormation {
  layout: FormationLayout;
  tasks: FormationTasks;
}
