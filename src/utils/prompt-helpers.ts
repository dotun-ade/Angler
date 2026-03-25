/**
 * prompt-helpers.ts
 *
 * Utility functions that produce formatted prompt strings for Gemini-based
 * classification and scoring.  Canonical values must stay in sync with the
 * normalisation module (src/normalisation/industry.ts, product.ts).
 */

// ──────────────────────────────────────────────────────────────────────────────
// industryPromptList
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a formatted bullet list of the 12 canonical industries with
 * disambiguation descriptions, ready to be embedded in a Gemini prompt.
 *
 * Canonical values match what normaliseIndustry() returns.
 */
export function industryPromptList(): string {
  const entries: Array<[string, string]> = [
    [
      'Fintech',
      'payments, lending, banking, insurance, investment platforms, neobanks, digital banking',
    ],
    [
      'SaaS & Tech',
      'business software, developer tools, SaaS products, cloud platforms, IT services',
    ],
    [
      'Web3',
      'blockchain, crypto, NFT, DeFi, tokenisation platforms, cryptocurrency exchanges',
    ],
    [
      'Retail & E-Commerce',
      'online stores, marketplaces, e-commerce infrastructure, B2C platforms, retail',
    ],
    [
      'HR',
      'HR software, payroll, recruitment, workforce management, hrtech',
    ],
    [
      'Gaming',
      'mobile games, gaming platforms, esports, game development studios',
    ],
    [
      'PropTech',
      'real estate, property management, construction tech, property listing platforms',
    ],
    [
      'Healthcare',
      'health tech, telemedicine, medical devices, pharma tech, medtech, healthtech',
    ],
    [
      'Utilities',
      'energy, water, electricity, infrastructure tech, utility providers',
    ],
    [
      'Travel & Mobility',
      'transport, logistics, travel booking, mobility platforms, ride-hailing',
    ],
    [
      'Education',
      'edtech, online learning, skill development, e-learning platforms',
    ],
    [
      'Trad. Finance',
      'traditional banks, insurance companies, stock exchanges, asset management, capital markets',
    ],
  ];

  return entries.map(([key, desc]) => `- ${key} (${desc})`).join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// countryPromptList
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a formatted string of ISO country codes grouped by region, for use
 * in Gemini prompts asking the model to classify a company's country.
 */
export function countryPromptList(): string {
  const regions: Array<[string, string[]]> = [
    ['West Africa', ['NG', 'GH', 'SN', 'CI', 'BJ', 'ML', 'TG', 'GN', 'SL', 'LR', 'GM', 'NE', 'BF']],
    ['East Africa', ['KE', 'TZ', 'UG', 'ET', 'RW', 'SS', 'SD', 'DJ', 'ER', 'SO']],
    ['North Africa', ['EG', 'MA', 'TN', 'DZ', 'LY']],
    ['Southern Africa', ['ZA', 'ZW', 'ZM', 'MZ', 'BW', 'NA', 'MW', 'LS', 'SZ']],
    ['Central Africa', ['CM', 'CD', 'AO', 'GA', 'CG', 'TD', 'CF']],
    ['Middle East', ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'JO', 'IL']],
    ['UK/Europe', ['GB', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'ES', 'IT']],
    ['North America', ['US', 'CA']],
    ['Other', ['Other']],
  ];

  return regions
    .map(([region, codes]) => `- ${region}: ${codes.join(', ')}`)
    .join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// productPromptList
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a formatted bullet list of Anchor's 5 products with use-case
 * descriptions for scoring prompts.
 *
 * Canonical values match what normaliseProduct() returns.
 */
export function productPromptList(): string {
  const entries: Array<[string, string]> = [
    [
      'Payments',
      'African fintechs disbursing or collecting payments, gig platforms, wallets, lending apps. Global companies paying workers or customers in Africa.',
    ],
    [
      'BaaS',
      'Fintechs building neobanks, wallets, or financial super-apps on banking infrastructure.',
    ],
    [
      'Cards',
      'Companies in Nigeria, Ghana, Ethiopia, Zimbabwe, Egypt wanting virtual dollar cards. African companies paying international vendors.',
    ],
    [
      'Global Services',
      'Remittance companies sending money to Africa. Import/export businesses needing African currency settlement.',
    ],
    [
      'Digizone',
      'Digital goods platforms, airtime/data resellers, utility bill payment platforms.',
    ],
  ];

  return entries.map(([key, desc]) => `- ${key}: ${desc}`).join('\n');
}
