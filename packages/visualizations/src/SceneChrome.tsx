import type { ReactNode } from 'react';
import type { Vec3 } from '@fsa/domain';
import { ProvenanceTag } from '@fsa/ui';
import { projectPoint, type Camera } from './camera';
import { BALL_EDGE, GRID, INK, MUTED, PANEL, SOFT } from './theme';

export const W = 800, H = 480;
export type Pt = { x: number; y: number };
export const f1 = (n: number) => Number(n.toFixed(1));

/** Projection helpers: a segment with an endpoint behind the camera is skipped; every coordinate is finite. */
export function makeProjector(cam: Camera) {
  const proj = (p: Vec3): Pt | null => {
    const r = projectPoint(p, cam, { width: W, height: H });
    return r && Number.isFinite(r.x) && Number.isFinite(r.y) ? { x: r.x, y: r.y } : null;
  };
  const pt = (p: Pt) => `${f1(p.x)} ${f1(p.y)}`;
  const pathOf = (pts: Vec3[]): string => {
    let d = '';
    let prev: Pt | null = null;
    for (const p of pts) {
      const q = proj(p);
      if (q && prev) d += ` L${pt(q)}`;
      else if (q) d += ` M${pt(q)}`;
      prev = q;
    }
    return d.trim();
  };
  const lineEl = (key: string, a: Vec3, b: Vec3, props: Record<string, string | number>): ReactNode => {
    const p = proj(a), q = proj(b);
    if (!p || !q) return null;
    return <line key={key} x1={f1(p.x)} y1={f1(p.y)} x2={f1(q.x)} y2={f1(q.y)} {...props} />;
  };
  return { proj, pt, pathOf, lineEl };
}

/**
 * Baseline anchor for a start-aligned label beside the 3D segment a→b: the point closest to b whose
 * label box (offset `dx` right, `width` wide) stays inside the scene with an 8px margin, lifted so the
 * text sits above the projected line across its whole width. Null if no point fits.
 */
export function lineLabelAnchor(proj: (p: Vec3) => Pt | null, a: Vec3, b: Vec3, width: number, dx = 8): Pt | null {
  const pa = proj(a), pb = proj(b);
  const slope = pa && pb && pb.x !== pa.x ? (pb.y - pa.y) / (pb.x - pa.x) : 0;
  // A line rising to the right (negative slope) climbs into the text; lift by that climb plus a gap.
  const lift = 4 - Math.min(0, slope) * (dx + width);
  const STEPS = 40;
  for (let i = STEPS; i >= 0; i--) {
    const t = i / STEPS;
    const q = proj([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    if (!q) continue;
    const x = q.x + dx, y = q.y - lift;
    if (x >= 8 && x + width <= W - 8 && y >= 16 && y <= H - 8) return { x, y };
  }
  return null;
}

/** Ground grid on z = 0 over [x0,x1] x [y0,y1] with the given spacing. */
export function groundGrid(lineEl: ReturnType<typeof makeProjector>['lineEl'], x0: number, x1: number, y0: number, y1: number, step: number) {
  const out: ReactNode[] = [];
  for (let x = x0; x <= x1; x += step) out.push(lineEl(`gx${x}`, [x, y0, 0], [x, y1, 0], {}));
  for (let y = y0; y <= y1; y += step) out.push(lineEl(`gy${y}`, [x0, y, 0], [x1, y, 0], {}));
  return <g stroke={GRID} strokeWidth={1}>{out}</g>;
}

export function Panel({ children }: { children: ReactNode }) {
  return <div style={{ background: PANEL, border: `1px solid ${GRID}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{children}</div>;
}

export function Banner({ title, copy }: { title: string; copy: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 10, border: `2px dashed ${MUTED}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: INK, color: BALL_EDGE, whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ color: SOFT, lineHeight: 1.45, flex: '1 1 240px' }}>{copy}</span>
      <ProvenanceTag kind="illustrative" />
    </div>
  );
}

export const noteStyle = { margin: 0, color: MUTED, fontSize: 14 } as const;
