import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clampToDisplays, loadWindowState, saveWindowState, type Rect } from './windowState';

const laptop: Rect = { x: 0, y: 25, width: 1512, height: 920 };
const fallback = { width: 1200, height: 800 };

function inside(r: Rect, area: Rect): boolean {
  return r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height;
}

describe('clampToDisplays', () => {
  it('moves a window from a disconnected display fully onto a visible one', () => {
    const r = clampToDisplays({ x: 2200, y: 100, width: 1200, height: 800 }, [laptop], fallback);
    expect(inside(r, laptop)).toBe(true);
    expect(r.width).toBe(1200);
    expect(r.height).toBe(800);
  });

  it('keeps a rect that already fits', () => {
    const saved = { x: 100, y: 60, width: 1000, height: 700 };
    expect(clampToDisplays(saved, [laptop], fallback)).toEqual(saved);
  });

  it('keeps a rect that fits on a secondary display', () => {
    const external: Rect = { x: 1512, y: 0, width: 2560, height: 1415 };
    const saved = { x: 2000, y: 200, width: 1200, height: 800 };
    expect(clampToDisplays(saved, [laptop, external], fallback)).toEqual(saved);
  });

  it('pulls a partly off-screen rect back inside the display it overlaps', () => {
    const r = clampToDisplays({ x: 1000, y: 500, width: 1200, height: 800 }, [laptop], fallback);
    expect(inside(r, laptop)).toBe(true);
  });

  it('shrinks a rect larger than the display', () => {
    const r = clampToDisplays({ x: 0, y: 25, width: 3000, height: 2000 }, [laptop], fallback);
    expect(r).toEqual(laptop);
  });

  it('centres the fallback size when nothing was saved', () => {
    const r = clampToDisplays(null, [laptop], fallback);
    expect(r).toEqual({ x: 156, y: 85, width: 1200, height: 800 });
  });

  it('shrinks the fallback on a small display', () => {
    const small: Rect = { x: 0, y: 25, width: 1024, height: 700 };
    expect(clampToDisplays(null, [small], fallback)).toEqual(small);
  });
});

describe('window state file', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mygolfviz-winstate-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a rect', () => {
    const file = path.join(dir, 'window-state.json');
    saveWindowState(file, { x: 10, y: 20, width: 1100, height: 700 });
    expect(loadWindowState(file)).toEqual({ x: 10, y: 20, width: 1100, height: 700 });
  });

  it('creates the parent folder', () => {
    const file = path.join(dir, 'electron', 'window-state.json');
    saveWindowState(file, { x: 10, y: 20, width: 1100, height: 700 });
    expect(loadWindowState(file)).toEqual({ x: 10, y: 20, width: 1100, height: 700 });
  });

  it('returns null for a missing file', () => {
    expect(loadWindowState(path.join(dir, 'missing.json'))).toBeNull();
  });

  it.each(['{not json', '"text"', 'null', '{"x": 1, "y": 2, "width": "wide", "height": 3}', '{"x": 1, "y": 2, "width": 0, "height": 3}'])(
    'returns null for corrupt contents %s',
    (contents) => {
      const file = path.join(dir, 'window-state.json');
      fs.writeFileSync(file, contents);
      expect(loadWindowState(file)).toBeNull();
    },
  );
});
