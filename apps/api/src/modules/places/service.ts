import type { ReverseGeocodeRequest, ReverseGeocodeResponse } from '@tc/contracts';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../logger.js';
import { getGeocodeAdapter } from './get-adapter.js';

/**
 * Stateless by design — nothing here reads or writes the database. The
 * capsule the coordinates belong to is never named in this call; the client
 * writes the returned name into the letter's encrypted envelope itself.
 */
export async function reverseGeocode(input: ReverseGeocodeRequest): Promise<ReverseGeocodeResponse> {
  try {
    const name = await getGeocodeAdapter().reverseGeocode(input.lat, input.lng);
    return { name };
  } catch (err) {
    // The real reason (e.g. "LOCATIONIQ_API_KEY is not configured") is a
    // server-config detail, not something to hand back to a stranger's
    // browser — logged here instead, `geocodingUnavailable`'s message stays
    // generic on the wire (errorHandler already logs 5xx ApiErrors, but this
    // is a 502 with the *cause* otherwise only visible as "unavailable").
    logger.error({ err }, 'reverse geocode failed');
    throw ApiError.geocodingUnavailable();
  }
}
