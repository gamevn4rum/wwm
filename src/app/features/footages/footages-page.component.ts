import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FootagesDataService } from './footages-data.service';
import { FootageRecord, MatchType, UploaderKey } from './footages.model';
import { UPLOADERS } from '../match-history/match-record.model';
import { FootageVideoCardComponent } from './components/footage-video-card.component';

@Component({
  selector: 'app-footages-page',
  standalone: true,
  imports: [FormsModule, FootageVideoCardComponent],
  templateUrl: './footages-page.component.html',
  styleUrls: ['./footages-page.component.scss'],
})
export class FootagesPageComponent implements OnInit {
  private readonly footagesDataService = inject(FootagesDataService);
  private readonly route = inject(ActivatedRoute);

  readonly allFootages = signal<FootageRecord[]>([]);
  readonly loading = signal(true);

  readonly selectedMatchType = signal<'All' | MatchType>('All');
  readonly selectedOpponent = signal<'All' | string>('All');
  readonly selectedUploader = signal<'All' | UploaderKey>('All');

  readonly matchTypeOptions: MatchType[] = ['League', 'Ranked', 'Scrim'];
  readonly uploaderOptions: UploaderKey[] = UPLOADERS;

  readonly opponentOptions = computed(() =>
    Array.from(new Set(this.allFootages().map((f) => f.opponent))).sort((a, b) => a.localeCompare(b))
  );

  readonly filteredFootages = computed(() => {
    const selectedMatchType = this.selectedMatchType();
    const selectedOpponent = this.selectedOpponent();
    const selectedUploader = this.selectedUploader();

    return this.allFootages().filter((record) => {
      if (selectedMatchType !== 'All' && record.matchType !== selectedMatchType) return false;
      if (selectedOpponent !== 'All' && record.opponent !== selectedOpponent) return false;
      if (selectedUploader !== 'All' && record.uploader !== selectedUploader) return false;
      return true;
    });
  });

  ngOnInit(): void {
    const opponent = this.route.snapshot.queryParamMap.get('opponent');
    if (opponent) {
      this.selectedOpponent.set(opponent);
    }

    this.footagesDataService.getFootages().subscribe({
      next: (records) => {
        this.allFootages.set(records);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onMatchTypeChange(value: string): void {
    this.selectedMatchType.set((value || 'All') as 'All' | MatchType);
  }

  onOpponentChange(value: string): void {
    this.selectedOpponent.set(value || 'All');
  }

  onUploaderChange(value: string): void {
    this.selectedUploader.set((value || 'All') as 'All' | UploaderKey);
  }
}

