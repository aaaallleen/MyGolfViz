import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from '@base-ui/react/popover';
import { addDays, addMonths, monthGrid, parseYmd, todayLocal, weekdayIndex, ymd } from './calendarDates';

export interface DateFieldProps {
  id: string;
  /** `YYYY-MM-DD`, or null when no date is set. */
  value: string | null;
  required?: boolean;
  /** Called with a valid date, or null when the date is cleared (only when not required). */
  onChange(date: string | null): void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

const ARROW = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/**
 * A date you can type (the browser's own date input) or pick from a calendar that matches the app.
 * The browser's own picker is hidden: its popup can't be styled and looks foreign in the dark theme.
 */
export function DateField({ id, value, required = false, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  return (
    <div className="date-field">
      <input
        id={id}
        type="date"
        autoComplete="off"
        className="field__input date-field__input fsa-touch"
        value={value ?? ''}
        required={required}
        onChange={(e) => {
          if (required && !e.target.value) return;
          onChange(e.target.value || null);
        }}
      />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger className="date-field__button" aria-label="Choose date">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
            <path d="M2.5 7.5h13M6 2v3M12 2v3" />
            <path d="M5.5 10.5h1M8.5 10.5h1M11.5 10.5h1M5.5 13h1M8.5 13h1" />
          </svg>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={6} className="date-pop__positioner">
            <Popover.Popup
              ref={popup}
              className="date-pop"
              aria-label="Choose date"
              // Opening focuses the selected day (or today), so the arrow keys work straight away.
              initialFocus={() => popup.current?.querySelector<HTMLElement>('.date-cal__day[tabindex="0"]') ?? true}
            >
              <Calendar
                value={value}
                required={required}
                onPick={(d) => { onChange(d); setOpen(false); }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export interface CalendarProps {
  value: string | null;
  required: boolean;
  /** A day was chosen (or, when not required, the date was cleared with null). */
  onPick(date: string | null): void;
}

/** Month grid with arrow-key navigation: arrows move a day or a week, Page Up/Down a month, Home/End to the week's ends. */
export function Calendar({ value, required, onPick }: CalendarProps) {
  const today = todayLocal();
  const start = parseYmd(value) ? value! : today;
  const [focused, setFocused] = useState(start);
  const view = parseYmd(focused)!;
  const grid = useMemo(() => monthGrid(view.y, view.m0), [view.y, view.m0]);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const moved = useRef(false);

  // Keyboard moves focus with the highlighted day; opening is handled by the popup's initialFocus.
  useEffect(() => {
    if (moved.current) dayRefs.current.get(focused)?.focus();
  }, [focused]);

  const move = (to: string) => { moved.current = true; setFocused(to); };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      PageUp: () => addMonths(date, -1),
      PageDown: () => addMonths(date, 1),
      Home: () => addDays(date, -weekdayIndex(date)),
      End: () => addDays(date, 6 - weekdayIndex(date)),
    };
    const next = step[e.key];
    if (!next) return;
    e.preventDefault();
    move(next());
  };
  const shiftMonth = (by: number) => { moved.current = false; setFocused(addMonths(focused, by)); };

  return (
    <div className="date-cal">
      <div className="date-cal__head">
        <button type="button" className="date-cal__nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <svg aria-hidden="true" {...ARROW}><path d="M9 2L4 7l5 5" /></svg>
        </button>
        <div className="date-cal__month" aria-live="polite">{MONTH_FORMAT.format(utc(ymd(view.y, view.m0, 1)))}</div>
        <button type="button" className="date-cal__nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <svg aria-hidden="true" {...ARROW}><path d="M5 2l5 5-5 5" /></svg>
        </button>
      </div>
      <div className="date-cal__grid" role="grid" aria-label={MONTH_FORMAT.format(utc(ymd(view.y, view.m0, 1)))}>
        <div className="date-cal__row" role="row">
          {WEEKDAYS.map((d) => <span key={d} role="columnheader" className="date-cal__weekday">{d}</span>)}
        </div>
        {Array.from({ length: 6 }, (_, w) => (
          <div key={w} className="date-cal__row" role="row">
            {grid.slice(w * 7, w * 7 + 7).map((d) => {
              const classes = [
                'date-cal__day',
                d.inMonth ? '' : 'is-out',
                d.date === today ? 'is-today' : '',
                d.date === value ? 'is-selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <span key={d.date} role="gridcell" aria-selected={d.date === value}>
                  <button
                    ref={(el) => { if (el) dayRefs.current.set(d.date, el); else dayRefs.current.delete(d.date); }}
                    type="button"
                    className={classes}
                    tabIndex={d.date === focused ? 0 : -1}
                    aria-label={`${DAY_FORMAT.format(utc(d.date))}${d.date === today ? ' (today)' : ''}`}
                    aria-current={d.date === today ? 'date' : undefined}
                    onKeyDown={(e) => onKey(e, d.date)}
                    onClick={() => onPick(d.date)}
                  >
                    {Number(d.date.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="date-cal__foot">
        <button type="button" className="date-cal__link" onClick={() => onPick(today)}>Today</button>
        {!required && value && <button type="button" className="date-cal__link" onClick={() => onPick(null)}>Clear</button>}
      </div>
    </div>
  );
}
