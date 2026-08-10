import type { GeocodeAdapter } from './adapter.js';
import { FakeGeocodeAdapter } from './adapters/fake.js';
import { LocationIqAdapter } from './adapters/locationiq.js';
import { UnconfiguredGeocodeAdapter } from './adapters/unconfigured.js';

let cached: GeocodeAdapter | undefined;

/**
 * Same shape as modules/email/get-adapter.ts and modules/media/get-adapter.ts,
 * with one deliberate difference: outside tests, a missing key does **not**
 * fall back to a fake adapter — that would hand a real user a fabricated
 * place name that looks genuine. It falls back to `UnconfiguredGeocodeAdapter`,
 * which throws, so the route reports `geocoding_unavailable` honestly.
 */
export function getGeocodeAdapter(): GeocodeAdapter {
  if (!cached) {
    if (process.env.NODE_ENV === 'test') {
      cached = new FakeGeocodeAdapter();
    } else {
      const apiKey = process.env.LOCATIONIQ_API_KEY;
      cached = apiKey ? new LocationIqAdapter(apiKey) : new UnconfiguredGeocodeAdapter();
    }
  }
  return cached;
}

/** Test-only: reset the cached adapter so each test file gets a fresh instance. */
export function resetGeocodeAdapterForTests(): void {
  cached = undefined;
}
