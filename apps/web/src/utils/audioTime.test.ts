import { describe, expect, it } from 'vitest';
import { durationLabelToSeconds, formatDuration } from './audioTime';

describe('audio time', () => {
  it('round-trips a measured m:ss podcast duration', () => {
    expect(formatDuration(95)).toBe('1:35');
    expect(durationLabelToSeconds('1:35')).toBe(95);
  });
});
