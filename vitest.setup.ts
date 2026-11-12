import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';

// jsdom has no pointer capture; Sonner calls it when a toast is pressed (for swipe-to-dismiss).
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

// NumberFlow is a custom element with shadow DOM and Web Animations, none of which jsdom can run
// (under Node it also loads its server build, which never registers the element). Stand in with the
// same Intl text it would show; the e2e suite exercises the real component in Chromium.
vi.mock('@number-flow/react', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ value, locales, format }: { value: number; locales?: Intl.LocalesArgument; format?: Intl.NumberFormatOptions }) =>
      createElement('span', { 'data-number-flow': '' }, new Intl.NumberFormat(locales, format).format(value)),
  };
});

afterEach(cleanup);
// Sonner keeps toasts in module state and replays active ones to every newly mounted <Toaster />,
// so without this a toast from one test shows up in the next.
afterEach(() => {
  toast.dismiss();
});
