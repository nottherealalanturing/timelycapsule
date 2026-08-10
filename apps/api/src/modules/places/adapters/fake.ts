import type { GeocodeAdapter } from '../adapter.js';

/** NODE_ENV=test / no API key configured — deterministic, no network call. */
export class FakeGeocodeAdapter implements GeocodeAdapter {
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    return `Test Place (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
  }
}
