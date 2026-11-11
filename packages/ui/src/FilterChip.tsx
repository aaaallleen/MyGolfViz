export type FilterChipProps = { pressed: boolean; label: string; count: number; onClick(): void };

export function FilterChip({ pressed, label, count, onClick }: FilterChipProps) {
  return (
    <button type="button" className="fsa-chip fsa-touch" aria-pressed={pressed} onClick={onClick}>
      <span>{label}</span>
      <span className="fsa-chip__count">{count}</span>
    </button>
  );
}
