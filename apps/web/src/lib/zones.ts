import { browserZone, zoneCityName, zoneOffsetLabel } from './zoned-time';

/**
 * Places, not identifiers.
 *
 * The composer used to render `Intl.supportedValuesOf('timeZone')` straight
 * into a `<select>` — better than four hundred options, in alphabetical order,
 * starting at Africa/Abidjan. Nobody thinks in `America/Argentina/Rio_Gallegos`;
 * they think in cities, and usually in one of about fifty.
 *
 * So: a curated list leads, the writer's own zone leads that, and the full
 * database stays reachable by search so no one is ever locked out of a zone we
 * failed to anticipate. The stored value is always the IANA identifier — the
 * curation is presentation, and the scheduler keeps receiving exactly what it
 * received before.
 */

export interface ZoneChoice {
  /** IANA identifier — what actually gets stored. */
  id: string;
  /** What the writer reads. */
  city: string;
  /** Disambiguates cities that share a name, and helps search. */
  region: string;
  /** Extra search terms — country names, former city names, common alternates. */
  aliases?: string[];
}

/**
 * Ordered by population and by how often a capsule is plausibly addressed
 * somewhere. Not exhaustive by design; search covers the rest.
 */
const CURATED: ZoneChoice[] = [
  { id: 'Africa/Lagos', city: 'Lagos', region: 'Nigeria', aliases: ['abuja', 'wat'] },
  { id: 'Africa/Accra', city: 'Accra', region: 'Ghana' },
  { id: 'Africa/Nairobi', city: 'Nairobi', region: 'Kenya' },
  { id: 'Africa/Cairo', city: 'Cairo', region: 'Egypt' },
  { id: 'Africa/Johannesburg', city: 'Johannesburg', region: 'South Africa', aliases: ['cape town', 'pretoria'] },
  { id: 'Africa/Casablanca', city: 'Casablanca', region: 'Morocco' },
  { id: 'Europe/London', city: 'London', region: 'United Kingdom', aliases: ['uk', 'britain', 'gmt', 'bst', 'england'] },
  { id: 'Europe/Dublin', city: 'Dublin', region: 'Ireland' },
  { id: 'Europe/Lisbon', city: 'Lisbon', region: 'Portugal' },
  { id: 'Europe/Madrid', city: 'Madrid', region: 'Spain', aliases: ['barcelona'] },
  { id: 'Europe/Paris', city: 'Paris', region: 'France', aliases: ['cet'] },
  { id: 'Europe/Brussels', city: 'Brussels', region: 'Belgium' },
  { id: 'Europe/Amsterdam', city: 'Amsterdam', region: 'Netherlands', aliases: ['holland'] },
  { id: 'Europe/Berlin', city: 'Berlin', region: 'Germany', aliases: ['munich', 'frankfurt'] },
  { id: 'Europe/Zurich', city: 'Zurich', region: 'Switzerland', aliases: ['geneva'] },
  { id: 'Europe/Rome', city: 'Rome', region: 'Italy', aliases: ['milan'] },
  { id: 'Europe/Stockholm', city: 'Stockholm', region: 'Sweden' },
  { id: 'Europe/Oslo', city: 'Oslo', region: 'Norway' },
  { id: 'Europe/Copenhagen', city: 'Copenhagen', region: 'Denmark' },
  { id: 'Europe/Warsaw', city: 'Warsaw', region: 'Poland' },
  { id: 'Europe/Athens', city: 'Athens', region: 'Greece' },
  { id: 'Europe/Istanbul', city: 'Istanbul', region: 'Türkiye', aliases: ['turkey'] },
  { id: 'Europe/Kiev', city: 'Kyiv', region: 'Ukraine', aliases: ['kiev'] },
  { id: 'Europe/Moscow', city: 'Moscow', region: 'Russia' },
  { id: 'America/New_York', city: 'New York', region: 'United States', aliases: ['nyc', 'est', 'edt', 'eastern', 'boston', 'miami', 'atlanta'] },
  { id: 'America/Chicago', city: 'Chicago', region: 'United States', aliases: ['cst', 'central', 'dallas', 'houston'] },
  { id: 'America/Denver', city: 'Denver', region: 'United States', aliases: ['mountain', 'mst'] },
  { id: 'America/Los_Angeles', city: 'Los Angeles', region: 'United States', aliases: ['la', 'pst', 'pdt', 'pacific', 'san francisco', 'seattle'] },
  { id: 'America/Phoenix', city: 'Phoenix', region: 'United States', aliases: ['arizona'] },
  { id: 'America/Anchorage', city: 'Anchorage', region: 'United States', aliases: ['alaska'] },
  { id: 'Pacific/Honolulu', city: 'Honolulu', region: 'United States', aliases: ['hawaii'] },
  { id: 'America/Toronto', city: 'Toronto', region: 'Canada', aliases: ['ottawa', 'montreal'] },
  { id: 'America/Vancouver', city: 'Vancouver', region: 'Canada' },
  { id: 'America/Mexico_City', city: 'Mexico City', region: 'Mexico' },
  { id: 'America/Bogota', city: 'Bogotá', region: 'Colombia', aliases: ['bogota'] },
  { id: 'America/Lima', city: 'Lima', region: 'Peru' },
  { id: 'America/Sao_Paulo', city: 'São Paulo', region: 'Brazil', aliases: ['sao paulo', 'rio'] },
  { id: 'America/Buenos_Aires', city: 'Buenos Aires', region: 'Argentina' },
  { id: 'America/Santiago', city: 'Santiago', region: 'Chile' },
  { id: 'Asia/Dubai', city: 'Dubai', region: 'United Arab Emirates', aliases: ['uae', 'abu dhabi'] },
  { id: 'Asia/Riyadh', city: 'Riyadh', region: 'Saudi Arabia' },
  { id: 'Asia/Jerusalem', city: 'Jerusalem', region: 'Israel', aliases: ['tel aviv'] },
  { id: 'Asia/Tehran', city: 'Tehran', region: 'Iran' },
  { id: 'Asia/Karachi', city: 'Karachi', region: 'Pakistan', aliases: ['lahore', 'islamabad'] },
  { id: 'Asia/Calcutta', city: 'Mumbai', region: 'India', aliases: ['india', 'delhi', 'bangalore', 'kolkata', 'calcutta', 'ist', 'chennai'] },
  { id: 'Asia/Dhaka', city: 'Dhaka', region: 'Bangladesh' },
  { id: 'Asia/Katmandu', city: 'Kathmandu', region: 'Nepal', aliases: ['katmandu'] },
  { id: 'Asia/Bangkok', city: 'Bangkok', region: 'Thailand' },
  { id: 'Asia/Jakarta', city: 'Jakarta', region: 'Indonesia' },
  { id: 'Asia/Singapore', city: 'Singapore', region: 'Singapore' },
  { id: 'Asia/Kuala_Lumpur', city: 'Kuala Lumpur', region: 'Malaysia' },
  { id: 'Asia/Manila', city: 'Manila', region: 'Philippines' },
  { id: 'Asia/Hong_Kong', city: 'Hong Kong', region: 'Hong Kong' },
  { id: 'Asia/Shanghai', city: 'Shanghai', region: 'China', aliases: ['beijing', 'china'] },
  { id: 'Asia/Taipei', city: 'Taipei', region: 'Taiwan' },
  { id: 'Asia/Seoul', city: 'Seoul', region: 'South Korea' },
  { id: 'Asia/Tokyo', city: 'Tokyo', region: 'Japan', aliases: ['osaka', 'jst'] },
  { id: 'Australia/Perth', city: 'Perth', region: 'Australia' },
  { id: 'Australia/Adelaide', city: 'Adelaide', region: 'Australia' },
  { id: 'Australia/Brisbane', city: 'Brisbane', region: 'Australia' },
  { id: 'Australia/Sydney', city: 'Sydney', region: 'Australia', aliases: ['melbourne', 'canberra', 'aest'] },
  { id: 'Pacific/Auckland', city: 'Auckland', region: 'New Zealand', aliases: ['wellington', 'nz'] },
  { id: 'Pacific/Fiji', city: 'Suva', region: 'Fiji' },
  { id: 'UTC', city: 'UTC', region: 'Coordinated Universal Time', aliases: ['gmt', 'zulu'] },
];

const CURATED_IDS = new Set(CURATED.map((z) => z.id));

/** Every zone the platform knows, as a fallback tier behind the curated list. */
function allZones(): ZoneChoice[] {
  let ids: string[];
  try {
    ids = Intl.supportedValuesOf('timeZone');
  } catch {
    ids = [browserZone()];
  }
  return ids
    .filter((id) => !CURATED_IDS.has(id))
    .map((id) => ({ id, city: zoneCityName(id), region: id.split('/')[0]?.replace(/_/g, ' ') ?? '' }));
}

export function zoneChoice(id: string): ZoneChoice {
  return CURATED.find((z) => z.id === id) ?? { id, city: zoneCityName(id), region: id.split('/')[0]?.replace(/_/g, ' ') ?? '' };
}

/** "Lagos · GMT+1" — what a chosen zone reads as once picked. */
export function zoneSummary(id: string, at: Date): string {
  return `${zoneChoice(id).city} · ${zoneOffsetLabel(at, id)}`;
}

function score(zone: ZoneChoice, q: string): number {
  const city = zone.city.toLowerCase();
  if (city === q) return 0;
  if (city.startsWith(q)) return 1;
  if (zone.region.toLowerCase().startsWith(q)) return 2;
  if (zone.aliases?.some((a) => a.startsWith(q))) return 3;
  if (city.includes(q)) return 4;
  if (zone.region.toLowerCase().includes(q)) return 5;
  if (zone.aliases?.some((a) => a.includes(q))) return 6;
  if (zone.id.toLowerCase().includes(q)) return 7;
  return -1;
}

/**
 * Curated matches first, then the long tail. An empty query returns the
 * curated list unchanged rather than everything, so opening the picker shows a
 * readable set instead of a wall.
 */
export function searchZones(query: string, limit = 40): ZoneChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURATED.slice(0, limit);

  const ranked = (list: ZoneChoice[]) =>
    list
      .map((z) => ({ z, s: score(z, q) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => a.s - b.s || a.z.city.localeCompare(b.z.city))
      .map((r) => r.z);

  const hits = ranked(CURATED);
  if (hits.length >= limit) return hits.slice(0, limit);
  return [...hits, ...ranked(allZones())].slice(0, limit);
}
