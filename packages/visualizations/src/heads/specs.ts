import type { ClubCategory } from '@fsa/domain';

/**
 * One description per club head, in inches and degrees. Points are in the face frame:
 * origin at the face centre, x toward the toe for a right-hander, y out of the face, z up along the face.
 */
export interface HeadSpec {
  kind: 'wood' | 'blade';
  loftDeg: number;
  lieDeg: number;
  faceWidthIn: number;
  faceHeightIn: number;
  headWidthIn: number;
  headDepthIn: number;
  headHeightIn: number;
  /** blade only: face height at the toe and heel ends, and top-line thickness. */
  toeHeightIn?: number;
  heelHeightIn?: number;
  topLineIn?: number;
  /** wood only: superellipsoid exponent of the body (default 2.5; higher is squarer), and whether the face
   *  outline's top is clamped flat at faceHeightIn / 2. */
  exponent?: number;
  flatTop?: boolean;
  /** `base` is the point on the heel, inside the body, where the hosel starts. */
  hosel: { base: [number, number, number]; lengthIn: number; radiusIn: number };
  /** clearCentreIn > 0 leaves that width in the middle of the face without lines (driver). */
  scoreLines: { count: number; spacingIn: number; clearCentreIn: number };
  finish: { body: string; face: string; lines: string; hosel: string; metalness: number; roughness: number };
}

const BLACK_FINISH: HeadSpec['finish'] = {
  body: '#1B1F23',
  face: '#AEB7BF',
  lines: '#2B3036',
  hosel: '#15191C',
  metalness: 0.3,
  roughness: 0.18,
};

export const HEAD_SPECS: Record<ClubCategory, HeadSpec> = {
  driver: {
    kind: 'wood',
    loftDeg: 10.5,
    lieDeg: 58,
    faceWidthIn: 4.3,
    faceHeightIn: 2.2,
    headWidthIn: 4.8,
    headDepthIn: 4.5,
    headHeightIn: 2.5,
    hosel: { base: [-2.0, -0.4, 0.5], lengthIn: 1.5, radiusIn: 0.25 },
    scoreLines: { count: 9, spacingIn: 0.18, clearCentreIn: 1.4 },
    finish: BLACK_FINISH,
  },
  wood: {
    kind: 'wood',
    loftDeg: 15,
    lieDeg: 58,
    faceWidthIn: 3.7,
    faceHeightIn: 1.4,
    headWidthIn: 4.2,
    headDepthIn: 3.4,
    headHeightIn: 1.6,
    flatTop: true,
    hosel: { base: [-1.7, -0.3, 0.3], lengthIn: 1.5, radiusIn: 0.24 },
    scoreLines: { count: 7, spacingIn: 0.15, clearCentreIn: 0 },
    finish: BLACK_FINISH,
  },
  hybrid: {
    kind: 'wood',
    loftDeg: 22,
    lieDeg: 59.5,
    faceWidthIn: 3.3,
    faceHeightIn: 1.4,
    headWidthIn: 3.6, // 3.9 in the design table; narrowed so the flat cut gives the full 1.4 in face height
    headDepthIn: 2.3,
    headHeightIn: 1.55,
    exponent: 3,
    flatTop: true,
    hosel: { base: [-1.5, -0.3, 0.3], lengthIn: 1.5, radiusIn: 0.23 },
    scoreLines: { count: 7, spacingIn: 0.15, clearCentreIn: 0 },
    finish: BLACK_FINISH,
  },
  iron: {
    kind: 'blade',
    loftDeg: 33,
    lieDeg: 62.5,
    faceWidthIn: 3.0,
    faceHeightIn: 1.7,
    headWidthIn: 3.2,
    headDepthIn: 0.7,
    headHeightIn: 2.2,
    toeHeightIn: 2.2,
    heelHeightIn: 1.2,
    topLineIn: 0.25,
    hosel: { base: [-1.3, -0.15, 0.2], lengthIn: 2.3, radiusIn: 0.27 },
    // spacing 0.14 in the design table; 0.13 keeps all ten lines full width under the low heel
    scoreLines: { count: 10, spacingIn: 0.13, clearCentreIn: 0 },
    finish: { body: '#8B949C', face: '#B4BCC3', lines: '#2B3036', hosel: '#6F7880', metalness: 0.6, roughness: 0.45 },
  },
};
