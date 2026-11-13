import { describe, expect, it } from 'vitest';
import { parsePortLine, parseStatusLine } from './portLine';

describe('parsePortLine', () => {
  it('parses a valid port line', () => {
    const url = 'http://127.0.0.1:50123/?token=abc';
    expect(parsePortLine(JSON.stringify({ port: 50123, url }))).toEqual({ port: 50123, url });
  });

  it.each([
    ['non-JSON', 'listening on 50123'],
    ['port 0', '{"port": 0, "url": "http://127.0.0.1:0/"}'],
    ['port 70000', '{"port": 70000, "url": "http://127.0.0.1:70000/"}'],
    ['localhost url', '{"port": 5000, "url": "http://localhost:5000/"}'],
    ['different port', '{"port": 5000, "url": "http://127.0.0.1:5001/"}'],
    ['https scheme', '{"port": 5000, "url": "https://127.0.0.1:5000/"}'],
    ['missing url', '{"port": 5000}'],
    ['JSON null', 'null'],
    ['non-integer port', '{"port": 50.5, "url": "http://127.0.0.1:50.5/"}'],
  ])('returns null for %s', (_name, line) => {
    expect(parsePortLine(line)).toBeNull();
  });
});

describe('parseStatusLine', () => {
  it('recognises the migrating announcement', () => {
    expect(parseStatusLine('{"status": "migrating"}')).toBe('migrating');
  });

  it.each([
    ['a port line', '{"port": 5000, "url": "http://127.0.0.1:5000/"}'],
    ['an unknown status', '{"status": "dancing"}'],
    ['non-JSON', 'migrating'],
    ['JSON null', 'null'],
  ])('returns null for %s', (_name, line) => {
    expect(parseStatusLine(line)).toBeNull();
  });
});
