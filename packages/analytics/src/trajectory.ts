import type { Shot } from '@fsa/domain';

export interface TrajectoryCurve {
  shotId: string;
  p0: [number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number];
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Illustrative cubic Bezier (yards) from carry, apex height, launch and descent angles. */
export function trajectoryCurve(shot: Shot): TrajectoryCurve | null {
  const { carry: c, height, launchV, descentV } = shot.m;
  if (c === null || height === null || launchV === null || descentV === null) return null;
  const h = height / 3;
  const y1 = c * Math.sin(rad(launchV));
  const y2 = c * Math.sin(rad(descentV));
  let max = 0;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000, u = 1 - t;
    max = Math.max(max, 3 * u * u * t * y1 + 3 * u * t * t * y2);
  }
  if (max <= 0) return null;
  const k = h / max;
  return {
    shotId: shot.id,
    p0: [0, 0],
    p1: [k * c * Math.cos(rad(launchV)), k * y1],
    p2: [c - k * c * Math.cos(rad(descentV)), k * y2],
    p3: [c, 0],
  };
}
