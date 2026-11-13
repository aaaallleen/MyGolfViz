// Splits the logo (apps/web/public/icon.svg) into the two layers of the splash animation: the eye and golf ball,
// which stay still, and the ball flight around them, which spins. Used by scripts/split-logo.mjs.

/** Gradients that paint the ball flight: the dark swoosh, its ends, the bright arc, the streak and the ball at the tip. */
export const FLIGHT_GRADIENTS = ['gGlow', 'gTail', 'gRing', 'gEnd', 'gArc', 'gStreak', 'gDot'];

/** The top-level elements of an SVG fragment, as source text (an element with everything inside it counts as one). */
export function topLevelElements(fragment) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const token of fragment.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (depth === 0 && !token.startsWith('<')) continue; // whitespace between elements
    current += token;
    if (token.startsWith('</')) depth--;
    else if (token.startsWith('<') && !token.endsWith('/>')) depth++;
    if (depth === 0) {
      out.push(current.trim());
      current = '';
    }
  }
  return out;
}

const refs = (text) => new Set([...text.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]));

/** Returns { still, flight }: two standalone SVGs on the logo's canvas, each with only the definitions it uses. */
export function splitLogo(svg) {
  const open = svg.match(/^<svg\b[^>]*>/)[0];
  const viewBox = open.match(/viewBox="([^"]+)"/)[1];
  const defsStart = svg.indexOf('<defs>') + '<defs>'.length;
  const defsEnd = svg.indexOf('</defs>');
  const definitions = topLevelElements(svg.slice(defsStart, defsEnd));
  // The C2PA <metadata> block describes the original file, not the layers: leave it out.
  const drawing = topLevelElements(
    svg.slice(defsEnd + '</defs>'.length, svg.lastIndexOf('</svg>')).replace(/<metadata>[\s\S]*?<\/metadata>/, ''),
  );

  const isFlight = (el) => [...refs(el)].some((id) => FLIGHT_GRADIENTS.includes(id));
  const layer = (elements) => {
    const used = refs(elements.join(''));
    const defs = definitions.filter((d) => used.has(d.match(/ id="([^"]+)"/)[1]));
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="650" height="650">`,
      '<!-- Generated from apps/web/public/icon.svg by scripts/split-logo.mjs. Do not edit. -->',
      '<defs>',
      ...defs,
      '</defs>',
      ...elements,
      '</svg>',
      '',
    ].join('\n');
  };
  return { still: layer(drawing.filter((el) => !isFlight(el))), flight: layer(drawing.filter(isFlight)) };
}
