import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'secondary', className, type = 'button', ...rest }: ButtonProps) {
  const cls = ['fsa-btn', 'fsa-touch', `fsa-btn--${variant}`, className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}
