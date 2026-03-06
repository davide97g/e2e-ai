import { describe, test, expect } from 'bun:test';
import { interpolate } from '../../src/utils/template.ts';

describe('interpolate', () => {
  test('replaces known variables', () => {
    expect(interpolate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  test('replaces multiple variables', () => {
    const result = interpolate('{{greeting}} {{name}}', { greeting: 'Hi', name: 'Alice' });
    expect(result).toBe('Hi Alice');
  });

  test('preserves unmatched placeholders', () => {
    expect(interpolate('{{known}} and {{unknown}}', { known: 'yes' })).toBe('yes and {{unknown}}');
  });

  test('handles template with no placeholders', () => {
    expect(interpolate('plain text', { key: 'val' })).toBe('plain text');
  });

  test('handles empty variables object', () => {
    expect(interpolate('{{a}} {{b}}', {})).toBe('{{a}} {{b}}');
  });

  test('replaces same variable multiple times', () => {
    expect(interpolate('{{x}} + {{x}}', { x: '1' })).toBe('1 + 1');
  });

  test('handles empty string value', () => {
    expect(interpolate('before {{v}} after', { v: '' })).toBe('before  after');
  });

  test('ignores non-word characters in braces', () => {
    expect(interpolate('{{foo-bar}}', { 'foo-bar': 'nope' })).toBe('{{foo-bar}}');
  });
});
