import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Shot, SourceFile } from '@fsa/domain';
import { ShotTable } from './ShotTable';

const file = (ordinal: number): SourceFile => ({
  id: `f${ordinal}`, name: `session-${ordinal}.csv`, ordinal, sha256: `sha${ordinal}`, byteLength: 1, parserVersion: '1',
});
const shot = (fileId: string, sourceRow: number): Shot => ({
  id: `${fileId}-${sourceRow}`, fileId, sourceRow, shotLabel: String(sourceRow), club: '7 Iron', shotType: null, mode: null, location: null,
  m: { carry: 150 } as Shot['m'], raw: {}, flags: [],
});

function setup(opts: { files?: SourceFile[]; shots?: Shot[]; excluded?: string[] } = {}) {
  const files = opts.files ?? [file(1)];
  const shots = opts.shots ?? [shot('f1', 1), shot('f1', 2)];
  const props = {
    onSelect: vi.fn(), onSetExcluded: vi.fn(), onIncludeAll: vi.fn(),
  };
  const utils = render(
    <ShotTable shots={shots} files={files} selectedId={null} grouped={false} excludedIds={new Set(opts.excluded ?? [])} {...props} />,
  );
  return { ...utils, ...props };
}
const row = (id: string) => document.querySelector<HTMLElement>(`tr[data-shot-id="${id}"]`)!;

describe('ShotTable exclusion', () => {
  it('outside edit mode there are no Use switches and a row click only selects', async () => {
    const { onSelect, onSetExcluded } = setup();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Use' })).toBeNull();
    await userEvent.click(row('f1-1'));
    expect(onSelect).toHaveBeenCalledWith('f1-1');
    expect(onSetExcluded).not.toHaveBeenCalled();
  });

  it('an excluded row is marked is-excluded with an Excluded tag', () => {
    setup({ excluded: ['f1-2'] });
    expect(row('f1-2')).toHaveClass('is-excluded');
    expect(within(row('f1-2')).getByText('Excluded')).toBeInTheDocument();
    expect(row('f1-1')).not.toHaveClass('is-excluded');
    expect(within(row('f1-1')).queryByText('Excluded')).toBeNull();
  });

  it('Edit shots shows a Use switch per row; toggling calls onSetExcluded without selecting the row', async () => {
    const { onSelect, onSetExcluded } = setup({ excluded: ['f1-2'] });
    await userEvent.click(screen.getByRole('button', { name: 'Edit shots' }));
    expect(screen.getByText('Editing shots')).toBeInTheDocument();
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]).toBeChecked();
    expect(switches[1]).not.toBeChecked();
    expect(switches[0]).toHaveAccessibleName('Use shot 1, 7 Iron, file 1');

    await userEvent.click(switches[0]!);
    expect(onSetExcluded).toHaveBeenCalledWith('f1-1', true);
    expect(onSelect).not.toHaveBeenCalled();

    switches[1]!.focus();
    await userEvent.keyboard(' ');
    expect(onSetExcluded).toHaveBeenCalledWith('f1-2', false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the Use column out of the Columns menu and pins it first while editing', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit shots' }));
    expect(screen.getByRole('columnheader', { name: 'Use' })).toBeInTheDocument();
    const cells = [...row('f1-1').querySelectorAll('td')].map((td) => td.getAttribute('data-col'));
    expect(cells.slice(0, 3)).toEqual(['use', 'shot', 'club']);
    await userEvent.click(screen.getByRole('button', { name: /^Columns/ }));
    expect(screen.queryByRole('checkbox', { name: 'Use' })).toBeNull();
  });

  it('Include all calls onIncludeAll; Done leaves edit mode', async () => {
    const { onIncludeAll } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit shots' }));
    await userEvent.click(screen.getByRole('button', { name: 'Include all' }));
    expect(onIncludeAll).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit shots' })).toBeInTheDocument();
  });

  it('two files: rows carry F1/F2 badges', () => {
    setup({ files: [file(1), file(2)], shots: [shot('f1', 1), shot('f2', 1)] });
    expect(within(row('f1-1')).getByText('F1')).toBeInTheDocument();
    expect(within(row('f2-1')).getByText('F2')).toBeInTheDocument();
  });
});
