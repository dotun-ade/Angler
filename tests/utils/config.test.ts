import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '../../src/config/index';
import { isValidProduct, ANCHOR_PRODUCTS } from '../../src/config/products';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempConfig(content: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'angler-config-test-'));
  const filePath = path.join(dir, 'angler.json');
  fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content));
  return filePath;
}

const MINIMAL_SOURCES = {
  sources: { editorial: [], googleNews: [] },
};

const FULL_CONFIG = {
  sources: {
    editorial: [{ url: 'https://example.com/feed', name: 'Example', priority: 1 }],
    googleNews: [{ url: 'https://news.example.com/feed', name: 'GNews: Example', priority: 2 }],
  },
  pipeline: { extractionBatchSize: 50, scoringBatchSize: 10, maxArticlesPerRun: 100 },
  gemini: { model: 'gemini-2.0-flash', dailyCallLimit: 30, requestsPerMinute: 10 },
  dedup: { similarityThreshold: 0.9, seenCompanyTtlDays: 60 },
  scoring: { minConfidence: 'HIGH' as const },
};

// ---------------------------------------------------------------------------
// loadConfig — valid configs
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  describe('valid configs', () => {
    it('returns config with defaults when only sources are provided', () => {
      const filePath = writeTempConfig(MINIMAL_SOURCES);
      const config = loadConfig(filePath);

      expect(config.sources.editorial).toEqual([]);
      expect(config.sources.googleNews).toEqual([]);

      // pipeline defaults
      expect(config.pipeline.extractionBatchSize).toBe(30);
      expect(config.pipeline.scoringBatchSize).toBe(15);
      expect(config.pipeline.maxArticlesPerRun).toBe(200);

      // gemini defaults
      expect(config.gemini.model).toBe('gemini-2.5-flash');
      expect(config.gemini.dailyCallLimit).toBe(20);
      expect(config.gemini.requestsPerMinute).toBe(5);

      // dedup defaults
      expect(config.dedup.similarityThreshold).toBe(0.8);
      expect(config.dedup.seenCompanyTtlDays).toBe(30);

      // scoring defaults
      expect(config.scoring.minConfidence).toBe('MEDIUM');
    });

    it('returns full config when all fields are provided', () => {
      const filePath = writeTempConfig(FULL_CONFIG);
      const config = loadConfig(filePath);

      expect(config.pipeline.extractionBatchSize).toBe(50);
      expect(config.pipeline.scoringBatchSize).toBe(10);
      expect(config.pipeline.maxArticlesPerRun).toBe(100);
      expect(config.gemini.model).toBe('gemini-2.0-flash');
      expect(config.gemini.dailyCallLimit).toBe(30);
      expect(config.gemini.requestsPerMinute).toBe(10);
      expect(config.dedup.similarityThreshold).toBe(0.9);
      expect(config.dedup.seenCompanyTtlDays).toBe(60);
      expect(config.scoring.minConfidence).toBe('HIGH');
    });

    it('merges partial pipeline — only extractionBatchSize set, other fields use defaults', () => {
      const filePath = writeTempConfig({
        sources: MINIMAL_SOURCES.sources,
        pipeline: { extractionBatchSize: 50 },
      });
      const config = loadConfig(filePath);

      expect(config.pipeline.extractionBatchSize).toBe(50);
      expect(config.pipeline.scoringBatchSize).toBe(15);   // default
      expect(config.pipeline.maxArticlesPerRun).toBe(200); // default
    });

    it('default extractionBatchSize is 30', () => {
      const filePath = writeTempConfig(MINIMAL_SOURCES);
      const config = loadConfig(filePath);
      expect(config.pipeline.extractionBatchSize).toBe(30);
    });

    it('default scoringBatchSize is 15', () => {
      const filePath = writeTempConfig(MINIMAL_SOURCES);
      const config = loadConfig(filePath);
      expect(config.pipeline.scoringBatchSize).toBe(15);
    });

    it('default dailyCallLimit is 20', () => {
      const filePath = writeTempConfig(MINIMAL_SOURCES);
      const config = loadConfig(filePath);
      expect(config.gemini.dailyCallLimit).toBe(20);
    });

    it('accepts scoring.minConfidence HIGH', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        scoring: { minConfidence: 'HIGH' },
      });
      const config = loadConfig(filePath);
      expect(config.scoring.minConfidence).toBe('HIGH');
    });

    it('accepts scoring.minConfidence MEDIUM', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        scoring: { minConfidence: 'MEDIUM' },
      });
      const config = loadConfig(filePath);
      expect(config.scoring.minConfidence).toBe('MEDIUM');
    });
  });

  // ---------------------------------------------------------------------------
  // loadConfig — invalid / missing file
  // ---------------------------------------------------------------------------

  describe('file errors', () => {
    it('throws with "not found" when file does not exist', () => {
      expect(() => loadConfig('/tmp/does-not-exist-angler-12345.json')).toThrow(/not found/i);
    });

    it('throws with "not valid JSON" when file contains invalid JSON', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'angler-config-test-'));
      const filePath = path.join(dir, 'angler.json');
      fs.writeFileSync(filePath, '{ this is not json }');
      expect(() => loadConfig(filePath)).toThrow(/not valid JSON/i);
    });
  });

  // ---------------------------------------------------------------------------
  // loadConfig — missing required fields
  // ---------------------------------------------------------------------------

  describe('missing required fields', () => {
    it('throws with "sources" when sources field is missing', () => {
      const filePath = writeTempConfig({ pipeline: { extractionBatchSize: 30 } });
      expect(() => loadConfig(filePath)).toThrow(/sources/i);
    });

    it('throws with "sources.editorial" when sources.editorial is missing', () => {
      const filePath = writeTempConfig({ sources: { googleNews: [] } });
      expect(() => loadConfig(filePath)).toThrow(/sources\.editorial/i);
    });

    it('throws when sources.googleNews is not an array', () => {
      const filePath = writeTempConfig({ sources: { editorial: [], googleNews: 'not-array' } });
      expect(() => loadConfig(filePath)).toThrow(/sources\.googleNews/i);
    });

    it('throws when config is not an object (is an array)', () => {
      const filePath = writeTempConfig([1, 2, 3]);
      expect(() => loadConfig(filePath)).toThrow();
    });

    it('throws when config is a string', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'angler-config-test-'));
      const filePath = path.join(dir, 'angler.json');
      fs.writeFileSync(filePath, '"just a string"');
      expect(() => loadConfig(filePath)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // loadConfig — invalid field values
  // ---------------------------------------------------------------------------

  describe('invalid field values', () => {
    it('throws when pipeline.extractionBatchSize is 0 (not positive)', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        pipeline: { extractionBatchSize: 0 },
      });
      expect(() => loadConfig(filePath)).toThrow(/extractionBatchSize/i);
    });

    it('throws when pipeline.extractionBatchSize is negative', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        pipeline: { extractionBatchSize: -5 },
      });
      expect(() => loadConfig(filePath)).toThrow(/extractionBatchSize/i);
    });

    it('throws when gemini.dailyCallLimit is 0 (not positive)', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        gemini: { dailyCallLimit: 0 },
      });
      expect(() => loadConfig(filePath)).toThrow(/dailyCallLimit/i);
    });

    it('throws when dedup.similarityThreshold is 1.5 (out of range)', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        dedup: { similarityThreshold: 1.5 },
      });
      expect(() => loadConfig(filePath)).toThrow(/similarityThreshold/i);
    });

    it('throws when dedup.similarityThreshold is negative', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        dedup: { similarityThreshold: -0.1 },
      });
      expect(() => loadConfig(filePath)).toThrow(/similarityThreshold/i);
    });

    it('throws when scoring.minConfidence is "VERY_HIGH"', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        scoring: { minConfidence: 'VERY_HIGH' },
      });
      expect(() => loadConfig(filePath)).toThrow(/minConfidence/i);
    });

    it('throws when scoring.minConfidence is "LOW"', () => {
      const filePath = writeTempConfig({
        ...MINIMAL_SOURCES,
        scoring: { minConfidence: 'LOW' },
      });
      expect(() => loadConfig(filePath)).toThrow(/minConfidence/i);
    });
  });
});

// ---------------------------------------------------------------------------
// isValidProduct
// ---------------------------------------------------------------------------

describe('isValidProduct', () => {
  it('returns true for "Payments"', () => {
    expect(isValidProduct('Payments')).toBe(true);
  });

  it('returns true for "BaaS"', () => {
    expect(isValidProduct('BaaS')).toBe(true);
  });

  it('returns true for "Cards"', () => {
    expect(isValidProduct('Cards')).toBe(true);
  });

  it('returns true for "Global Services"', () => {
    expect(isValidProduct('Global Services')).toBe(true);
  });

  it('returns false for "Virtual Accounts" (removed product)', () => {
    expect(isValidProduct('Virtual Accounts')).toBe(false);
  });

  it('returns false for "Business Banking" (removed product)', () => {
    expect(isValidProduct('Business Banking')).toBe(false);
  });

  it('returns true for "Digizone"', () => {
    expect(isValidProduct('Digizone')).toBe(true);
  });

  it('returns false for "payments" (case sensitive)', () => {
    expect(isValidProduct('payments')).toBe(false);
  });

  it('returns false for "InvalidProduct"', () => {
    expect(isValidProduct('InvalidProduct')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidProduct(null)).toBe(false);
  });

  it('returns false for a number (123)', () => {
    expect(isValidProduct(123)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidProduct(undefined)).toBe(false);
  });

  it('returns false for an object', () => {
    expect(isValidProduct({ name: 'Payments' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ANCHOR_PRODUCTS — 5 products (Virtual Accounts + Business Banking removed)
// ---------------------------------------------------------------------------

describe('ANCHOR_PRODUCTS', () => {
  it('contains exactly 5 products', () => {
    expect(ANCHOR_PRODUCTS).toHaveLength(5);
  });

  it('all 5 products pass isValidProduct', () => {
    for (const product of ANCHOR_PRODUCTS) {
      expect(isValidProduct(product)).toBe(true);
    }
  });
});
