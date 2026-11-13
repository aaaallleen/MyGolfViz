import fs from 'node:fs';
import path from 'node:path';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function centred(size: { width: number; height: number }, area: Rect): Rect {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}

/**
 * Places a window fully on a visible display. `workAreas[0]` is the primary display.
 * A saved rect is kept on the display it overlaps most, shrunk and moved to fit inside it.
 * A rect on no current display (e.g. an unplugged monitor), or no saved rect, is centred on the primary.
 */
export function clampToDisplays(
  saved: Rect | null,
  workAreas: Rect[],
  fallback: { width: number; height: number },
): Rect {
  const primary = workAreas[0];
  if (!primary) return saved ?? { x: 0, y: 0, ...fallback };
  if (!saved) return centred(fallback, primary);

  let best: Rect | null = null;
  let bestOverlap = 0;
  for (const area of workAreas) {
    const o = overlap(saved, area);
    if (o > bestOverlap) {
      best = area;
      bestOverlap = o;
    }
  }
  if (!best) return centred(saved, primary);

  const width = Math.min(saved.width, best.width);
  const height = Math.min(saved.height, best.height);
  return {
    x: Math.min(Math.max(saved.x, best.x), best.x + best.width - width),
    y: Math.min(Math.max(saved.y, best.y), best.y + best.height - height),
    width,
    height,
  };
}

function isRect(v: unknown): v is Rect {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return finite(r.x) && finite(r.y) && finite(r.width) && finite(r.height) && r.width > 0 && r.height > 0;
}

/** Reads the saved window bounds; null when the file is missing or not a valid rect. */
export function loadWindowState(file: string): Rect | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isRect(data)) return null;
    return { x: data.x, y: data.y, width: data.width, height: data.height };
  } catch {
    return null;
  }
}

/** Writes the window bounds atomically (temp file + rename). */
export function saveWindowState(file: string, rect: Rect): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const { x, y, width, height } = rect;
  fs.writeFileSync(tmp, JSON.stringify({ x, y, width, height }));
  fs.renameSync(tmp, file);
}
