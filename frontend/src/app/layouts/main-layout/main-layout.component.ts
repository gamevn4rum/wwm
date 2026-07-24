import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HomeHeaderComponent } from '../../features/home/components/home-header/home-header.component';
import { HomeNavComponent } from '../../features/home/components/home-nav/home-nav.component';
import { HomeFooterComponent } from '../../features/home/components/home-footer/home-footer.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, HomeHeaderComponent, HomeNavComponent, HomeFooterComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent {}
