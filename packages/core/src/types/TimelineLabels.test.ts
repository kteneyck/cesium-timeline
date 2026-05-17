import { describe, it, expect } from 'vitest';
import { resolveLabel, DEFAULT_LABELS, TimelineLabels } from './TimelineLabels';

// ── resolveLabel ──────────────────────────────────────────────────────────────

describe('resolveLabel', () => {
  it('returns a static string as-is', () => {
    expect(resolveLabel('Play', 1)).toBe('Play');
  });

  it('calls a function with the multiplier and returns the result', () => {
    const fn = (n: number) => `${n}× speed`;
    expect(resolveLabel(fn, 4)).toBe('4× speed');
  });

  it('calls the function with different multipliers', () => {
    const fn = (n: number) => `${n}×`;
    expect(resolveLabel(fn, 1)).toBe('1×');
    expect(resolveLabel(fn, 8)).toBe('8×');
  });
});

// ── DEFAULT_LABELS completeness ───────────────────────────────────────────────

const REQUIRED_KEYS: (keyof TimelineLabels)[] = [
  'dateTimeClickTooltip',
  'liveLabel', 'liveActiveLabel', 'liveTooltip', 'liveActiveTooltip',
  'resetSpeedTooltip',
  'jumpToStartTooltip', 'noStartTimeTooltip', 'jumpToEndTooltip', 'noEndTimeTooltip',
  'rewindTooltip', 'rewindActiveTooltip',
  'playTooltip', 'playFromRewindTooltip', 'pauseTooltip',
  'fastForwardTooltip', 'fastForwardActiveTooltip',
  'collapseSwimLanesTooltip', 'expandSwimLanesTooltip',
  'months',
];

describe('DEFAULT_LABELS', () => {
  it.each(REQUIRED_KEYS)('has key "%s"', (key) => {
    expect(DEFAULT_LABELS[key]).toBeDefined();
  });

  it('months tuple has exactly 12 entries', () => {
    expect(DEFAULT_LABELS.months).toHaveLength(12);
  });

  it('months entries are non-empty strings', () => {
    DEFAULT_LABELS.months.forEach((m) => {
      expect(typeof m).toBe('string');
      expect(m.length).toBeGreaterThan(0);
    });
  });

  it('dynamic tooltip functions work with sample values', () => {
    expect(resolveLabel(DEFAULT_LABELS.rewindActiveTooltip, 4)).toContain('4');
    expect(resolveLabel(DEFAULT_LABELS.fastForwardActiveTooltip, 8)).toContain('8');
  });

  it('static label fields are non-empty strings', () => {
    const staticKeys = REQUIRED_KEYS.filter((k) => k !== 'rewindActiveTooltip' && k !== 'fastForwardActiveTooltip' && k !== 'months') as (keyof TimelineLabels)[];
    staticKeys.forEach((key) => {
      const val = DEFAULT_LABELS[key];
      expect(typeof val).toBe('string');
      expect((val as string).length).toBeGreaterThan(0);
    });
  });
});

// ── Partial override merge ────────────────────────────────────────────────────

describe('DEFAULT_LABELS partial override', () => {
  it('merging a partial override preserves unset keys', () => {
    const overrides: Partial<TimelineLabels> = {
      playTooltip: 'Lecture',
      pauseTooltip: 'Pause',
    };
    const merged = { ...DEFAULT_LABELS, ...overrides };
    expect(merged.playTooltip).toBe('Lecture');
    expect(merged.pauseTooltip).toBe('Pause');
    // unset keys remain at defaults
    expect(merged.liveLabel).toBe(DEFAULT_LABELS.liveLabel);
    expect(merged.months).toBe(DEFAULT_LABELS.months);
  });

  it('can override months with custom translations', () => {
    const fr: TimelineLabels['months'] = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const merged = { ...DEFAULT_LABELS, months: fr };
    expect(merged.months[1]).toBe('Fév');
    expect(merged.months[7]).toBe('Aoû');
    expect(merged.liveLabel).toBe(DEFAULT_LABELS.liveLabel);
  });
});
