import { z } from 'zod';

/**
 * Reverse geocoding (Product Quality Pass, 2026-08) — turns a coordinate pair
 * into a human-readable place name for "Where this was written." This is a
 * stateless lookup, never persisted server-side: the coordinates travel here
 * only when the writer explicitly asks for a name (PlaceMemoryDialog's
 * "Look up this place" action), and the result is written straight into the
 * capsule's encrypted envelope by the client — the API never sees, and never
 * stores, which capsule a lookup belonged to.
 */
export const ReverseGeocodeRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type ReverseGeocodeRequest = z.infer<typeof ReverseGeocodeRequestSchema>;

export const ReverseGeocodeResponseSchema = z.object({
  name: z.string(),
});
export type ReverseGeocodeResponse = z.infer<typeof ReverseGeocodeResponseSchema>;
