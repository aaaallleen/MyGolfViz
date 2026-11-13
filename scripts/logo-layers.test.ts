import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLIGHT_GRADIENTS, splitLogo, topLevelElements } from './logo-layers.mjs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const logo = read('../apps/web/public/icon.svg');
const layers = splitLogo(logo);

const body = (svg: string) => svg.slice(svg.indexOf('</defs>') + '</defs>'.length, svg.lastIndexOf('</svg>'));
const defIds = (svg: string) => [...svg.slice(0, svg.indexOf('</defs>')).matchAll(/<\w+ id="([^"]+)"/g)].map((m) => m[1]);
const refs = (s: string) => [...new Set([...s.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];

describe('splitLogo', () => {
  it('matches the committed splash layers (run `npm run desktop:logo-layers` after changing the logo)', () => {
    expect(read('../apps/desktop/static/logo-still.svg')).toBe(layers.still);
    expect(read('../apps/desktop/static/logo-flight.svg')).toBe(layers.flight);
  });

  it('puts every drawing element of the logo in exactly one layer, in the original order', () => {
    const original = topLevelElements(body(logo).replace(/<metadata>[\s\S]*<\/metadata>/, ''));
    const still = topLevelElements(body(layers.still));
    const flight = topLevelElements(body(layers.flight));
    expect([...still, ...flight].sort()).toEqual([...original].sort());
    expect(original.filter((e) => still.includes(e))).toEqual(still);
    expect(original.filter((e) => flight.includes(e))).toEqual(flight);
  });

  it('the flight layer is the swoosh, the arc and the ball at its tip; the eye and golf ball stay still', () => {
    const flightFills = topLevelElements(body(layers.flight)).flatMap(refs);
    expect(new Set(flightFills)).toEqual(new Set(FLIGHT_GRADIENTS));
    for (const still of ['gLobe', 'gSclera', 'gIris', 'gPupil', 'gHi']) expect(refs(body(layers.still))).toContain(still);
  });

  it('each layer defines exactly the gradients and clip paths it uses, and keeps the logo canvas', () => {
    for (const svg of [layers.still, layers.flight]) {
      expect(new Set(defIds(svg))).toEqual(new Set(refs(body(svg))));
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 650 650"/);
    }
  });
});
