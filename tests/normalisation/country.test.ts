import { normaliseCountry } from '../../src/normalisation/country';

describe('normaliseCountry', () => {
  // ── ISO 2-letter codes returned unchanged ──────────────────────────────────
  describe('ISO 2-letter codes pass through as uppercase', () => {
    it('returns "NG" for "NG"', () => expect(normaliseCountry('NG')).toBe('NG'));
    it('returns "KE" for "KE"', () => expect(normaliseCountry('KE')).toBe('KE'));
    it('returns "GH" for "GH"', () => expect(normaliseCountry('GH')).toBe('GH'));
    it('returns "ZA" for "ZA"', () => expect(normaliseCountry('ZA')).toBe('ZA'));
    it('returns "EG" for "EG"', () => expect(normaliseCountry('EG')).toBe('EG'));
    it('returns "ET" for "ET"', () => expect(normaliseCountry('ET')).toBe('ET'));
    it('returns "RW" for "RW"', () => expect(normaliseCountry('RW')).toBe('RW'));
    it('returns "TZ" for "TZ"', () => expect(normaliseCountry('TZ')).toBe('TZ'));
    it('returns "UG" for "UG"', () => expect(normaliseCountry('UG')).toBe('UG'));
    it('returns "SN" for "SN"', () => expect(normaliseCountry('SN')).toBe('SN'));
    it('returns "CI" for "CI"', () => expect(normaliseCountry('CI')).toBe('CI'));
    it('returns "ZW" for "ZW"', () => expect(normaliseCountry('ZW')).toBe('ZW'));
    it('returns "ZM" for "ZM"', () => expect(normaliseCountry('ZM')).toBe('ZM'));
    it('returns "CM" for "CM"', () => expect(normaliseCountry('CM')).toBe('CM'));
    it('returns "MZ" for "MZ"', () => expect(normaliseCountry('MZ')).toBe('MZ'));
    it('returns "US" for "US"', () => expect(normaliseCountry('US')).toBe('US'));
    it('returns "GB" for "GB"', () => expect(normaliseCountry('GB')).toBe('GB'));
    it('returns "CA" for "CA"', () => expect(normaliseCountry('CA')).toBe('CA'));
    it('returns "DE" for "DE"', () => expect(normaliseCountry('DE')).toBe('DE'));
    it('returns "FR" for "FR"', () => expect(normaliseCountry('FR')).toBe('FR'));
    it('returns "AE" for "AE"', () => expect(normaliseCountry('AE')).toBe('AE'));
    it('returns "IN" for "IN"', () => expect(normaliseCountry('IN')).toBe('IN'));
    it('returns "CN" for "CN"', () => expect(normaliseCountry('CN')).toBe('CN'));
    it('returns "BR" for "BR"', () => expect(normaliseCountry('BR')).toBe('BR'));
    it('returns "NL" for "NL"', () => expect(normaliseCountry('NL')).toBe('NL'));
    it('returns "SE" for "SE"', () => expect(normaliseCountry('SE')).toBe('SE'));
    it('returns "SG" for "SG"', () => expect(normaliseCountry('SG')).toBe('SG'));
  });

  // ── Africa alias mappings ───────────────────────────────────────────────────
  describe('Africa alias mappings', () => {
    it('maps "nigeria" → "NG"', () => expect(normaliseCountry('nigeria')).toBe('NG'));
    it('maps "kenya" → "KE"', () => expect(normaliseCountry('kenya')).toBe('KE'));
    it('maps "ghana" → "GH"', () => expect(normaliseCountry('ghana')).toBe('GH'));
    it('maps "south africa" → "ZA"', () => expect(normaliseCountry('south africa')).toBe('ZA'));
    it('maps "egypt" → "EG"', () => expect(normaliseCountry('egypt')).toBe('EG'));
    it('maps "ethiopia" → "ET"', () => expect(normaliseCountry('ethiopia')).toBe('ET'));
    it('maps "rwanda" → "RW"', () => expect(normaliseCountry('rwanda')).toBe('RW'));
    it('maps "tanzania" → "TZ"', () => expect(normaliseCountry('tanzania')).toBe('TZ'));
    it('maps "uganda" → "UG"', () => expect(normaliseCountry('uganda')).toBe('UG'));
    it('maps "senegal" → "SN"', () => expect(normaliseCountry('senegal')).toBe('SN'));
    it('maps "ivory coast" → "CI"', () => expect(normaliseCountry('ivory coast')).toBe('CI'));
    it('maps "cote d\'ivoire" → "CI"', () => expect(normaliseCountry("cote d'ivoire")).toBe('CI'));
    it('maps "côte d\'ivoire" → "CI"', () => expect(normaliseCountry("côte d'ivoire")).toBe('CI'));
    it('maps "zimbabwe" → "ZW"', () => expect(normaliseCountry('zimbabwe')).toBe('ZW'));
    it('maps "zambia" → "ZM"', () => expect(normaliseCountry('zambia')).toBe('ZM'));
    it('maps "cameroon" → "CM"', () => expect(normaliseCountry('cameroon')).toBe('CM'));
    it('maps "mozambique" → "MZ"', () => expect(normaliseCountry('mozambique')).toBe('MZ'));
  });

  // ── Global / diaspora alias mappings ───────────────────────────────────────
  describe('Global / diaspora alias mappings', () => {
    it('maps "united states" → "US"', () => expect(normaliseCountry('united states')).toBe('US'));
    it('maps "usa" → "US"', () => expect(normaliseCountry('usa')).toBe('US'));
    it('maps "united states of america" → "US"', () => expect(normaliseCountry('united states of america')).toBe('US'));
    it('maps "united kingdom" → "GB"', () => expect(normaliseCountry('united kingdom')).toBe('GB'));
    it('maps "uk" → "GB"', () => expect(normaliseCountry('uk')).toBe('GB'));
    it('maps "great britain" → "GB"', () => expect(normaliseCountry('great britain')).toBe('GB'));
    it('maps "canada" → "CA"', () => expect(normaliseCountry('canada')).toBe('CA'));
    it('maps "germany" → "DE"', () => expect(normaliseCountry('germany')).toBe('DE'));
    it('maps "france" → "FR"', () => expect(normaliseCountry('france')).toBe('FR'));
    it('maps "uae" → "AE"', () => expect(normaliseCountry('uae')).toBe('AE'));
    it('maps "united arab emirates" → "AE"', () => expect(normaliseCountry('united arab emirates')).toBe('AE'));
    it('maps "india" → "IN"', () => expect(normaliseCountry('india')).toBe('IN'));
    it('maps "china" → "CN"', () => expect(normaliseCountry('china')).toBe('CN'));
    it('maps "brazil" → "BR"', () => expect(normaliseCountry('brazil')).toBe('BR'));
    it('maps "netherlands" → "NL"', () => expect(normaliseCountry('netherlands')).toBe('NL'));
    it('maps "sweden" → "SE"', () => expect(normaliseCountry('sweden')).toBe('SE'));
    it('maps "singapore" → "SG"', () => expect(normaliseCountry('singapore')).toBe('SG'));
  });

  // ── Case insensitivity ──────────────────────────────────────────────────────
  describe('case insensitivity', () => {
    it('maps "Nigeria" (title case) → "NG"', () => expect(normaliseCountry('Nigeria')).toBe('NG'));
    it('maps "NIGERIA" (upper) → "NG"', () => expect(normaliseCountry('NIGERIA')).toBe('NG'));
    it('maps "nIgErIa" (mixed) → "NG"', () => expect(normaliseCountry('nIgErIa')).toBe('NG'));
    it('maps "ng" (lowercase ISO) → "NG"', () => expect(normaliseCountry('ng')).toBe('NG'));
    it('maps "Ke" (mixed ISO) → "KE"', () => expect(normaliseCountry('Ke')).toBe('KE'));
    it('maps "UK" (uppercase alias) → "GB"', () => expect(normaliseCountry('UK')).toBe('GB'));
    it('maps "Ivory Coast" (title case) → "CI"', () => expect(normaliseCountry('Ivory Coast')).toBe('CI'));
    it('maps "South Africa" (title case) → "ZA"', () => expect(normaliseCountry('South Africa')).toBe('ZA'));
    it('maps "United States" (title case) → "US"', () => expect(normaliseCountry('United States')).toBe('US'));
    it('maps "USA" (uppercase alias) → "US"', () => expect(normaliseCountry('USA')).toBe('US'));
  });

  // ── Whitespace handling ─────────────────────────────────────────────────────
  describe('whitespace handling', () => {
    it('trims leading/trailing whitespace: "  NG  " → "NG"', () => expect(normaliseCountry('  NG  ')).toBe('NG'));
    it('trims leading/trailing whitespace: "  nigeria  " → "NG"', () => expect(normaliseCountry('  nigeria  ')).toBe('NG'));
    it('trims leading/trailing whitespace: "  south africa  " → "ZA"', () => expect(normaliseCountry('  south africa  ')).toBe('ZA'));
    it('returns null for whitespace-only string "   "', () => expect(normaliseCountry('   ')).toBeNull());
    it('returns null for empty string ""', () => expect(normaliseCountry('')).toBeNull());
  });

  // ── Invalid / unrecognised inputs ───────────────────────────────────────────
  describe('invalid and unrecognised inputs', () => {
    it('returns null for unrecognised country "Narnia"', () => expect(normaliseCountry('Narnia')).toBeNull());
    it('returns null for unrecognised string "atlantis"', () => expect(normaliseCountry('atlantis')).toBeNull());
    it('returns null for partial match "nig"', () => expect(normaliseCountry('nig')).toBeNull());
    it('returns null for partial match "united"', () => expect(normaliseCountry('united')).toBeNull());
    it('returns null for null input', () => expect(normaliseCountry(null)).toBeNull());
    it('returns null for undefined input', () => expect(normaliseCountry(undefined)).toBeNull());
    it('returns null for numeric input 42', () => expect(normaliseCountry(42)).toBeNull());
    it('returns null for numeric input 0', () => expect(normaliseCountry(0)).toBeNull());
    it('returns null for object input {}', () => expect(normaliseCountry({})).toBeNull());
    it('returns null for array input []', () => expect(normaliseCountry([])).toBeNull());
    it('returns null for boolean true', () => expect(normaliseCountry(true)).toBeNull());
    it('returns null for boolean false', () => expect(normaliseCountry(false)).toBeNull());
  });
});
