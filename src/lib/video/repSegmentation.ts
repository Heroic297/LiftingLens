import type { LiftType, RepResult } from '../../types/training';

export interface SegmentationResult {
  reps: RepResult[];
  smoothedPositions: number[];
  warnings: string[];
}

/** Symmetric moving-average with edge clamping. */
function smooth(arr: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return arr.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(arr.length - 1, i + half);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += arr[j];
    return sum / (end - start + 1);
  });
}

interface Extreme { index: number; value: number; }

/**
 * Find local maxima with minimum prominence. Prominence = how much a peak
 * rises above the highest "saddle" connecting it to a taller neighbor.
 * This filters noise while preserving real rep peaks even in noisy signals.
 */
function findPeaks(arr: number[], minProminence: number): Extreme[] {
  const peaks: Extreme[] = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] <= arr[i - 1] || arr[i] <= arr[i + 1]) continue;
    let leftBase = arr[i];
    for (let j = i - 1; j >= 0; j--) {
      if (arr[j] >= arr[i]) break;
      if (arr[j] < leftBase) leftBase = arr[j];
    }
    let rightBase = arr[i];
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j] >= arr[i]) break;
      if (arr[j] < rightBase) rightBase = arr[j];
    }
    const prominence = arr[i] - Math.max(leftBase, rightBase);
    if (prominence >= minProminence) peaks.push({ index: i, value: arr[i] });
  }
  return peaks;
}

function findValleys(arr: number[], minProminence: number): Extreme[] {
  const neg = arr.map((v) => -v);
  return findPeaks(neg, minProminence).map((p) => ({ index: p.index, value: arr[p.index] }));
}

/**
 * Segment reps from 1D positions projected onto the principal motion axis
 * (positive = "up in the gym"). Each rep is the concentric segment:
 * valley (bottom of lift) → peak (top of lift).
 *
 * Uses prominence-based peak detection so real reps are found even when
 * the signal has noise, wobbles, or camera shake — the threshold adapts
 * to the actual range of motion in the clip.
 */
export function segmentReps(
  positions: number[],
  times: number[],
  liftType: LiftType,
  metersPerPixel: number | null,
): SegmentationResult {
  const warnings: string[] = [];

  if (positions.length < 10) {
    warnings.push('Too few tracking points to segment reps.');
    return { reps: [], smoothedPositions: positions, warnings };
  }

  // Adaptive smoothing: ~0.25 s regardless of frame rate
  const totalTime = times[times.length - 1] - times[0];
  const fps = positions.length / Math.max(totalTime, 0.001);
  const rawWindow = Math.round(fps * 0.25);
  const smoothWindow = Math.max(3, Math.min(11, rawWindow % 2 === 0 ? rawWindow + 1 : rawWindow));
  const smoothed = smooth(positions, smoothWindow);

  const minVal = Math.min(...smoothed);
  const maxVal = Math.max(...smoothed);
  const totalRange = maxVal - minVal;

  if (totalRange < 5) {
    warnings.push('Very little bar movement detected. Check marker placement and ensure the full lift is in frame.');
    return { reps: [], smoothedPositions: smoothed, warnings };
  }

  // Prominence threshold: 25% of observed range.
  // Real reps easily exceed this; breathing wobbles and small drift do not.
  const minProminence = totalRange * 0.25;

  const peaks = findPeaks(smoothed, minProminence).sort((a, b) => a.index - b.index);
  const valleys = findValleys(smoothed, minProminence).sort((a, b) => a.index - b.index);

  const reps: RepResult[] = [];
  const usedValleyIndices = new Set<number>();
  let repNum = 1;

  for (const peak of peaks) {
    // Find the most recent unused valley before this peak
    let prevValley: Extreme | null = null;
    for (let vi = valleys.length - 1; vi >= 0; vi--) {
      if (valleys[vi].index < peak.index && !usedValleyIndices.has(valleys[vi].index)) {
        prevValley = valleys[vi];
        break;
      }
    }

    // If no explicit valley precedes the first peak, use the signal start as an
    // implicit bottom — handles recordings that begin mid-concentric.
    if (!prevValley && peak.index > 0 && smoothed[0] < peak.value - minProminence * 0.5) {
      prevValley = { index: 0, value: smoothed[0] };
    }

    if (!prevValley) continue;

    const romProj = peak.value - prevValley.value;
    if (romProj < totalRange * 0.20) continue; // ignore micro-movements

    usedValleyIndices.add(prevValley.index);

    const startIdx = prevValley.index;
    const endIdx = peak.index;
    const posSlice = smoothed.slice(startIdx, endIdx + 1);
    const tSlice = times.slice(startIdx, endIdx + 1);

    const startTime = tSlice[0];
    const endTime = tSlice[tSlice.length - 1];
    const duration = endTime - startTime;
    if (duration < 0.4) continue; // real concentric reps take at least ~0.4s

    // Velocity: only count frames where the bar is moving upward (concentric)
    const velocities: number[] = [];
    for (let i = 1; i < posSlice.length; i++) {
      const dpos = posSlice[i] - posSlice[i - 1]; // positive = moving up
      const dt = tSlice[i] - tSlice[i - 1];
      if (dt > 0 && dpos > 0) {
        const pv = dpos / dt;
        velocities.push(metersPerPixel ? pv * metersPerPixel : pv);
      }
    }

    if (velocities.length === 0) continue;

    const meanVel = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const peakVel = Math.max(...velocities);
    const romMeters = metersPerPixel ? romProj * metersPerPixel : null;

    reps.push({
      repNumber: repNum++,
      meanConcentricVelocity: meanVel,
      peakConcentricVelocity: peakVel,
      rom: romMeters,
      duration,
      startTime,
      endTime,
    });
  }

  if (reps.length === 0) {
    warnings.push('No complete reps detected. Try adjusting marker position or recording the full lift from start to finish.');
  }

  // Suppress lift-type parameter warning — kept for future lift-specific tuning
  void liftType;

  return { reps, smoothedPositions: smoothed, warnings };
}
