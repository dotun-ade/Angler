import { IcpCriteria } from '../clients/gemini';
import { logWarn } from './logger';

export interface IcpDiff {
  added_geographies: string[];
  removed_geographies: string[];
  added_industries: string[];
  removed_industries: string[];
  added_signals: string[];
  removed_signals: string[];
  added_stage_signals: string[];
  removed_stage_signals: string[];
}

function arrayDiff(current: string[], previous: string[]): { added: string[]; removed: string[] } {
  const cur = new Set(current.map((s) => s.toLowerCase().trim()));
  const prev = new Set(previous.map((s) => s.toLowerCase().trim()));
  return {
    added: current.filter((s) => !prev.has(s.toLowerCase().trim())),
    removed: previous.filter((s) => !cur.has(s.toLowerCase().trim())),
  };
}

/**
 * Compare the current ICP to the previous run's ICP.
 * Returns null if there is no material change, or a diff object if something
 * changed (new/removed geographies, industries, signals, or stage signals).
 */
export function detectIcpDrift(
  current: IcpCriteria,
  previous: IcpCriteria | undefined,
): IcpDiff | null {
  if (!previous) return null;

  const geos = arrayDiff(current.target_geographies, previous.target_geographies);
  const inds = arrayDiff(current.target_industries, previous.target_industries);
  const sigs = arrayDiff(current.product_signals, previous.product_signals);
  const stages = arrayDiff(current.stage_signals, previous.stage_signals);

  const hasDrift =
    geos.added.length > 0 ||
    geos.removed.length > 0 ||
    inds.added.length > 0 ||
    inds.removed.length > 0 ||
    sigs.added.length > 0 ||
    sigs.removed.length > 0 ||
    stages.added.length > 0 ||
    stages.removed.length > 0;

  if (!hasDrift) return null;

  return {
    added_geographies: geos.added,
    removed_geographies: geos.removed,
    added_industries: inds.added,
    removed_industries: inds.removed,
    added_signals: sigs.added,
    removed_signals: sigs.removed,
    added_stage_signals: stages.added,
    removed_stage_signals: stages.removed,
  };
}

/**
 * Check for ICP drift and log a structured warning if drift is detected.
 * Safe to call with undefined previous — returns silently.
 */
export function checkAndLogIcpDrift(
  current: IcpCriteria,
  previous: IcpCriteria | undefined,
): void {
  const diff = detectIcpDrift(current, previous);
  if (diff) {
    logWarn('ICP drift detected — Snapper criteria changed since last run', { diff });
  }
}
