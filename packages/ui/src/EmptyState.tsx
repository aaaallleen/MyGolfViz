import type { ReactNode } from 'react';

export type EmptyStateProps = { title: string; body: string; action?: ReactNode };

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="fsa-empty">
      <h2 className="fsa-empty__title">{title}</h2>
      <p className="fsa-empty__body">{body}</p>
      {action}
    </div>
  );
}
