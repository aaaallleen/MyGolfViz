import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Shot, SourceFile } from '@fsa/domain';
import { FileBadge } from './FileBadge';
import { shotOptionLabel } from './shotLabel';

const file = (ordinal: number): SourceFile => ({
  id: `f${ordinal}`, name: `session-${ordinal}.csv`, ordinal, sha256: `sha${ordinal}`, byteLength: 1, parserVersion: '1',
});
const shot = (fileId: string, sourceRow: number): Shot => ({
  id: `${fileId}-${sourceRow}`, fileId, sourceRow, shotLabel: '3', club: '7 Iron', shotType: null, mode: null, location: null,
  m: { carry: 150 } as Shot['m'], raw: {}, flags: [],
});

describe('FileBadge and shotOptionLabel', () => {
  it('render nothing extra with a single file', () => {
    const files = [file(1)];
    const s = shot('f1', 5);
    const { container } = render(<FileBadge shot={s} files={files} />);
    expect(container).toBeEmptyDOMElement();
    expect(shotOptionLabel(s, files)).not.toContain('F1');
  });

  it('tell two files apart when shot labels collide', () => {
    const files = [file(1), file(2)];
    const a = shot('f1', 5);
    const b = shot('f2', 9);
    const { container } = render(<><FileBadge shot={a} files={files} /><FileBadge shot={b} files={files} /></>);
    const badges = container.querySelectorAll('.file-badge');
    expect(badges[0]).toHaveTextContent('F1');
    expect(badges[1]).toHaveTextContent('F2');
    expect(badges[0]!.getAttribute('title')).toContain('File 1 ·');
    expect(badges[0]!.getAttribute('title')).toContain('CSV row');
    expect(badges[1]!.getAttribute('title')).toContain('File 2 ·');
    expect(shotOptionLabel(a, files)).not.toBe(shotOptionLabel(b, files));
    expect(shotOptionLabel(a, files)).toContain('F1 shot 3');
  });
});
