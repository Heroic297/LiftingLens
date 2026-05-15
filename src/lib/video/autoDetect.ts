import type { ExtractedFrame } from './frameExtractor';

export interface AutoDetectResult {
  seedX: number;
  seedY: number;
  plateRadiusPixels: number | null;
  motionConfidence: number;
  plateConfidence: number;
  reason: string;
}

/**
 * Auto-detects the bar/plate location by finding the area of the frame
 * with the highest cumulative motion across the video.
 *
 * Idea: the camera is stationary; whatever is moving is (mostly) the bar.
 * We aggregate frame-to-frame luminance differences and find the spatial
 * region with the highest sustained motion. This seeds the patch tracker.
 *
 * Returns null only on absurdly short/empty input — even low-confidence
 * results are returned so the UI can flag them.
 */
export function detectMarkerAuto(frames: ExtractedFrame[]): AutoDetectResult | null {
  if (frames.length < 4) return null;

  const w = frames[0].imageData.width;
  const h = frames[0].imageData.height;
  const motion = new Float32Array(w * h);

  // Sample frame pairs evenly across the video — every Nth frame
  const targetSamples = Math.min(12, frames.length - 1);
  const stride = Math.max(1, Math.floor((frames.length - 1) / targetSamples));

  let pairs = 0;
  for (let i = stride; i < frames.length; i += stride) {
    const a = frames[i - stride].imageData.data;
    const b = frames[i].imageData.data;
    for (let p = 0; p < w * h; p++) {
      const idx = p * 4;
      // Grayscale (luminance) — Rec.601 weights
      const la = 0.299 * a[idx] + 0.587 * a[idx + 1] + 0.114 * a[idx + 2];
      const lb = 0.299 * b[idx] + 0.587 * b[idx + 1] + 0.114 * b[idx + 2];
      const d = Math.abs(la - lb);
      // Threshold low-noise pixels to ignore lighting flicker
      if (d > 8) motion[p] += d;
    }
    pairs++;
  }

  if (pairs === 0) return null;

  // Build an integral image for fast box-sum queries
  const integral = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += motion[y * w + x];
      integral[y * w + x] = row + (y > 0 ? integral[(y - 1) * w + x] : 0);
    }
  }
  const boxSum = (x0: number, y0: number, x1: number, y1: number) => {
    const A = x0 > 0 && y0 > 0 ? integral[(y0 - 1) * w + (x0 - 1)] : 0;
    const B = y0 > 0 ? integral[(y0 - 1) * w + x1] : 0;
    const C = x0 > 0 ? integral[y1 * w + (x0 - 1)] : 0;
    const D = integral[y1 * w + x1];
    return D - B - C + A;
  };

  // Use a box approximately the size of a plate (5% of min dimension)
  const boxHalf = Math.max(14, Math.floor(Math.min(w, h) * 0.04));
  const stepX = Math.max(2, Math.floor(w / 200));
  const stepY = Math.max(2, Math.floor(h / 200));

  let bestScore = -Infinity;
  let bestX = w / 2;
  let bestY = h / 2;
  for (let y = boxHalf; y < h - boxHalf; y += stepY) {
    for (let x = boxHalf; x < w - boxHalf; x += stepX) {
      const s = boxSum(x - boxHalf, y - boxHalf, x + boxHalf, y + boxHalf);
      if (s > bestScore) {
        bestScore = s;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Confidence = peak-to-mean ratio (how concentrated is the motion?)
  let total = 0;
  for (let p = 0; p < motion.length; p++) total += motion[p];
  const meanPerPixel = total / motion.length;
  const peakPerPixel = bestScore / ((boxHalf * 2) * (boxHalf * 2));
  const motionConfidence = Math.min(1, peakPerPixel / Math.max(meanPerPixel * 6, 8));

  // Try to detect a plate-shaped circle around the seed
  const midFrame = frames[Math.floor(frames.length / 2)];
  const plate = detectPlateCircle(midFrame.imageData, bestX, bestY);

  const reason =
    motionConfidence > 0.55
      ? plate
        ? `Detected bar at (${Math.round(bestX)}, ${Math.round(bestY)}) · plate ~${plate.radius}px`
        : `Detected motion center at (${Math.round(bestX)}, ${Math.round(bestY)}) · no plate circle found`
      : `Motion is diffuse — auto-detection may be unreliable`;

  return {
    seedX: bestX,
    seedY: bestY,
    plateRadiusPixels: plate?.radius ?? null,
    motionConfidence,
    plateConfidence: plate?.confidence ?? 0,
    reason,
  };
}

interface PlateCircle {
  radius: number;
  confidence: number;
}

/**
 * Simple plate circle detector: scans concentric rings around (cx, cy) and
 * finds the radius with the strongest inner/outer luminance contrast.
 *
 * Works best when the plate is reasonably side-on (round, not heavily
 * elliptical) and has decent contrast against the background. Designed to
 * be fast — single pass, no Hough accumulator.
 */
function detectPlateCircle(imageData: ImageData, cx: number, cy: number): PlateCircle | null {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  const lumAt = (x: number, y: number): number => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return -1;
    const i = (iy * w + ix) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  const maxR = Math.min(cx, cy, w - cx, h - cy) - 4;
  const minR = 20;
  if (maxR < minR + 10) return null;

  let bestR = -1;
  let bestScore = 0;

  for (let r = minR; r <= Math.min(maxR, 220); r += 2) {
    let edgeSum = 0;
    let samples = 0;
    for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 24) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const inner = lumAt(cx + (r - 5) * cosT, cy + (r - 5) * sinT);
      const outer = lumAt(cx + (r + 5) * cosT, cy + (r + 5) * sinT);
      if (inner < 0 || outer < 0) continue;
      edgeSum += Math.abs(inner - outer);
      samples++;
    }
    if (samples >= 30) {
      const score = edgeSum / samples;
      if (score > bestScore) {
        bestScore = score;
        bestR = r;
      }
    }
  }

  // Edge contrast threshold — below this the "circle" is too weak to trust
  if (bestScore < 18 || bestR < 0) return null;

  // Confidence: 0 at score 18 → ~1 at score 60+
  const confidence = Math.min(1, (bestScore - 18) / 42);
  return { radius: bestR, confidence };
}
