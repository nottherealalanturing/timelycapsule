/**
 * One method, so swapping providers later (self-hosted Nominatim, a
 * different Nominatim-compatible host) is a new adapter file, not a rewrite
 * of the route or service. Mirrors modules/email/adapter.ts and
 * modules/media/storage-adapter.ts's shape.
 */
export interface GeocodeAdapter {
  /** Resolves to a short, human-readable place name, or throws if the lookup fails. */
  reverseGeocode(lat: number, lng: number): Promise<string>;
}
