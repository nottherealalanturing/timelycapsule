import type { GeocodeAdapter } from '../adapter.js';

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  borough?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
}

interface NominatimReverseResponse {
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

/**
 * "Lagos Island, Lagos, Nigeria" rather than the full `display_name`
 * ("Lagos Island Maternity Hospital, X Street, Lagos Island, Lagos, 100001,
 * Nigeria") — a place *memory* reads as somewhere, not a postal address.
 * Locality → city/state → country, deduped for the (common outside big
 * cities) case where two levels share a name.
 */
function buildPlaceName(result: NominatimReverseResponse): string {
  const address = result.address;
  if (address) {
    const locality = address.neighbourhood ?? address.suburb ?? address.quarter ?? address.city_district ?? address.borough;
    const cityOrState = address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? address.state ?? address.region;
    const country = address.country;
    const parts = [locality, cityOrState, country].filter((p): p is string => Boolean(p));
    const deduped = parts.filter((p, i) => p !== parts[i - 1]);
    if (deduped.length > 0) return deduped.join(', ');
  }
  if (result.display_name) {
    return result.display_name
      .split(',')
      .slice(0, 3)
      .map((s) => s.trim())
      .join(', ');
  }
  throw new Error('No place name in geocoder response');
}

/**
 * LocationIQ — chosen over the public Nominatim instance because its usage
 * policy explicitly targets production apps (5,000 free lookups/day, 2/sec)
 * where Nominatim's own policy caps at 1/sec and discourages anything but
 * light, cacheable, single-threaded use. Same response shape either way
 * (LocationIQ is Nominatim-API-compatible) — swapping to a self-hosted
 * Nominatim later is a new adapter, not a route change.
 */
export class LocationIqAdapter implements GeocodeAdapter {
  constructor(private readonly apiKey: string) {}

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    const url = new URL('https://us1.locationiq.com/v1/reverse');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    // Identifies the app per LocationIQ/Nominatim usage-policy expectations.
    const res = await fetch(url, { headers: { 'User-Agent': 'TimelyCapsule/1.0 (+https://timelycapsule.com)' } });
    if (!res.ok) {
      throw new Error(`LocationIQ reverse geocode failed: ${res.status}`);
    }
    const body = (await res.json()) as NominatimReverseResponse;
    if (body.error) {
      throw new Error(`LocationIQ reverse geocode error: ${body.error}`);
    }
    return buildPlaceName(body);
  }
}
