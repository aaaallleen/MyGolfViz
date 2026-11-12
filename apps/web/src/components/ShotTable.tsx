import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import { Popover } from '@base-ui/react/popover';
import {
  columnGroupingFeature, columnPinningFeature, columnSizingFeature, columnVisibilityFeature,
  createColumnHelper, createExpandedRowModel, createGroupedRowModel, createSortedRowModel,
  rowExpandingFeature, rowSortingFeature, sortFn_alphanumeric, tableFeatures, useTable,
  type ColumnDef, type ColumnSizingState, type ColumnVisibilityState, type ExpandedState, type SortingState,
} from '@tanstack/react-table';
import {
  FIELD_DEFS, fieldDef, formatMeasurement, unparsedHeaders,
  type FieldGroup, type MeasurementKey, type Shot, type SourceFile,
} from '@fsa/domain';
import { Missing } from '@fsa/ui';
import { usePhone } from './usePhone';

/** Preferred column order inside each group; any field not listed here follows its group's list. */
const ORDER: readonly MeasurementKey[] = [
  'ballSpeed', 'launchV', 'launchH', 'spin', 'spinAxis', 'carry', 'total', 'roll', 'lateral', 'curve', 'height', 'descentV', 'flightTime',
  'clubSpeed', 'smash', 'clubPath', 'ftp', 'ftt', 'aoa', 'dynamicLoft', 'spinLoft', 'swingH', 'swingV', 'lowPoint',
  'impactLateral', 'impactVertical',
  'altitude',
];
/** The columns the table used to show; the Columns menu can go back to just these. */
const KEY_COLUMNS: ReadonlySet<string> = new Set([
  'ballSpeed', 'launchV', 'spin', 'carry', 'total', 'lateral', 'clubSpeed', 'smash', 'clubPath', 'ftp', 'impactLateral', 'impactVertical',
]);
const GROUPS: { group: FieldGroup; title: string }[] = [
  { group: 'ball', title: 'Ball' },
  { group: 'club', title: 'Club' },
  { group: 'impact', title: 'Impact' },
  { group: 'environment', title: 'Environment' },
];
const TEXT: { key: 'shotType' | 'mode' | 'location'; head: string }[] = [
  { key: 'shotType', head: 'Shot type' },
  { key: 'mode', head: 'Mode' },
  { key: 'location', head: 'Location' },
];
const PINNED = ['shot', 'club'];
/** Narrower pinned columns on phones (club names wrap there), so data columns get most of the width. */
const PHONE_SIZES: ColumnSizingState = { shot: 48, club: 92 };
const NO_SIZES: ColumnSizingState = {};
const LAST_PINNED = PINNED[PINNED.length - 1];

const rank = (k: MeasurementKey) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };
const MEASURE_GROUPS = GROUPS.map(({ group, title }) => ({
  group,
  title,
  keys: FIELD_DEFS.filter((f) => f.group === group).map((f) => f.key).sort((a, b) => rank(a) - rank(b)),
}));

const features = tableFeatures({
  columnSizingFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  groupedRowModel: createGroupedRowModel(),
  sortedRowModel: createSortedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
type Features = typeof features;
const helper = createColumnHelper<Features, Shot>();

/** Empty CSV cells read as missing (undefined sorts last); never as zero or blank text. */
const text = (v: string | null | undefined) => (v === null || v === undefined || v.trim() === '' ? undefined : v);
const show = (v: string | undefined) => v ?? <Missing />;

function buildColumns(other: readonly string[]): ColumnDef<Features, Shot, any>[] {
  return [
    helper.accessor((s) => Number(s.shotLabel ?? s.sourceRow) || s.sourceRow, {
      id: 'shot', header: 'Shot', size: 64, enableHiding: false,
      cell: (c) => c.row.original.shotLabel ?? c.row.original.sourceRow,
    }),
    helper.accessor('club', { id: 'club', header: 'Club', size: 140, enableHiding: false, sortFn: 'alphanumeric' }),
    ...MEASURE_GROUPS.map((g) => helper.group({
      // Prefixed so the "Club" column group never shares an id with the Club column.
      id: `group:${g.group}`,
      header: g.title,
      columns: helper.columns(g.keys.map((k) => helper.accessor((s) => s.m[k] ?? undefined, {
        id: k,
        header: fieldDef(k).label,
        sortUndefined: 'last',
        cell: (c) => show(c.getValue() === undefined ? undefined : formatMeasurement(k, c.getValue() as number)),
      }))),
    })),
    helper.group({
      id: 'group:other',
      header: 'Other',
      columns: helper.columns([
        ...TEXT.map((t) => helper.accessor((s) => text(s[t.key]), {
          id: t.key, header: t.head, sortUndefined: 'last', sortFn: 'alphanumeric', cell: (c) => show(c.getValue() as string | undefined),
        })),
        ...other.map((h) => helper.accessor((s) => text(s.raw[h]), {
          id: `raw:${h}`, header: h, sortUndefined: 'last', sortFn: 'alphanumeric', cell: (c) => show(c.getValue() as string | undefined),
        })),
      ]),
    }),
  ];
}

/** Every column header in the CSV, in first-seen order across files (the parser keeps raw cells by header). */
function rawHeaders(shots: readonly Shot[]): string[] {
  const seen = new Set<string>();
  for (const s of shots) for (const h of Object.keys(s.raw)) seen.add(h);
  return [...seen];
}

export function rowTitle(shot: Shot, files: readonly SourceFile[]): string {
  const f = files.find((x) => x.id === shot.fileId);
  return `File ${f?.ordinal ?? '?'} · ${f?.name ?? ''} · CSV row ${shot.sourceRow}`;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/**
 * Every value in the CSV for each shot, in a table that scrolls inside its own box: the header row and
 * the Shot and Club columns stay in view. Sort by any column, hide columns from the Columns menu, and
 * (with all clubs showing) rows sit under one heading per club.
 */
export function ShotTable({ shots, files, selectedId, onSelect, grouped }: {
  shots: readonly Shot[];
  files: readonly SourceFile[];
  selectedId: string | null;
  onSelect(id: string): void;
  grouped: boolean;
}) {
  const other = useMemo(() => unparsedHeaders(rawHeaders(shots)), [shots]);
  // Rebuild column definitions only when the set of extra CSV columns changes, not on every filter.
  const otherKey = other.join('\u0000');
  const columns = useMemo(() => buildColumns(otherKey === '' ? [] : otherKey.split('\u0000')), [otherKey]);
  const data = useMemo(() => [...shots], [shots]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const grouping = useMemo(() => (grouped ? ['club'] : []), [grouped]);
  const columnSizing = usePhone() ? PHONE_SIZES : NO_SIZES;
  useEffect(() => setExpanded(true), [grouped]);

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (s) => s.id,
    groupedColumnMode: false,
    initialState: { columnPinning: { start: PINNED, end: [] } },
    state: { sorting, columnVisibility, grouping, expanded, columnSizing },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
  });

  // Keep the selected row in view inside the table's own scroll box, without scrolling the page.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const row = box?.querySelector<HTMLElement>('tr[aria-current="true"]');
    if (!box || !row) return;
    const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top - head < box.scrollTop) box.scrollTop = top - head;
    else if (top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + row.offsetHeight - box.clientHeight;
  }, [selectedId]);

  const pinStyle = (column: { getIsPinned(): false | 'start' | 'end'; getStart(p?: 'start'): number; getSize(): number }): CSSProperties | undefined =>
    column.getIsPinned() === 'start'
      ? { insetInlineStart: column.getStart('start'), width: column.getSize(), minWidth: column.getSize(), maxWidth: column.getSize() }
      : undefined;
  const groupOf = (id: string | undefined) => {
    const g = id?.startsWith('group:') ? id.slice('group:'.length) : undefined;
    return g === 'ball' || g === 'club' ? `col-${g}` : undefined;
  };
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); }
  };
  const visibleLeaves = table.getVisibleLeafColumns().length;
  // Group labels (Ball, Club, ...) slide along just right of the pinned columns while scrolling sideways.
  const pinnedWidth = PINNED.reduce((w, id) => w + (table.getColumn(id)?.getSize() ?? 0), 0);

  return (
    <div className="shots-table-wrap">
      <div className="shots-table__tools">
        <span className="panel__note">{sorting.length > 0 ? 'Sorted by a column · tap its header again to change or clear' : 'Tap a column header to sort'}</span>
        <ColumnMenu table={table} />
      </div>
      <div className="shots-table" ref={boxRef} role="region" aria-label="All shot data" tabIndex={0}>
        <table>
          <thead>
            {table.getHeaderGroups().map((hg, depth) => (
              <tr key={hg.id} className={depth === 0 ? 'shots-table__groups' : undefined}>
                {hg.headers.map((header) => {
                  const col = header.column;
                  const pinned = col.getIsPinned() === 'start';
                  if (header.isPlaceholder || depth === 0) {
                    return (
                      <th key={header.id} colSpan={header.colSpan} scope={header.isPlaceholder ? undefined : 'colgroup'}
                        className={clsx('is-left', pinned && 'is-pinned', col.id === LAST_PINNED && 'is-pinned-last', groupOf(col.id))} style={pinStyle(col)}>
                        {header.isPlaceholder ? null : (
                          <span className="shots-table__group-label" style={{ insetInlineStart: pinnedWidth + 10 }}>
                            <table.FlexRender header={header} />
                          </span>
                        )}
                      </th>
                    );
                  }
                  const sorted = col.getIsSorted();
                  const isText = PINNED.includes(col.id) || col.id.startsWith('raw:') || TEXT.some((t) => t.key === col.id);
                  return (
                    <th key={header.id} scope="col" data-col={col.id} aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                      className={clsx(isText && 'is-left', pinned && 'is-pinned', col.id === LAST_PINNED && 'is-pinned-last', groupOf(col.parent?.id))} style={pinStyle(col)}>
                      <button type="button" className="shots-table__sort" onClick={col.getToggleSortingHandler()}>
                        <table.FlexRender header={header} />
                        <span className={clsx('shots-table__sort-icon', sorted && 'is-active')} aria-hidden="true">
                          {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              if (row.getIsGrouped()) {
                const open = row.getIsExpanded();
                return (
                  <tr key={row.id} className="shots-table__club-row">
                    <th scope="rowgroup" colSpan={visibleLeaves} className="is-left">
                      <button type="button" className="shots-table__club-toggle" aria-expanded={open} onClick={row.getToggleExpandedHandler()}>
                        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                        {`${String(row.groupingValue)} · ${row.getLeafRows().length} shots`}
                      </button>
                    </th>
                  </tr>
                );
              }
              const s = row.original;
              return (
                <tr
                  key={row.id}
                  data-shot-id={s.id}
                  tabIndex={0}
                  {...(s.id === selectedId ? { 'aria-current': 'true' as const } : {})}
                  title={rowTitle(s, files)}
                  onClick={() => onSelect(s.id)}
                  onKeyDown={(e) => onKey(e, s.id)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const col = cell.column;
                    const value = cell.getValue();
                    const isText = PINNED.includes(col.id) || col.id.startsWith('raw:') || TEXT.some((t) => t.key === col.id);
                    return (
                      <td key={cell.id} data-col={col.id} style={pinStyle(col)}
                        className={clsx(isText && 'is-left', col.getIsPinned() === 'start' && 'is-pinned', col.id === LAST_PINNED && 'is-pinned-last', value === undefined && 'is-missing')}>
                        {/* Leaf rows under a club heading still show their club. */}
                        {col.id === 'club' ? s.club : <table.FlexRender cell={cell} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type AnyTable = ReturnType<typeof useTable<Features, Shot>>;

/** Show or hide columns, by group, with shortcuts for every column and for the key few. */
function ColumnMenu({ table }: { table: AnyTable }) {
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const shown = hideable.filter((c) => c.getIsVisible()).length;
  const sections = table.getAllColumns().filter((c) => c.columns.length > 0);
  return (
    <Popover.Root>
      <Popover.Trigger className="fsa-btn fsa-btn--secondary fsa-touch shots-table__columns-btn">
        {`Columns · ${shown} of ${hideable.length}`}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="column-menu__positioner">
          <Popover.Popup className="column-menu" aria-label="Choose columns">
            <div className="column-menu__actions">
              <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch" onClick={() => table.toggleAllColumnsVisible(true)}>Show all</button>
              <button
                type="button"
                className="fsa-btn fsa-btn--secondary fsa-touch"
                onClick={() => table.setColumnVisibility(Object.fromEntries(hideable.map((c) => [c.id, KEY_COLUMNS.has(c.id)])))}
              >
                Key columns only
              </button>
            </div>
            {sections.map((section) => (
              <fieldset key={section.id} className="column-menu__group">
                <legend>{typeof section.columnDef.header === 'string' ? section.columnDef.header : section.id}</legend>
                {section.columns.filter((c) => c.getCanHide()).map((c) => (
                  <label key={c.id} className="column-menu__item fsa-touch">
                    <input type="checkbox" checked={c.getIsVisible()} onChange={(e) => c.toggleVisibility(e.target.checked)} />
                    {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                  </label>
                ))}
              </fieldset>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
