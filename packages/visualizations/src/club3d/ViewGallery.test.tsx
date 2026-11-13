import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ViewGallery, type GalleryView } from './ViewGallery';

type V = 'a' | 'b' | 'c' | 'd';
const views: GalleryView<V>[] = [
  { id: 'a', name: 'Top', hint: 'Path, H-plane, face to path', ariaLabel: 'Top: Club path 8.3° R', badges: [{ id: 'clubPath', label: 'Club path', text: '8.3° R', color: '#62B6F7' }], labels: [{ id: 'l1', text: 'Club path 8.3° R', color: '#62B6F7', x: 1.4, y: -0.2 }] },
  { id: 'b', name: 'Face-on', hint: 'Attack angle, low point', ariaLabel: 'Face-on', badges: [{ id: 'aoa', label: 'Attack angle', text: null, color: '#62B6F7' }] },
  { id: 'c', name: 'Down the line', hint: 'Swing plane steepness', ariaLabel: 'Down the line', badges: [{ id: 'spinLoft', label: 'Spin loft', text: '44.9°', color: '#E66767', note: 'as reported' }] },
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

  test('labels are clamped to 4–96 % of the slot', () => {
    const { region } = setup();
    const label = within(region).getByText('Club path 8.3° R', { selector: '.view-gallery__label' });
    expect(label.style.left).toBe('96%');
    expect(label.style.top).toBe('4%');
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
