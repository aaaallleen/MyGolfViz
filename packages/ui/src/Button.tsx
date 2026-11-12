import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'secondary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={clsx('fsa-btn', 'fsa-touch', `fsa-btn--${variant}`, className)} {...rest} />;
}
