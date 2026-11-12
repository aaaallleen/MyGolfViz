import { lazy, useState, type ComponentType, type LazyExoticComponent } from 'react';

export interface LazyPage {
  (): React.JSX.Element;
  /** Download the page's code now. Shares one download with rendering; after a failure the next call retries. */
  preload(): Promise<void>;
}

// One entry per page: gives a page whose download failed a fresh start.
const resets = new Set<() => void>();

/**
 * Let pages whose download failed try again the next time they render. Called when the user asks:
 * opening a page (a fresh error boundary) or pressing "Try again". Never automatic, so an offline
 * page shows its error once instead of re-downloading in a loop.
 */
export function retryFailedPages(): void {
  for (const reset of resets) reset();
}

/**
 * A page whose code is a separate file. Once downloaded it renders directly, with no loading flash;
 * before that it suspends (wrap it in <Suspense>). A failed download reaches the nearest error boundary.
 */
export function lazyPage(load: () => Promise<ComponentType>): LazyPage {
  let loaded: ComponentType | null = null;
  let pending: Promise<ComponentType> | null = null;
  let failed = false;

  const fetchPage = () =>
    (pending ??= load().then(
      (C) => (loaded = C),
      (error: unknown) => {
        pending = null;
        failed = true;
        throw error;
      },
    ));
  // React caches a lazy component's failure, so a retry needs a fresh one.
  const makeLazy = () => lazy(() => fetchPage().then((C) => ({ default: C })));
  let Lazy: LazyExoticComponent<ComponentType> = makeLazy();
  resets.add(() => {
    if (failed && !loaded) {
      failed = false;
      Lazy = makeLazy();
    }
  });

  function Page() {
    // Chosen once per mount, so a page never swaps component type (and loses its state) mid-life.
    const [C] = useState<ComponentType>(() => loaded ?? Lazy);
    return <C />;
  }
  Page.preload = () => fetchPage().then(() => undefined);
  return Page;
}
