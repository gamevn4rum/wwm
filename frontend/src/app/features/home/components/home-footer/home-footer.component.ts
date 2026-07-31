import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home-footer.component.html',
  styleUrls: ['./home-footer.component.scss'],
})
export class HomeFooterComponent {}
