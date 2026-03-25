/**
 * Maps a raw country string to an ISO 3166-1 alpha-2 code.
 *
 * The lookup is case-insensitive and trims surrounding whitespace.
 * Returns null for any input that is not a non-empty string or is not
 * found in the alias map.
 */
const ALIAS_MAP: Record<string, string> = {
  // ── Africa ──────────────────────────────────────────────────────────────────
  nigeria: 'NG',
  ng: 'NG',
  kenya: 'KE',
  ke: 'KE',
  ghana: 'GH',
  gh: 'GH',
  'south africa': 'ZA',
  za: 'ZA',
  egypt: 'EG',
  eg: 'EG',
  ethiopia: 'ET',
  et: 'ET',
  rwanda: 'RW',
  rw: 'RW',
  tanzania: 'TZ',
  tz: 'TZ',
  uganda: 'UG',
  ug: 'UG',
  senegal: 'SN',
  sn: 'SN',
  'ivory coast': 'CI',
  "cote d'ivoire": 'CI',
  "côte d'ivoire": 'CI',
  ci: 'CI',
  zimbabwe: 'ZW',
  zw: 'ZW',
  zambia: 'ZM',
  zm: 'ZM',
  cameroon: 'CM',
  cm: 'CM',
  mozambique: 'MZ',
  mz: 'MZ',

  // ── Global / diaspora ────────────────────────────────────────────────────────
  'united states': 'US',
  usa: 'US',
  'united states of america': 'US',
  us: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  gb: 'GB',
  'great britain': 'GB',
  canada: 'CA',
  ca: 'CA',
  germany: 'DE',
  de: 'DE',
  france: 'FR',
  fr: 'FR',
  uae: 'AE',
  'united arab emirates': 'AE',
  ae: 'AE',
  india: 'IN',
  in: 'IN',
  china: 'CN',
  cn: 'CN',
  brazil: 'BR',
  br: 'BR',
  netherlands: 'NL',
  nl: 'NL',
  sweden: 'SE',
  se: 'SE',
  singapore: 'SG',
  sg: 'SG',
};

export function normaliseCountry(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const key = trimmed.toLowerCase();
  return ALIAS_MAP[key] ?? null;
}
