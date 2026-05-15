import type { TrackedPoint } from '../../types/training';
import type { ExtractedFrame } from './frameExtractor';

const PATCH_HALF = 12;

function extractPatch(data: ImageData, cx: number, cy: number): Uint8ClampedArray {
  const size = PATCH_HALF * 2;
  const patch = new Uint8ClampedArray(size * size * 4);
  let pi = 0;
  for (let dy = -PATCH_HALF; dy < PATCH_HALF; dy++) {
    for (let dx = -PATCH_HALF; dx < PATCH_HALF; dx++) {
      const px = Math.round(cx) + dx;
      const py = Math.round(cy) + dy;
      const inBounds = px >= 0 && px < data.width && py >= 0 && py < data.height;
      const si = inBounds ? (py * data.width + px) * 4 : -1;
      patch[pi++] = inBounds ? data.data[si] : 0;
      patch[pi++] = inBounds ? data.data[si + 1] : 0;
      patch[pi++] = inBounds ? data.data[si + 2] : 0;
      patch[pi++] = 255;
    }
  }
  return patch;
}

function patchError(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let err = 0;
  for (let i = 0; i < a.length; i += 4) {
    err += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return err / (a.length / 4);
}

export function trackMarker(
  frames: ExtractedFrame[],
  startX: number,
  startY: number,
  searchRadius: number,
): TrackedPoint[] {
  if (frames.length === 0) return [];

  const points: TrackedPoint[] = [];
  let cx = startX;
  let cy = startY;
  const refPatch = extractPatch(frames[0].imageData, cx, cy);

  points.push({ x: cx, y: cy, time: frames[0].time, confidence: 1.0 });

  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    let bestX = cx;
    let bestY = cy;
    let bestErr = Infinity;

    const step = 4;
    for (let dy = -searchRadius; dy <= searchRadius; dy += step) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= frame.imageData.width || ny >= frame.imageData.height) continue;
        const patch = extractPatch(frame.imageData, nx, ny);
        const err = patchError(refPatch, patch);
        if (err < bestErr) {
          bestErr = err;
          bestX = nx;
          bestY = ny;
        }
      }
    }

    // Confidence: lower error = higher confidence
    const maxErr = 80;
    const confidence = Math.max(0, 1 - bestErr / maxErr);

    points.push({ x: bestX, y: bestY, time: frame.time, confidence });
    cx = bestX;
    cy = bestY;
  }

  return points;
}
