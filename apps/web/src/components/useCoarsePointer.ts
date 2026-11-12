import { useMediaQuery } from './useMediaQuery';

/**
 * True when the primary pointer is a finger (phones, tablets). Touch-screen laptops stay false,
 * since their primary pointer is the trackpad or mouse; `any-pointer` would wrongly match them.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
