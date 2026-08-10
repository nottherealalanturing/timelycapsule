import type { GeocodeAdapter } from '../adapter.js';

/**
 * No `LOCATIONIQ_API_KEY` set (and not a test run) — throws honestly rather
 * than returning fabricated place names, which the fake adapter would do if
 * it were ever reachable outside tests. The service layer turns this into
 * `geocoding_unavailable`, not a silent fake result.
 */
export class UnconfiguredGeocodeAdapter implements GeocodeAdapter {
  async reverseGeocode(): Promise<string> {
    throw new Error('LOCATIONIQ_API_KEY is not configured');
  }
}
