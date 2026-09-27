import { describe, expect, it, vi } from 'vitest';
import { computeCrop, slidersFromCrop, type CropSliders } from './cropMath';
import { assertCropAspectRatio } from './process';

// Next.js resolves `server-only` itself; outside of Next it is a no-op.
vi.mock('server-only', () => ({}));

const ROTATIONS = [0, 90, 180, 270] as const;

// Landscape, portrait and square sources combined with landscape, portrait and square targets.
const SOURCES = [
  { sourceWidth: 4000, sourceHeight: 3000 },
  { sourceWidth: 3000, sourceHeight: 4000 },
  { sourceWidth: 1200, sourceHeight: 1200 },
];
const ASPECT_RATIOS = [16 / 9, 3 / 4, 1];

const SLIDERS: Omit<CropSliders, 'rotation'>[] = [
  { zoom: 1, panX: 0, panY: 0 },
  { zoom: 1, panX: -1, panY: 1 },
  { zoom: 2, panX: 0, panY: 0 },
  { zoom: 2.5, panX: -1, panY: -1 },
  { zoom: 4, panX: 1, panY: 1 },
  { zoom: 1.37, panX: 0.42, panY: -0.73 },
];

const cases = SOURCES.flatMap((source) =>
  ASPECT_RATIOS.flatMap((aspectRatio) =>
    ROTATIONS.flatMap((rotation) =>
      SLIDERS.map((sliders) => ({
        ...source,
        aspectRatio,
        rotation,
        ...sliders,
        // Short on purpose: Vitest truncates long interpolated test names.
        label: `${source.sourceWidth}x${source.sourceHeight} ${aspectRatio.toFixed(2)} ${rotation}° z${sliders.zoom} p${sliders.panX},${sliders.panY}`,
      })),
    ),
  ),
);

function rotatedSize(sourceWidth: number, sourceHeight: number, rotation: number) {
  return rotation % 180 === 0
    ? { width: sourceWidth, height: sourceHeight }
    : { width: sourceHeight, height: sourceWidth };
}

function expectCropsToBeClose(actual: ReturnType<typeof computeCrop>, expected: ReturnType<typeof computeCrop>) {
  expect(actual.rotation).toBe(expected.rotation);
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe('computeCrop', () => {
  it.each(cases)(
    'stays inside the rotated image and keeps the target aspect ratio ($label)',
    (input) => {
      const crop = computeCrop(input);
      const rotated = rotatedSize(input.sourceWidth, input.sourceHeight, input.rotation);

      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(rotated.width + 1e-9);
      expect(crop.y + crop.height).toBeLessThanOrEqual(rotated.height + 1e-9);
      expect(crop.width / crop.height).toBeCloseTo(input.aspectRatio, 9);
      expect(crop.rotation).toBe(input.rotation);
    },
  );

  it.each(cases)('always passes the server-side aspect ratio check ($label)', (input) => {
    const crop = computeCrop(input);

    expect(() =>
      assertCropAspectRatio(crop, {
        aspectRatio: input.aspectRatio,
        maxWidth: 800,
        maxHeight: Math.round(800 / input.aspectRatio),
      }),
    ).not.toThrow();
  });

  it('uses the largest possible crop at zoom 1 (full height for a wide source)', () => {
    const crop = computeCrop({
      sourceWidth: 4000,
      sourceHeight: 3000,
      aspectRatio: 1,
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
    });

    expect(crop).toEqual({ x: 500, y: 0, width: 3000, height: 3000, rotation: 0 });
  });

  it('uses the largest possible crop at zoom 1 (full width for a tall target)', () => {
    const crop = computeCrop({
      sourceWidth: 4000,
      sourceHeight: 3000,
      aspectRatio: 16 / 9,
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
    });

    expect(crop.width).toBe(4000);
    expect(crop.height).toBeCloseTo(2250, 9);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo(375, 9);
  });

  it('halves the crop size at zoom 2', () => {
    const base = { sourceWidth: 4000, sourceHeight: 3000, aspectRatio: 1, rotation: 0 as const, panX: 0, panY: 0 };
    const atZoom1 = computeCrop({ ...base, zoom: 1 });
    const atZoom2 = computeCrop({ ...base, zoom: 2 });

    expect(atZoom2.width).toBe(atZoom1.width / 2);
    expect(atZoom2.height).toBe(atZoom1.height / 2);
  });

  it('maps pan -1/1 to the edges of the image', () => {
    const base = { sourceWidth: 4000, sourceHeight: 3000, aspectRatio: 1, rotation: 0 as const, zoom: 2 };
    const topLeft = computeCrop({ ...base, panX: -1, panY: -1 });
    const bottomRight = computeCrop({ ...base, panX: 1, panY: 1 });

    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);
    expect(bottomRight.x + bottomRight.width).toBe(4000);
    expect(bottomRight.y + bottomRight.height).toBe(3000);
  });

  it('clamps pan values outside of -1..1 to the image', () => {
    const crop = computeCrop({
      sourceWidth: 4000,
      sourceHeight: 3000,
      aspectRatio: 1,
      rotation: 0,
      zoom: 2,
      panX: 5,
      panY: -5,
    });

    expect(crop.x + crop.width).toBe(4000);
    expect(crop.y).toBe(0);
  });

  it('swaps width and height of the source for 90° and 270°', () => {
    const base = { sourceWidth: 4000, sourceHeight: 3000, aspectRatio: 1, zoom: 1, panX: 1, panY: 1 };

    // Rotated source is 3000 × 4000: the square crop spans the full width and ends at the bottom edge.
    for (const rotation of [90, 270] as const) {
      const crop = computeCrop({ ...base, rotation });
      expect(crop.width).toBe(3000);
      expect(crop.y + crop.height).toBe(4000);
    }
  });
});

describe('slidersFromCrop', () => {
  it.each(cases)('reconstructs sliders that reproduce the same crop ($label)', (input) => {
    const crop = computeCrop(input);
    const sliders = slidersFromCrop(crop, input.sourceWidth, input.sourceHeight, input.aspectRatio);
    const recomputed = computeCrop({ ...input, ...sliders });

    expectCropsToBeClose(recomputed, crop);
  });

  it.each(cases.filter((input) => input.zoom > 1))(
    'is the exact inverse of computeCrop when the crop can move in both directions ($label)',
    (input) => {
      const crop = computeCrop(input);
      const sliders = slidersFromCrop(crop, input.sourceWidth, input.sourceHeight, input.aspectRatio);

      expect(sliders.rotation).toBe(input.rotation);
      expect(sliders.zoom).toBeCloseTo(input.zoom, 9);
      expect(sliders.panX).toBeCloseTo(input.panX, 9);
      expect(sliders.panY).toBeCloseTo(input.panY, 9);
    },
  );

  it('returns pan 0 on an axis where the crop fills the whole image', () => {
    const crop = computeCrop({
      sourceWidth: 4000,
      sourceHeight: 3000,
      aspectRatio: 1,
      rotation: 0,
      zoom: 1,
      panX: 0.5,
      panY: 0.5,
    });
    const sliders = slidersFromCrop(crop, 4000, 3000, 1);

    // Height is fully used, so there is nothing to pan vertically.
    expect(sliders.panY).toBe(0);
    expect(sliders.panX).toBeCloseTo(0.5, 9);
  });

  it('falls back to zoom 1 for a degenerate crop width', () => {
    const sliders = slidersFromCrop({ x: 0, y: 0, width: 0, height: 0, rotation: 0 }, 4000, 3000, 1);

    expect(sliders.zoom).toBe(1);
  });
});
