import type { Vec3 } from '@fsa/domain';

/** The four cameras of the 3D tab, in thumbnail order. */
export type View3D = 'top' | 'faceOn' | 'dtl' | 'overview';
/** The four views of the 2D tab, in thumbnail order. */
export type View2D = 'ftt' | 'ftp' | 'loft' | 'spinAxis';

export const VIEWS_3D: readonly View3D[] = ['top', 'faceOn', 'dtl', 'overview'];
export const VIEWS_2D: readonly View2D[] = ['ftt', 'ftp', 'loft', 'spinAxis'];

/** A camera in scene coordinates (yards; x right of target, y to target, z up). */
export interface ViewCamera {
  kind: 'ortho' | 'persp';
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  /** ortho: half-height of the view in yards; persp: vertical field of view in degrees. */
  size: number;
}
