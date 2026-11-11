import type { ClubCategory } from '@fsa/domain';

/**
 * Face outlines, face-on, right-handed (toe on the left, heel on the right).
 * `d` is the path from docs/design/frames/08 (400×300 frame coordinates);
 * `centre` is the face centre in those coordinates and `widthIn` the real face
 * width it is scaled to, so the outline is drawn at the diagram's 1 in = 40 px.
 */
export interface FaceOutline {
  d: string;
  centre: { x: number; y: number };
  frameWidth: number;
  widthIn: number;
  hosel?: { x1: number; y1: number; x2: number; y2: number };
  grooves?: { x1: number; x2: number; ys: number[] };
}

export const FACE_OUTLINES: Record<ClubCategory, FaceOutline> = {
  driver: {
    d: 'M45 150 C45 95 90 66 200 62 C310 66 358 96 360 150 C358 205 300 236 200 238 C100 236 45 205 45 150 Z',
    centre: { x: 202.5, y: 150 },
    frameWidth: 315,
    widthIn: 4.5,
  },
  wood: {
    d: 'M60 150 C60 112 100 96 200 94 C300 96 342 114 344 150 C342 186 296 204 200 206 C104 204 60 188 60 150 Z',
    centre: { x: 202, y: 150 },
    frameWidth: 284,
    widthIn: 4.0,
  },
  iron: {
    d: 'M60 215 L50 95 C52 70 85 62 110 70 L320 120 C335 124 340 140 336 160 L328 215 C326 228 315 232 300 232 L85 232 C70 232 62 226 60 215 Z',
    centre: { x: 205, y: 165 },
    frameWidth: 290,
    widthIn: 3.2,
    hosel: { x1: 328, y1: 128, x2: 366, y2: 26 },
    grooves: { x1: 100, x2: 310, ys: [125, 140, 155, 170, 185, 200, 215] },
  },
};
