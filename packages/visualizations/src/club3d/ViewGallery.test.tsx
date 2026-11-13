import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { ViewGallery, layoutLabels, type GalleryView } from './ViewGallery';

type V = 'a' | 'b' | 'c' | 'd';
const views: GalleryView<V>[] = [
  { id: 'a', name: 'Top', hint: 'Path, H-plane, face to path', ariaLabel: 'Top: Club path 8.3° R', badges: [{ id: 'clubPath', label: 'Club path', text: '8.3° R', color: '#62B6F7' }], labels: [{ id: 'l1', text: 'Club path 8.3° R', color: '#62B6F7', x: 1.4, y: -0.2 }] },
  { id: 'b', name: 'Face-on', hint: 'Attack angle, low point', ariaLabel: 'Face-on', badges: [{ id: 'aoa', label: 'Attack angle', text: null, color: '#62B6F7' }] },
  { id: 'c', name: 'Down the line', hint: 'Swing plane steepness', ariaLabel: 'Down the line', badges: [{ id: 'spinLoft', label: 'Spin loft', text: '44.9°', color: '#E5484D', note: 'as reported' }] },
  { id: 'd', name: '3/4 overview', hint: 'Everything in one picture', ariaLabel: '3/4 overview', badges: [] },
];
const setup = (over: Partial<Parameters<typeof ViewGallery<V>>[0]> = {}) => {
  const onSelect = vi.fn();
  render(<ViewGallery<V> label="3D club views" views={views} large="a" onSelect={onSelect} canvasRef={() => {}} webgl {...over} />);
  return { onSelect, region: screen.getByRole('region', { name: '3D club views' }) };
};

describe('ViewGallery', () => {
  test('renders the large view name, hint and badges; three thumbnails named "Show <name> view"', () => {
    const { region } = setup();
    const large = region.querySelector('.view-gallery__large') as HTMLElement;
    expect(within(large).getByText('Top')).toBeInTheDocument();
    expect(within(large).getByText('Path, H-plane, face to path')).toBeInTheDocument();
    expect(within(large).getByText('8.3° R')).toBeInTheDocument();
    expect(within(large).getByRole('img', { name: 'Top: Club path 8.3° R' })).toBeInTheDocument();
    const thumbs = within(region).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(thumbs).toEqual(['Show Face-on view', 'Show Down the line view', 'Show 3/4 overview view']);
  });

  test('clicking a thumbnail calls onSelect with its id', async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Show Down the line view' }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  test('a missing badge value renders "Not measured"; a note shows in parentheses', () => {
    setup({ large: 'b' });
    expect(screen.getByText('Attack angle').closest('li')).toHaveTextContent(/Not measured/);
    cleanupAndRender('c');
    expect(screen.getByText('Spin loft').closest('li')).toHaveTextContent('44.9° (as reported)');
  });

  test('webgl=false: fallback copy in the large slot and no canvas elements', () => {
    const { region } = setup({ webgl: false });
    expect(region.querySelector('canvas')).toBeNull();
    expect(within(region.querySelector('.view-gallery__large') as HTMLElement).getByText(/needs WebGL/)).toBeInTheDocument();
    expect(within(region).getAllByRole('button')).toHaveLength(3);
  });

  test('labels are clamped inside the slot; one near the right edge is right-anchored', () => {
    const { region } = setup();
    const label = within(region).getByText('Club path 8.3° R', { selector: '.view-gallery__label' });
    expect(label.style.left).toBe('98%');
    expect(label.style.top).toBe('4%');
    expect(label.style.transform).toBe('translate(-100%, -50%)');
  });

  test('toolbar and largeOverlay render', () => {
    setup({ toolbar: <button type="button">Play</button>, largeOverlay: <p>rotate back</p> });
    expect(screen.getByText('rotate back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});

function cleanupAndRender(large: V) {
  document.body.innerHTML = '';
  render(<ViewGallery<V> label="3D club views" views={views} large={large} onSelect={() => {}} canvasRef={() => {}} webgl />);
}

describe('layoutLabels', () => {
  const l = (id: string, x: number, y: number) => ({ id, text: id, color: '#fff', x, y });
  test('anchors by side: start near the left edge, end near the right edge, middle otherwise', () => {
    expect(layoutLabels([l('a', 0.1, 0.5), l('b', 0.5, 0.2), l('c', 0.9, 0.8)]).map((x) => x.anchor)).toEqual(['start', 'middle', 'end']);
  });
  test('labels that would overlap are pushed apart vertically by at least 0.06', () => {
    const out = layoutLabels([l('a', 0.3, 0.40), l('b', 0.35, 0.41), l('c', 0.32, 0.42)]);
    const ys = out.map((x) => x.y).sort((p, q) => p - q);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(0.06 - 1e-9);
  });
  test('labels far apart horizontally keep their own heights', () => {
    const out = layoutLabels([l('a', 0.1, 0.4), l('b', 0.8, 0.41)]);
    expect(out.map((x) => x.y)).toEqual([0.4, 0.41]);
  });
});

describe('ViewGallery canvas refs', () => {
  test('re-rendering with the same views does not detach and re-attach canvases (no resize-observer loop)', () => {
    const canvasRef = vi.fn();
    const props = { label: '3D club views', views, large: 'a' as V, onSelect: () => {}, canvasRef, webgl: true };
    const { rerender } = render(<ViewGallery<V> {...props} />);
    const attached = canvasRef.mock.calls.length;
    rerender(<ViewGallery<V> {...props} views={[...views]} />);
    rerender(<ViewGallery<V> {...props} views={[...views]} />);
    expect(canvasRef.mock.calls.filter(([, el]) => el === null)).toHaveLength(0);
    expect(canvasRef.mock.calls.length).toBe(attached);
  });
});

describe('ViewGallery minor fixes', () => {
  test('labels pushed apart near the bottom stay inside the slot', () => {
    const l = (id: string, x: number, y: number) => ({ id, text: id, color: '#fff', x, y });
    const out = layoutLabels([l('a', 0.5, 0.95), l('b', 0.52, 0.96), l('c', 0.48, 0.97)]);
    const ys = out.map((x) => x.y).sort((p, q) => p - q);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.96 + 1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.04 - 1e-9);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(0.06 - 1e-9);
  });

  test('label overlays are hidden from screen readers (the canvas aria-label already says them)', () => {
    const { region } = setup();
    const label = within(region).getByText('Club path 8.3° R', { selector: '.view-gallery__label' });
    expect(label).toHaveAttribute('aria-hidden', 'true');
  });

  test('after picking a thumbnail, keyboard focus moves to the new large view', async () => {
    function Harness() {
      const [large, setLarge] = useState<V>('a');
      return <ViewGallery<V> label="3D club views" views={views} large={large} onSelect={setLarge} canvasRef={() => {}} webgl />;
    }
    render(<Harness />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Show Down the line view' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('img', { name: 'Down the line' }));
  });

  test('focus is not moved when the large view changes for another reason (e.g. a new shot)', () => {
    const props = { label: '3D club views', views, onSelect: () => {}, canvasRef: () => {}, webgl: true };
    const { rerender } = render(<ViewGallery<V> {...props} large="a" />);
    rerender(<ViewGallery<V> {...props} large="c" />);
    expect(document.activeElement).toBe(document.body);
  });
});
