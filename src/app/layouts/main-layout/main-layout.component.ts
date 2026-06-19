import { Component, inject, DOCUMENT } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HomeHeaderComponent } from '../../features/home/components/home-header/home-header.component';
import { HomeFooterComponent } from '../../features/home/components/home-footer/home-footer.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, HomeHeaderComponent, HomeFooterComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent {
  private baseHref = inject(DOCUMENT).querySelector('base')?.getAttribute('href') ?? '/';
  bgImage = `url('${this.baseHref}images/bg-main.png')`;
}
