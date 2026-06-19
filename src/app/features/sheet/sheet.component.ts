import { Component, inject } from '@angular/core';
import { SheetDataService } from '../../core/services/google-sheets/sheet-data.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sheet',
  standalone: true,
  template: `
    <section>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold text-gray-800">Sheet Viewer</h1>
        <button
          (click)="load()"
          class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          Reload
        </button>
      </div>

      @if (svc.loading()) {
        <p class="text-gray-500 animate-pulse">Loading...</p>
      }

      @if (svc.error()) {
        <p class="text-red-500">{{ svc.error() }}</p>
      }

      @if (!svc.loading() && !svc.error() && svc.rows().length === 0) {
        <p class="text-gray-400">No data. Click Reload to fetch.</p>
      }

      @if (svc.rows().length > 0) {
        <div class="overflow-x-auto rounded-xl border">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-100">
              <tr>
                @for (col of columns(); track col) {
                  <th class="px-4 py-2 text-left font-medium text-gray-600">{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (row of svc.rows(); track $index) {
                <tr class="hover:bg-gray-50">
                  @for (col of columns(); track col) {
                    <td class="px-4 py-2 text-gray-700">{{ row[col] }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class SheetComponent {
  readonly svc = inject(SheetDataService);

  columns() {
    const rows = this.svc.rows();
    return rows.length > 0 ? Object.keys(rows[0]) : [];
  }

  load() {
    this.svc.loadSheet(environment.defaultSpreadsheetId, 'Sheet1');
  }
}
