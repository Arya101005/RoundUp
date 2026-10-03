import { describe, expect, it } from 'vitest';
import {
  normalizeRoomCode,
  sanitizeChatBody,
  sanitizeDisplayName,
} from '@shared/validation/sanitize';

describe('sanitizeDisplayName', () => {
  it('accepts and collapses normal names', () => {
    expect(sanitizeDisplayName('  Rahul   Kumar ')).toEqual({ ok: true, value: 'Rahul Kumar' });
  });

  it('rejects names that are too short or too long', () => {
    expect(sanitizeDisplayName('A').reason).toBe('length');
    expect(sanitizeDisplayName('x'.repeat(21)).reason).toBe('length');
  });

  it('rejects markup and disallowed characters', () => {
    expect(sanitizeDisplayName('<script>alert(1)</script>').ok).toBe(false);
    expect(sanitizeDisplayName('bad"name').ok).toBe(false);
    expect(sanitizeDisplayName('emoji🎉').ok).toBe(false);
  });

  it('allows letters from any script plus basic punctuation', () => {
    expect(sanitizeDisplayName('Priya Sharma').ok).toBe(true);
    expect(sanitizeDisplayName("Arun O'Brien").ok).toBe(true);
    expect(sanitizeDisplayName('विराट कोहली').ok).toBe(true);
  });
});

describe('sanitizeChatBody', () => {
  it('trims, collapses whitespace, and strips control characters', () => {
    expect(sanitizeChatBody('  hello\u0000\u0007   world  ').value).toBe('hello world');
  });

  it('rejects empty and oversized messages', () => {
    expect(sanitizeChatBody('   ').ok).toBe(false);
    expect(sanitizeChatBody('x'.repeat(281)).reason).toBe('length');
    expect(sanitizeChatBody('x'.repeat(280)).ok).toBe(true);
  });
});

describe('normalizeRoomCode', () => {
  it('uppercases, strips, and trims to five characters', () => {
    expect(normalizeRoomCode(' ab-7kq!! ')).toBe('AB7KQ');
    expect(normalizeRoomCode('1')).toBe('1');
  });
});
