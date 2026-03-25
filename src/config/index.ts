import path from 'path';
import fs from 'fs';
import { AnglerConfig } from './config.schema';
import { CONFIG_DEFAULTS } from './defaults';

export function loadConfig(configPath?: string): AnglerConfig {
  const filePath = configPath ?? path.join(process.cwd(), 'config', 'angler.json');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}. Create config/angler.json.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    throw new Error(`Config file is not valid JSON: ${filePath}`);
  }

  return validateAndMerge(raw);
}

function validateAndMerge(raw: unknown): AnglerConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config must be a JSON object');
  }

  const cfg = raw as Record<string, unknown>;

  // sources is required (no default)
  if (!cfg.sources || typeof cfg.sources !== 'object') {
    throw new Error('Config missing required field: sources');
  }

  const sources = cfg.sources as Record<string, unknown>;
  if (!Array.isArray(sources.editorial)) {
    throw new Error('Config missing required field: sources.editorial (must be array)');
  }
  if (!Array.isArray(sources.googleNews)) {
    throw new Error('Config missing required field: sources.googleNews (must be array)');
  }

  // Merge with defaults for optional fields
  const pipeline = { ...CONFIG_DEFAULTS.pipeline, ...(cfg.pipeline as object ?? {}) };
  const gemini = { ...CONFIG_DEFAULTS.gemini, ...(cfg.gemini as object ?? {}) };
  const dedup = { ...CONFIG_DEFAULTS.dedup, ...(cfg.dedup as object ?? {}) };
  const scoring = { ...CONFIG_DEFAULTS.scoring, ...(cfg.scoring as object ?? {}) };

  // Validate types
  if (typeof pipeline.extractionBatchSize !== 'number' || pipeline.extractionBatchSize < 1) {
    throw new Error('Config: pipeline.extractionBatchSize must be a positive number');
  }
  if (typeof gemini.dailyCallLimit !== 'number' || gemini.dailyCallLimit < 1) {
    throw new Error('Config: gemini.dailyCallLimit must be a positive number');
  }
  if (typeof dedup.similarityThreshold !== 'number' || dedup.similarityThreshold < 0 || dedup.similarityThreshold > 1) {
    throw new Error('Config: dedup.similarityThreshold must be a number between 0 and 1');
  }
  const minConfidence = scoring.minConfidence as unknown;
  if (minConfidence !== 'HIGH' && minConfidence !== 'MEDIUM') {
    throw new Error('Config: scoring.minConfidence must be "HIGH" or "MEDIUM"');
  }

  return {
    sources: {
      editorial: sources.editorial as AnglerConfig['sources']['editorial'],
      googleNews: sources.googleNews as AnglerConfig['sources']['googleNews'],
    },
    pipeline,
    gemini,
    dedup,
    scoring,
  };
}
