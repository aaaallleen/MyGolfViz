import { compareClubs } from '@fsa/domain';
import { niceTicks } from './scale';

/**
 * Categorical club colours, dark-surface steps of the data-viz reference palette. Validated on the
 * app's plot surface (#101714): every adjacent pair clears the colour-blind and normal-vision floors.
 * Clubs take slots in bag order, so clubs that land next to each other get adjacent (separable) slots.
 */
export const CLUB_SERIES = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'] as const;

/**
 * One colour per club, by bag position among `clubs` (pass every club in the session, not just the
 * visible ones, so filtering never repaints a club). Past eight clubs the slots repeat; repeats are
 * eight clubs apart in the bag, so they never land next to each other.
 */
export function clubColors(clubs: Iterable<string>): Map<string, string> {
  const ordered = [...new Set(clubs)].sort(compareClubs);
  return new Map(ordered.map((c, i) => [c, CLUB_SERIES[i % CLUB_SERIES.length]!]));
}

/** A club's identity in a plot: its name and colour. */
export interface ClubSeries { club: string; color: string }

/** Default viewBox width shared by the top and side views; both use the same left/right margins. */
export const PATTERN_WIDTH = 720;
export const PATTERN_LEFT = 56;
export const PATTERN_RIGHT_PAD = 16;

/** The distance range both views share: 0 to a round number just past the longest shot. */
export function patternXMax(maxDistance: number): number {
  const top = Math.max(maxDistance, 1) * 1.04;
  const ticks = niceTicks(0, top, 6);
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : top;
  return Math.max(step, Math.ceil(top / step - 1e-9) * step);
}

/** Opacity for a club's marks given the highlighted club (null = nothing highlighted). */
export function emphasis(club: string, highlightClub: string | null): 'normal' | 'on' | 'off' {
  if (highlightClub === null) return 'normal';
  return club === highlightClub ? 'on' : 'off';
}
