/** Round tick values: multiples of {1,2,2.5,5,10}×10^k within [min, max]. */
export function niceTicks(min: number, max: number, maxCount: number): number[] {
  if (!(max > min) || maxCount < 1) return [];
  const raw = (max - min) / maxCount;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw * (1 - 1e-12)) ?? 10 * pow;
  const out: number[] = [];
  const first = Math.ceil(min / step - 1e-9);
  for (let i = first; i * step <= max + step * 1e-9; i++) {
    out.push(Number((i * step).toFixed(10)) + 0);
  }
  return out;
}

export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}
