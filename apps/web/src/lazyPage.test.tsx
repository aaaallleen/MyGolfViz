import { act, render, screen } from '@testing-library/react';
import { Suspense, useState, type ComponentType } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { lazyPage } from './lazyPage';

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function Counter() {
  const [n, setN] = useState(0);
  return <button type="button" onClick={() => setN(n + 1)}>{`Count ${n}`}</button>;
}

const shell = (Page: ComponentType, key = 'a') => (
  <ViewErrorBoundary key={key}>
    <Suspense fallback={<p>Loading page…</p>}><Page /></Suspense>
  </ViewErrorBoundary>
);

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => spy.mockRestore());

test('a preloaded page renders straight away, with no loading fallback', async () => {
  const Page = lazyPage(async () => Counter);
  await Page.preload();
  render(shell(Page));
  expect(screen.getByRole('button', { name: 'Count 0' })).toBeInTheDocument();
  expect(screen.queryByText('Loading page…')).toBeNull();
});

test('a page not yet loaded shows the fallback, then the page; preload and render share one download', async () => {
  const d = deferred<ComponentType>();
  const load = vi.fn(() => d.promise);
  const Page = lazyPage(load);
  void Page.preload();
  render(shell(Page));
  expect(screen.getByText('Loading page…')).toBeInTheDocument();
  await act(async () => d.resolve(Counter));
  expect(screen.getByRole('button', { name: 'Count 0' })).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(1);
});

test('a page that arrived late keeps its state when its parent re-renders', async () => {
  const d = deferred<ComponentType>();
  const Page = lazyPage(() => d.promise);
  const { rerender } = render(shell(Page));
  await act(async () => d.resolve(Counter));
  await act(async () => screen.getByRole('button', { name: 'Count 0' }).click());
  rerender(shell(Page));
  expect(screen.getByRole('button', { name: 'Count 1' })).toBeInTheDocument();
});

const offlineThenOnline = () => {
  let attempt = 0;
  const Page = lazyPage(async () => {
    attempt += 1;
    if (attempt === 1) throw new TypeError('Failed to fetch dynamically imported module: /assets/OverviewPage.js');
    return Counter;
  });
  return { Page, attempts: () => attempt };
};
const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));

test('a failed download shows the load error once, without retrying by itself; opening the page again retries', async () => {
  const { Page, attempts } = offlineThenOnline();
  const { rerender } = render(shell(Page, 'first'));
  expect(await screen.findByText("This page couldn't be loaded")).toBeInTheDocument();
  await settle();
  expect(attempts()).toBe(1); // no download loop while offline
  rerender(shell(Page, 'second')); // navigating remounts the boundary
  expect(await screen.findByRole('button', { name: 'Count 0' })).toBeInTheDocument();
  expect(attempts()).toBe(2);
});

test('"Try again" on the load error downloads the page again', async () => {
  const { Page, attempts } = offlineThenOnline();
  render(shell(Page));
  const retry = await screen.findByRole('button', { name: 'Try again' });
  await act(async () => retry.click());
  expect(await screen.findByRole('button', { name: 'Count 0' })).toBeInTheDocument();
  expect(attempts()).toBe(2);
});

test('preload swallows nothing: a failed preload rejects, and the next call tries again', async () => {
  let attempt = 0;
  const Page = lazyPage(async () => {
    attempt += 1;
    if (attempt === 1) throw new TypeError('offline');
    return Counter;
  });
  await expect(Page.preload()).rejects.toThrow('offline');
  await expect(Page.preload()).resolves.toBeUndefined();
  expect(attempt).toBe(2);
});
