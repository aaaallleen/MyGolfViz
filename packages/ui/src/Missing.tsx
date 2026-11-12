import type { CSSProperties } from 'react';
import { MISSING_MARK, NOT_MEASURED } from '@fsa/domain';

// Hidden from sight but still read aloud. Kept inside a positioned wrapper so it can never widen a scroll box or the page.
const HIDDEN: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
};

/** A value the CSV did not hold: a quiet dash on screen, "Not measured" on hover and to screen readers. */
export function Missing() {
  return (
    <span className="fsa-missing" title={NOT_MEASURED} style={{ position: 'relative' }}>
      <span aria-hidden="true">{MISSING_MARK}</span>
      <span style={HIDDEN}>{NOT_MEASURED}</span>
    </span>
  );
}
