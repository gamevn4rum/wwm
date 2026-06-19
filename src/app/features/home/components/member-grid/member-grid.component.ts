import { Component, inject, OnInit, signal } from '@angular/core';
import { Player } from '../../models/player.model';
import { HomeDataService } from '../../services/home-data.service';

@Component({
  selector: 'app-member-grid',
  standalone: true,
  imports: [],
  templateUrl: './member-grid.component.html',
  styleUrls: ['./member-grid.component.scss'],
})
export class MemberGridComponent implements OnInit {
  private homeDataService = inject(HomeDataService);
  readonly players = signal<Player[]>([]);

  ngOnInit(): void {
    this.homeDataService.getPlayers().subscribe((data: Player[]) => {
      this.players.set(data);
    });
  }

  getRankClass(rank: string): string {
    return rank.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-');
  }
}
