import { describe, expect, test } from 'vitest';
import { addDays, addMonths, parseYmd, todayLocal, weekdayIndex } from './calendarDates';

describe('calendar dates', () => {
  test('parseYmd accepts only real dates', () => {
    expect(parseYmd('2026-11-13')).toEqual({ y: 2026, m0: 10, d: 13 });
    expect(parseYmd('2026-02-30')).toBeNull();
    expect(parseYmd('')).toBeNull();
    expect(parseYmd(null)).toBeNull();
  });
  test('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('addMonths clamps to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
  test('weekdayIndex is Monday-first', () => {
    expect(weekdayIndex('2026-11-09')).toBe(0); // Monday
    expect(weekdayIndex('2026-11-15')).toBe(6); // Sunday
  });
  test('todayLocal uses the local calendar day', () => {
    expect(todayLocal(new Date(2026, 10, 12, 23, 30))).toBe('2026-11-12');
  });
});
