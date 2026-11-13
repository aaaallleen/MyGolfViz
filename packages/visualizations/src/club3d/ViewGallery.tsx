import { useRef, type ReactNode } from 'react';
import { Missing } from '@fsa/ui';
import type { Badge } from './annotations';

export interface GalleryLabel { id: string; text: string; color: string; x: number; y: number }

export interface GalleryView<V extends string> {
  id: V;
  name: string;
  hint: string;
  ariaLabel: string;
  badges: Badge[];
  /** Slot fractions (0..1, y down); drawn on the large view only. */
  labels?: GalleryLabel[];
}

export interface ViewGalleryProps<V extends string> {
  label: string;
  views: GalleryView<V>[];
  large: V;
  onSelect(v: V): void;
  /** Called with each slot's canvas so the parent can draw into it. */
  canvasRef(id: V, el: HTMLCanvasElement | null): void;
  webgl: boolean;
  toolbar?: ReactNode;
  largeOverlay?: ReactNode;
}

const clamp = (f: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, f));
const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;
const MIN_GAP_Y = 0.06;
const NEAR_X = 0.3;
const TRANSFORM = { start: 'translate(0, -50%)', middle: 'translate(-50%, -50%)', end: 'translate(-100%, -50%)' } as const;

export interface PlacedLabel extends GalleryLabel { anchor: 'start' | 'middle' | 'end' }

/** Keeps labels inside the slot (anchored toward the nearer edge) and pushes overlapping ones apart vertically. */
export function layoutLabels(labels: GalleryLabel[]): PlacedLabel[] {
  const placed = labels.map((l) => ({
    ...l,
    x: clamp(l.x, 0.02, 0.98),
    y: clamp(l.y, 0.04, 0.96),
    anchor: (l.x < 0.25 ? 'start' : l.x > 0.75 ? 'end' : 'middle') as PlacedLabel['anchor'],
  }));
  const byY = [...placed].sort((a, b) => a.y - b.y);
  for (let i = 0; i < byY.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = byY[j]!, b = byY[i]!;
      if (Math.abs(a.x - b.x) < NEAR_X && b.y - a.y < MIN_GAP_Y) b.y = a.y + MIN_GAP_Y;
    }
  }
  return placed;
}

export function Badges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className="view-badges">
      {badges.map((b) => (
        <li key={b.id} className="view-badges__item">
          <span className="view-badges__swatch" aria-hidden="true" style={{ background: b.color }} />
          <span className="view-badges__label">{b.label}</span>{' '}
          <strong className="view-badges__value" style={b.text === null ? undefined : { color: b.color }}>
            {b.text === null ? <Missing /> : b.text}
          </strong>
          {b.note && <span className="view-badges__note">{` (${b.note})`}</span>}
        </li>
      ))}
    </ul>
  );
}

/** One large view plus thumbnails; picking a thumbnail swaps it into the large slot. */
export function ViewGallery<V extends string>({ label, views, large, onSelect, canvasRef, webgl, toolbar, largeOverlay }: ViewGalleryProps<V>) {
  // Stable ref callbacks per view id: a new callback each render would detach and re-attach every canvas.
  const latest = useRef(canvasRef);
  latest.current = canvasRef;
  const refs = useRef(new Map<V, (el: HTMLCanvasElement | null) => void>());
  const refFor = (id: V) => {
    let f = refs.current.get(id);
    if (!f) { f = (el) => latest.current(id, el); refs.current.set(id, f); }
    return f;
  };
  const main = views.find((v) => v.id === large) ?? views[0]!;
  const thumbs = views.filter((v) => v.id !== main.id);
  return (
    <section className="view-gallery" aria-label={label}>
      {toolbar && <div className="view-gallery__toolbar">{toolbar}</div>}
      <div className="view-gallery__grid">
        <div className="view-gallery__large">
          <div className="view-gallery__stage">
            {webgl ? (
              <canvas key={main.id} ref={refFor(main.id)} role="img" aria-label={main.ariaLabel} className="view-gallery__canvas" />
            ) : (
              <p className="view-gallery__fallback" role="img" aria-label={main.ariaLabel}>
                This view needs WebGL, which this browser doesn't provide. The numbers are below.
              </p>
            )}
            {webgl && layoutLabels(main.labels ?? []).map((l) => (
              <span key={l.id} className="view-gallery__label" style={{ left: pct(l.x), top: pct(l.y), color: l.color, transform: TRANSFORM[l.anchor] }}>{l.text}</span>
            ))}
            {largeOverlay}
          </div>
          <div className="view-gallery__caption">
            <h4 className="view-gallery__name">{main.name}</h4>
            <span className="view-gallery__hint">{main.hint}</span>
          </div>
          <Badges badges={main.badges} />
        </div>
        <div className="view-gallery__thumbs">
          {thumbs.map((v) => (
            <button key={v.id} type="button" className="view-gallery__thumb" aria-label={`Show ${v.name} view`} onClick={() => onSelect(v.id)}>
              <span className="view-gallery__stage view-gallery__stage--thumb">
                {webgl
                  ? <canvas key={v.id} ref={refFor(v.id)} aria-hidden="true" className="view-gallery__canvas" />
                  : <span className="view-gallery__fallback view-gallery__fallback--thumb" aria-hidden="true">{v.name}</span>}
              </span>
              <span className="view-gallery__thumb-name">{v.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
