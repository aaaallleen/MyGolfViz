import type { ReactNode } from 'react';
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

const clampPct = (f: number) => `${Math.round(Math.min(0.96, Math.max(0.04, f)) * 1000) / 10}%`;

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
  const main = views.find((v) => v.id === large) ?? views[0]!;
  const thumbs = views.filter((v) => v.id !== main.id);
  return (
    <section className="view-gallery" aria-label={label}>
      {toolbar && <div className="view-gallery__toolbar">{toolbar}</div>}
      <div className="view-gallery__grid">
        <div className="view-gallery__large">
          <div className="view-gallery__stage">
            {webgl ? (
              <canvas key={main.id} ref={(el) => canvasRef(main.id, el)} role="img" aria-label={main.ariaLabel} className="view-gallery__canvas" />
            ) : (
              <p className="view-gallery__fallback" role="img" aria-label={main.ariaLabel}>
                This view needs WebGL, which this browser doesn't provide. The numbers are below.
              </p>
            )}
            {webgl && main.labels?.map((l) => (
              <span key={l.id} className="view-gallery__label" style={{ left: clampPct(l.x), top: clampPct(l.y), color: l.color }}>{l.text}</span>
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
                  ? <canvas key={v.id} ref={(el) => canvasRef(v.id, el)} aria-hidden="true" className="view-gallery__canvas" />
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
