import { describe, test, expect } from 'bun:test';
import { extractJSON, extractYAML, extractCode } from '../../src/agents/parseResponse.ts';

describe('extractJSON', () => {
  test('returns valid JSON as-is', () => {
    expect(extractJSON('{"key":"value"}')).toBe('{"key":"value"}');
  });

  test('trims whitespace before parsing', () => {
    expect(extractJSON('  {"a":1}  ')).toBe('{"a":1}');
  });

  test('extracts JSON from markdown code fence', () => {
    const input = 'Here is the result:\n```json\n{"name":"test"}\n```\nDone.';
    expect(extractJSON(input)).toBe('{"name":"test"}');
  });

  test('extracts JSON from fence without language tag', () => {
    const input = '```\n[1,2,3]\n```';
    expect(extractJSON(input)).toBe('[1,2,3]');
  });

  test('extracts first { ... } block from prose', () => {
    const input = 'The result is: {"status":"ok"} as expected.';
    expect(extractJSON(input)).toBe('{"status":"ok"}');
  });

  test('extracts [ ... ] array from prose', () => {
    const input = 'Here: [1, 2, 3] end.';
    expect(extractJSON(input)).toBe('[1, 2, 3]');
  });

  test('throws actionable error when no JSON found', () => {
    expect(() => extractJSON('no json here at all')).toThrow(
      /Could not extract JSON.*First 200 chars/,
    );
  });

  test('error includes first 200 chars of content', () => {
    const long = 'x'.repeat(300);
    try {
      extractJSON(long);
    } catch (e: any) {
      expect(e.message).toContain('x'.repeat(200));
      expect(e.message).not.toContain('x'.repeat(201));
    }
  });

  test('handles nested JSON objects', () => {
    const nested = '{"a":{"b":{"c":1}}}';
    expect(extractJSON(nested)).toBe(nested);
  });

  test('handles JSON with newlines inside fence', () => {
    const input = '```json\n{\n  "key": "value"\n}\n```';
    expect(JSON.parse(extractJSON(input))).toEqual({ key: 'value' });
  });
});

describe('extractYAML', () => {
  test('extracts from yaml code fence', () => {
    const input = '```yaml\nname: test\nsteps:\n  - one\n```';
    expect(extractYAML(input)).toBe('name: test\nsteps:\n  - one');
  });

  test('extracts from yml code fence', () => {
    const input = '```yml\nkey: value\n```';
    expect(extractYAML(input)).toBe('key: value');
  });

  test('returns as-is when starts with YAML key', () => {
    const input = 'name: my scenario\nsteps:\n  - step1';
    expect(extractYAML(input)).toBe(input);
  });

  test('finds name: block after prose', () => {
    const input = 'Here is the scenario:\n\nname: Login\nsteps:\n  - Navigate';
    expect(extractYAML(input)).toContain('name: Login');
  });

  test('returns trimmed input as fallback', () => {
    const input = '  some random text  ';
    expect(extractYAML(input)).toBe('some random text');
  });
});

describe('extractCode', () => {
  test('strips typescript code fence', () => {
    const input = '```typescript\nconst x = 1;\n```';
    expect(extractCode(input)).toBe('const x = 1;');
  });

  test('strips generic code fence', () => {
    const input = '```\nline1\nline2\n```';
    expect(extractCode(input)).toBe('line1\nline2');
  });

  test('returns non-fenced content as-is', () => {
    const input = 'const x = 1;';
    expect(extractCode(input)).toBe('const x = 1;');
  });

  test('trims whitespace', () => {
    expect(extractCode('  code  ')).toBe('code');
  });
});
