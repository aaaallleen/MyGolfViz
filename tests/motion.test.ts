// Guards the app's motion rules: movement (transform, height, view transitions) only runs when the viewer hasn't
// asked for reduced motion, and curves come from the shared tokens.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = resolve(__dirname, '..');
const TOKENS = join(ROOT, 'packages/ui/src/tokens.css');

function cssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith('.css') ? [p] : [];
  });
}

const FILES = [TOKENS, ...cssFiles(join(ROOT, 'apps/web/src'))];
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** [start, end) offsets of every `@media (prefers-reduced-motion: no-preference) { … }` block. */
function noPreferenceBlocks(css: string): [number, number][] {
  const blocks: [number, number][] = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    blocks.push([m.index, i]);
  }
  return blocks;
}

/** Offsets of what moves things: transitions of transform or height, and view-transition pseudo-elements. */
function movement(css: string): { at: number; text: string }[] {
  const found: { at: number; text: string }[] = [];
  for (const m of css.matchAll(/transition\s*:[^;}]*/g)) {
    if (/\b(transform|height)\b/.test(m[0])) found.push({ at: m.index, text: m[0] });
  }
  for (const m of css.matchAll(/::view-transition-[a-z-]+\([^)]*\)/g)) found.push({ at: m.index, text: m[0] });
  return found;
}

describe('motion', () => {
  test('the shared easing tokens exist', () => {
    const tokens = readFileSync(TOKENS, 'utf8');
    expect(tokens).toContain('--ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
    expect(tokens).toContain('--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);');
  });

  test.each(FILES.map((f) => [relative(ROOT, f), f]))('%s: movement only without reduced motion', (_name, file) => {
    const css = stripComments(readFileSync(file, 'utf8'));
    const blocks = noPreferenceBlocks(css);
    const unguarded = movement(css).filter(({ at }) => !blocks.some(([s, e]) => at > s && at < e));
    expect(unguarded.map((u) => u.text)).toEqual([]);
  });

  test.each(FILES.filter((f) => f !== TOKENS).map((f) => [relative(ROOT, f), f]))(
    '%s: curves come from the tokens',
    (_name, file) => {
      expect(stripComments(readFileSync(file, 'utf8'))).not.toMatch(/cubic-bezier\(/);
    },
  );
});
