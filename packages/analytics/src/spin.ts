import type { Vec3 } from '@fsa/domain';

export function spinComponents(
  spin: number | null, axisDeg: number | null,
): { backspin: number | null; sidespin: number | null } {
  if (spin === null || axisDeg === null) return { backspin: null, sidespin: null };
  const a = (axisDeg * Math.PI) / 180;
  return { backspin: spin * Math.cos(a), sidespin: spin * Math.sin(a) };
}

/** (cos a, 0, −sin a): backspin axis points right; positive (R) tilt dips the right end. */
export function spinAxisVector(axisDeg: number): Vec3 {
  const a = (axisDeg * Math.PI) / 180;
  return [Math.cos(a), 0, -Math.sin(a)];
}
