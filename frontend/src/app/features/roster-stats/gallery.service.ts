import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiUrl } from '../../core/api';

/** One public in-game photo. Every link points at the game's own file store — nothing is hosted
 *  by us. `thumbUrl` fits 512 px, `imageUrl` 1280 px; `originalUrl` is the full 2–3 MB file,
 *  meant only for an explicit download, never for drawing in a grid. */
export interface GalleryPhoto {
  id: string;
  title: string | null;
  thumbUrl: string;
  imageUrl: string;
  originalUrl: string;
  uploadedUnix: number | null;
  width: number | null;
  height: number | null;
}

export interface Gallery {
  ign: string;
  total: number;
  photos: GalleryPhoto[];
}

/**
 * A member's public photo gallery, read live by the API (members only, capped at 60 photos,
 * held five minutes server-side). Any failure is an empty gallery — the profile never waits on
 * or breaks over the album.
 */
@Injectable({ providedIn: 'root' })
export class GalleryService {
  private readonly http = inject(HttpClient);

  get(ign: string): Observable<Gallery | null> {
    return this.http.get<Gallery>(apiUrl(`/member/gallery/${encodeURIComponent(ign)}`)).pipe(
      catchError(() => of(null)),
    );
  }
}
