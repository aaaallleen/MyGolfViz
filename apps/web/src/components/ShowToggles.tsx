export function ShowToggles<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string }[];
  value: Record<K, boolean>;
  onChange(key: K, on: boolean): void;
}) {
  return (
    <fieldset className="show-toggles">
      <legend>Show</legend>
      {options.map((o) => (
        <label key={o.key} className="show-toggles__opt">
          <input type="checkbox" checked={value[o.key]} onChange={(e) => onChange(o.key, e.target.checked)} />{o.label}
        </label>
      ))}
    </fieldset>
  );
}
