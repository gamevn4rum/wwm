import { environment } from '../../environments/environment';

/** Absolute URL for a backend API path (e.g. apiUrl('/public/events')). */
export const apiUrl = (path: string): string => `${environment.apiBaseUrl}${path}`;
