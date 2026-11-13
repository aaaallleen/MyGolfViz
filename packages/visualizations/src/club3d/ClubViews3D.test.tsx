import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { annotations3D } from './annotations';
import { buildClubScene } from './buildScene';
import { camera3D, projectOrtho } from './cameras';
import { ClubViews3D, boxCorners, framePoints } from './ClubViews3D';
import { frameCamera } from './renderer';
import { REF_M, mOf, sceneOf } from './testFixtures';
import type { Mode3D, View3D } from './types';

const scene = sceneOf(REF_M);
const setup = (over: Partial<Parameters<typeof ClubViews3D>[0]> = {}) => {
  const onSelect = vi.fn<(v: View3D) => void>();
  const onMode = vi.fn<(m: Mode3D) => void>();
  render(<ClubViews3D scene={scene} m={REF_M} club="7 Iron" others={[]} large="faceOn" onSelect={onSelect} mode="views" onMode={onMode} {...over} />);
  return { onSelect, onMode, gallery: screen.queryByRole('region', { name: '3D club views' }) as HTMLElement };
};
const large = (g: HTMLElement) => g.querySelector('.view-gallery__large') as HTMLElement;

describe('ClubViews3D', () => {
  test('opens on the large view passed in; thumbnails are Top, Down the line and 3/4 overview', () => {
    const { gallery } = setup();
    expect(within(large(gallery)).getByText('Face-on')).toBeInTheDocument();
    expect(within(gallery).getAllByRole('button', { name: /^Show / }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Show Top view', 'Show Down the line view', 'Show 3/4 overview view']);
  });

  test('Face-on badges and aria-label list the attack angle and low point', () => {
    const { gallery } = setup();
    const l = large(gallery);
    expect(within(l).getByText('Attack angle').closest('li')).toHaveTextContent('4.0° down');
    expect(within(l).getByText('Low point').closest('li')).toHaveTextContent('2.5 in ahead');
    expect(within(l).getByRole('img').getAttribute('aria-label')).toBe('Face-on: Attack angle 4.0° down, Low point 2.5 in ahead');
  });

  test('clicking a thumbnail asks for that view', async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Show Top view' }));
    expect(onSelect).toHaveBeenCalledWith('top');
  });

  test('All shots is disabled with no other shots and enabled with some', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'All shots' })).toBeDisabled();
    document.body.innerHTML = '';
    setup({ others: [sceneOf(mOf({ swingH: 4, swingV: 58, aoa: -2 }), 'right', 'o')] });
    expect(screen.getByRole('checkbox', { name: 'All shots' })).toBeEnabled();
  });

  test('shows the illustrative banner, replay controls and the head-size provenance note', () => {
    setup();
    expect(screen.getByText('Illustrative reconstruction')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument();
    expect(screen.getByText('Club head and ball drawn 3× life size so they read; angles are true in the Views cameras')).toBeInTheDocument();
  });

  test('Views mode: fixed cameras only, no Reset view (nothing to drag)', () => {
    const { gallery } = setup();
    expect(gallery).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset view' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Views' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the mode switch asks for 3D reconstruction', async () => {
    const { onMode } = setup();
    await userEvent.click(screen.getByRole('button', { name: '3D reconstruction' }));
    expect(onMode).toHaveBeenCalledWith('reconstruction');
  });

  test('3D reconstruction mode: one draggable viewer with every main value, Reset view disabled until moved, no thumbnails', () => {
    setup({ mode: 'reconstruction' });
    expect(screen.queryByRole('region', { name: '3D club views' })).toBeNull();
    const viewer = screen.getByRole('region', { name: '3D reconstruction' });
    expect(within(viewer).getByText('Drag to rotate · scroll or pinch to zoom')).toBeInTheDocument();
    expect(Array.from(viewer.querySelectorAll('.view-badges__label')).map((e) => e.textContent))
      .toEqual(['Club path', 'H-plane', 'V-plane', 'Attack angle', 'Face to path']);
    expect(within(viewer).queryAllByRole('button', { name: /^Show / })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'All shots' })).toBeInTheDocument();
  });

  test('a shot with only one of H-plane / V-plane says why the arc is missing, not that nothing was measured', () => {
    const m = mOf({ swingV: 60, aoa: -2 });
    setup({ scene: sceneOf(m), m });
    expect(screen.getByText('Swing arc not drawn: it needs both H-plane and V-plane')).toBeInTheDocument();
    expect(screen.queryByText('Club delivery not measured for this shot')).toBeNull();
  });

  test('a shot without swing plane data says club delivery was not measured', () => {
    const m = mOf({ ftt: 1 });
    setup({ scene: sceneOf(m), m });
    expect(screen.getByText('Club delivery not measured for this shot')).toBeInTheDocument();
  });

  test.each(['right', 'left'] as const)('a Driver below the ground line (35°, high-heel strike, %s) stays inside every measuring view', (hand) => {
    const m = { ...REF_M, dynamicLoft: 35, impactLateral: -0.5, impactVertical: 0.5 };
    const sc = sceneOf(m, hand);
    const s = buildClubScene({ scene: sc, m, club: 'Driver', others: [], headScale: 3, mode: '3d', annotations: [] });
    s.setProgress(0.63);
    s.root.updateMatrixWorld(true);
    const head = new THREE.Box3().setFromObject(s.root.getObjectByName('club-head')!, true);
    expect(head.min.z).toBeLessThan(0); // the case that used to clip: the head reaches below the ground
    // the head's real extremes, its lowest point among them
    const must = boxCorners({ min: head.min.toArray(), max: head.max.toArray() });
    for (const v of ['dtl', 'faceOn', 'top'] as const) {
      for (const aspect of [1.6, 0.6]) {
        const cam = frameCamera(camera3D(v, sc, m), framePoints(sc, annotations3D(v, sc, m), s.headBounds), aspect);
        for (const p of must) {
          const q = projectOrtho(cam, p, aspect);
          expect(q.x, `${v} x`).toBeGreaterThanOrEqual(0.05 - 1e-9);
          expect(q.x, `${v} x`).toBeLessThanOrEqual(0.95 + 1e-9);
          expect(q.y, `${v} y`).toBeGreaterThanOrEqual(0.05 - 1e-9);
          expect(q.y, `${v} y`).toBeLessThanOrEqual(0.95 + 1e-9);
        }
      }
    }
    s.dispose();
  });
});
