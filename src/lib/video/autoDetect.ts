import type { ExtractedFrame } from './frameExtractor';

export interface AutoDetectResult {
  seedX: number;
  seedY: number;
  /** Index into the frames array where the bar is most likely at (seedX, seedY). */
  seedFrameIdx: number;
  plateRadiusPixels: number | null;
  motionConfidence: number;
  plateConfidence: number;
  reason: string;
}

/**
 * Auto-detects the bar/plate location by finding the area of the frame
 * with the highest cumulative motion across the video.
 *
 * Also finds the frame where the bar is most actively passing through the
 * detected seed position — used as the template seed for bidirectional
 * tracking, so the tracker starts with the right patch regardless of where
 * the bar is in frame 0 (critical for deadlifts where bar starts at floor).
 */
export function detectMarkerAuto(frames: ExtractedFrame[]): AutoDetectResult | null {
  if (frames.length < 4) return null;

  const w = frames[0].imageData.width;
  const h = frames[0].imageData.height;
  const motion = new Float32Array(w * h);

  const targetSamples = Math.min(12, frames.length - 1);
  const stride = Math.max(1, Math.floor((frames.length - 1) / targetSamples));

  let pairs = 0;
  for (let i = stride; i < frames.length; i += stride) {
    const a = frames[i - stride].imageData.data;
    const b = frames[i].imageData.data;
    for (let p = 0; p < w * h; p++) {
      const idx = p * 4;
      const la = 0.299 * a[idx] + 0.587 * a[idx + 1] + 0.114 * a[idx + 2];
      const lb = 0.299 * b[idx] + 0.587 * b[idx + 1] + 0.114 * b[idx + 2];
      const d = Math.abs(la - lb);
      if (d > 8) motion[p] += d;
    }
    pairs++;
  }

  if (pairs === 0) return null;

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

  let total = 0;
  for (let p = 0; p < motion.length; p++) total += motion[p];
  const meanPerPixel = total / motion.length;
  const peakPerPixel = bestScore / ((boxHalf * 2) * (boxHalf * 2));
  const motionConfidence = Math.min(1, peakPerPixel / Math.max(meanPerPixel * 6, 8));

  // Find the frame with peak local motion at the detected seed.
  // seedLo is relaxed to 10% so early-moving lifts (deadlift concentric starting
  // around frame 10-15%) are captured. seedHi stays at 80% to avoid
  // the bar re-racking / settling noise at the very end of the clip.
  let bestLocalScore = -1;
  let seedFrameIdx = Math.floor(frames.length / 2);
  const seedLo = Math.max(stride, Math.floor(frames.length * 0.10));
  const seedHi = Math.min(frames.length - 1, Math.floor(frames.length * 0.80));
  const lx0 = Math.max(0, Math.round(bestX) - boxHalf);
  const ly0 = Math.max(0, Math.round(bestY) - boxHalf);
  const lx1 = Math.min(w - 1, Math.round(bestX) + boxHalf);
  const ly1 = Math.min(h - 1, Math.round(bestY) + boxHalf);
  for (let fi = stride; fi < frames.length; fi += stride) {
    const a = frames[fi - stride].imageData.data;
    const b = frames[fi].imageData.data;
    let localSum = 0;
    for (let y = ly0; y <= ly1; y++) {
      for (let x = lx0; x <= lx1; x++) {
        const idx = (y * w + x) * 4;
        const la = 0.299 * a[idx] + 0.587 * a[idx + 1] + 0.114 * a[idx + 2];
        const lb = 0.299 * b[idx] + 0.587 * b[idx + 1] + 0.114 * b[idx + 2];
        const d = Math.abs(la - lb);
        if (d > 8) localSum += d;
      }
    }
    // Only update seedFrameIdx when this frame-pair falls in the central zone
    if (localSum > bestLocalScore && fi >= seedLo && fi <= seedHi) {
      bestLocalScore = localSum;
      seedFrameIdx = fi;
    }
  }

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
    seedFrameIdx,
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

  if (bestScore < 18 || bestR < 0) return null;

  const confidence = Math.min(1, (bestScore - 18) / 42);
  return { radius: bestR, confidence };
}
