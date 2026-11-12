import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';

export type TabsProps<T extends string> = Omit<BaseTabs.Root.Props, 'value' | 'defaultValue' | 'onValueChange' | 'onChange'> & {
  value: T;
  onChange(value: T): void;
};

/**
 * Wraps a TabList and its TabPanels, which it links by value (ids, aria-controls, aria-labelledby).
 * Pass `render` to use another element, e.g. `render={<section />}`.
 */
export function Tabs<T extends string>({ value, onChange, ...rest }: TabsProps<T>) {
  return <BaseTabs.Root value={value} onValueChange={(v) => onChange(v as T)} {...rest} />;
}

export type TabListProps = { label: string; tabs: { id: string; label: string }[] };

/** Arrow keys (wrapping), Home and End move focus and select the tab, as before. */
export function TabList({ label, tabs }: TabListProps) {
  return (
    <BaseTabs.List aria-label={label} className="fsa-tabs" activateOnFocus>
      {tabs.map((t) => (
        <BaseTabs.Tab key={t.id} value={t.id} data-tab-id={t.id} className="fsa-tab fsa-touch">
          {t.label}
        </BaseTabs.Tab>
      ))}
    </BaseTabs.List>
  );
}

/** Only the active panel is mounted. */
export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Panel value={value} className="fsa-tab-panel">
      {children}
    </BaseTabs.Panel>
  );
}
