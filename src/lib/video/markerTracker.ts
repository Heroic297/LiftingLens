import type { TrackedPoint } from '../../types/training';
import type { ExtractedFrame } from './frameExtractor';

const PATCH_HALF = 14;
const PATCH_SIZE = PATCH_HALF * 2;
const PATCH_AREA = PATCH_SIZE * PATCH_SIZE;

export interface TrackOptions {
  /** Max horizontal search offset per frame (px). Smaller = less drift sideways. */
  horizontalRadius: number;
  /** Max vertical search offset per frame (px). Larger = handles fast lifts. */
  verticalRadius: number;
  /** Search grid step in pixels. Smaller = more accurate, slower. */
  step: number;
  /** Threshold above which the adaptive template is refreshed. */
  templateUpdateThreshold: number;
  /** Below this score we treat the frame as a low-confidence track. */
  lowConfidenceThreshold: number;
}

const DEFAULT_OPTS: TrackOptions = {
  horizontalRadius: 30,
  verticalRadius: 80,
  step: 2,
  templateUpdateThreshold: 0.88,
  lowConfidenceThreshold: 0.45,
};

function rgbToGray(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    // Rec.601 luma — approximated with shifts/integer math would be faster but precision matters here
    out[i] = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) | 0;
  }
  return out;
}

interface PatchStats {
  mean: number;
  stdScaled: number; // sqrt(Σ(x-mean)²)
}

function extractGrayPatch(gray: Uint8Array, w: number, h: number, cx: number, cy: number): Uint8Array | null {
  const x0 = Math.round(cx) - PATCH_HALF;
  const y0 = Math.round(cy) - PATCH_HALF;
  if (x0 < 0 || y0 < 0 || x0 + PATCH_SIZE > w || y0 + PATCH_SIZE > h) return null;
  const patch = new Uint8Array(PATCH_AREA);
  for (let dy = 0; dy < PATCH_SIZE; dy++) {
    const srcOff = (y0 + dy) * w + x0;
    const dstOff = dy * PATCH_SIZE;
    for (let dx = 0; dx < PATCH_SIZE; dx++) {
      patch[dstOff + dx] = gray[srcOff + dx];
    }
  }
  return patch;
}

function patchStats(patch: Uint8Array): PatchStats {
  let sum = 0;
  for (let i = 0; i < PATCH_AREA; i++) sum += patch[i];
  const mean = sum / PATCH_AREA;
  let sq = 0;
  for (let i = 0; i < PATCH_AREA; i++) {
    const d = patch[i] - mean;
    sq += d * d;
  }
  return { mean, stdScaled: Math.sqrt(sq) || 1 };
}

/**
 * Zero-mean normalized cross-correlation. Robust to lighting changes.
 * Returns score in [-1, 1]; 1.0 = perfect match.
 */
function zncc(a: Uint8Array, statsA: PatchStats, b: Uint8Array): number {
  let sumB = 0;
  for (let i = 0; i < PATCH_AREA; i++) sumB += b[i];
  const meanB = sumB / PATCH_AREA;

  let num = 0;
  let sqB = 0;
  for (let i = 0; i < PATCH_AREA; i++) {
    const da = a[i] - statsA.mean;
    const db = b[i] - meanB;
    num += da * db;
    sqB += db * db;
  }
  const stdB = Math.sqrt(sqB) || 1;
  return num / (statsA.stdScaled * stdB);
}

/**
 * Track a marker through a video using template matching with adaptive
 * refresh. Key robustness measures:
 *
 *  - Grayscale ZNCC matching (resistant to lighting changes)
 *  - Two templates compared each frame: the *original* (anchors the track)
 *    and an *adaptive* one (handles slow drift like rotation/motion blur)
 *  - Constant-velocity motion prediction so the search window centers on
 *    where the bar is likely to be
 *  - Asymmetric search radius (taller than wide) since lifting motion is
 *    primarily vertical — prevents drift sideways onto the lifter
 *  - Track halts early if confidence stays low for several frames, rather
 *    than producing junk position estimates that poison rep detection
 */
export function trackMarker(
  frames: ExtractedFrame[],
  startX: number,
  startY: number,
  searchRadius: number,
  opts: Partial<TrackOptions> = {},
): TrackedPoint[] {
  if (frames.length === 0) return [];

  const o: TrackOptions = {
    ...DEFAULT_OPTS,
    horizontalRadius: Math.min(DEFAULT_OPTS.horizontalRadius, searchRadius),
    verticalRadius: Math.max(DEFAULT_OPTS.verticalRadius, searchRadius),
    ...opts,
  };

  const w = frames[0].imageData.width;
  const h = frames[0].imageData.height;
  const grays: Uint8Array[] = frames.map((f) => rgbToGray(f.imageData.data, w, h));

  let cx = startX;
  let cy = startY;
  const origPatch = extractGrayPatch(grays[0], w, h, cx, cy);
  if (!origPatch) return [];
  const origStats = patchStats(origPatch);
  let curPatch = origPatch;
  let curStats = origStats;

  const points: TrackedPoint[] = [
    { x: cx, y: cy, time: frames[0].time, confidence: 1 },
  ];

  let velX = 0;
  let velY = 0;
  let lowStreak = 0;

  for (let i = 1; i < frames.length; i++) {
    const gray = grays[i];

    // Predict — damp prediction to avoid runaway
    const predX = cx + velX * 0.7;
    const predY = cy + velY * 0.7;

    // Widen search when we've been struggling — handles inter-rep pauses
    // (e.g. deadlift bar resting on floor) where the adaptive template drifts
    const recovering = lowStreak > 4;
    const hRad = recovering ? o.horizontalRadius * 2 : o.horizontalRadius;
    const vRad = recovering ? o.verticalRadius * 2 : o.verticalRadius;
    const searchStep = recovering ? o.step * 2 : o.step;

    let bestScore = -2;
    let bestX = cx;
    let bestY = cy;

    for (let dy = -vRad; dy <= vRad; dy += searchStep) {
      for (let dx = -hRad; dx <= hRad; dx += searchStep) {
        const nx = predX + dx;
        const ny = predY + dy;
        const patch = extractGrayPatch(gray, w, h, nx, ny);
        if (!patch) continue;
        // During recovery, rely only on the original (stable) template
        const s1 = recovering ? -2 : zncc(curPatch, curStats, patch);
        const s2 = zncc(origPatch, origStats, patch);
        const score = s1 > s2 ? s1 : s2;
        if (score > bestScore) {
          bestScore = score;
          bestX = nx;
          bestY = ny;
        }
      }
    }

    // Map [-1, 1] to [0, 1], with -0.2 ≈ 0 (noise floor)
    const confidence = Math.max(0, Math.min(1, (bestScore - (-0.2)) / 1.2));

    velX = bestX - cx;
    velY = bestY - cy;
    cx = bestX;
    cy = bestY;
    points.push({ x: cx, y: cy, time: frames[i].time, confidence });

    if (bestScore > o.templateUpdateThreshold) {
      const fresh = extractGrayPatch(gray, w, h, cx, cy);
      if (fresh) {
        curPatch = fresh;
        curStats = patchStats(fresh);
      }
      lowStreak = 0;
    } else if (bestScore < o.lowConfidenceThreshold) {
      lowStreak++;
      // Stop only after ~2 seconds of continuous failure — brief low-confidence
      // stretches are expected between reps (bar at rest, partial occlusion).
      if (lowStreak > 28) break;
    } else {
      lowStreak = 0;
    }
  }

  return points;
}
