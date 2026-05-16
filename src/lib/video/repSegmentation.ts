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
 *
 * Lift-type-aware segmentation:
 *   - Deadlift: concentric-only (no eccentric return expected). If no valley
 *     is found, the start of the clip is used as the implicit bottom — even
 *     for signals that begin mid-concentric (bar rising from frame 0).
 *   - Squat / Bench: expect a valley (bottom position) followed by a peak.
 *
 * Minimum rep duration enforced per-frame to filter noise spikes at RPE 8–9:
 *   at least 8 frames at the clip’s sample rate.
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

  const isDeadlift = liftType === 'deadlift';

  // Adaptive smoothing: ~0.25 s regardless of frame rate
  const totalTime = times[times.length - 1] - times[0];
  const fps = positions.length / Math.max(totalTime, 0.001);
  const rawWindow = Math.round(fps * 0.25);
  const smoothWindow = Math.max(3, Math.min(11, rawWindow % 2 === 0 ? rawWindow + 1 : rawWindow));
  const smoothed = smooth(positions, smoothWindow);

  // Minimum rep duration in frames: at least 8 frames (prevents noise spikes
  // from being counted as reps, especially at RPE 8-9 where bar slows near
  // sticking point and acceleration noise can split a single rep).
  const minRepFrames = Math.max(8, Math.round(fps * 0.30));

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
  let valleys = findValleys(smoothed, minProminence).sort((a, b) => a.index - b.index);

  // For deadlift: if no valleys are found (concentric-only clip with no
  // eccentric return), synthesize an implicit valley at the signal start.
  // Also lower the prominence threshold slightly for peak-finding since
  // the sticking-point dip in RPE 8-9 deadlifts can suppress the main peak.
  if (isDeadlift && valleys.length === 0) {
    valleys = [{ index: 0, value: smoothed[0] }];
  }

  // For deadlift with no peaks found (e.g. bar rises monotonically from start
  // to end with no clear global maximum due to noise), synthesize the peak at
  // the position of maximum value.
  let effectivePeaks = peaks;
  if (isDeadlift && peaks.length === 0 && smoothed[smoothed.length - 1] > smoothed[0]) {
    const maxIdx = smoothed.indexOf(Math.max(...smoothed));
    effectivePeaks = [{ index: maxIdx, value: smoothed[maxIdx] }];
  }

  const reps: RepResult[] = [];
  const usedValleyIndices = new Set<number>();
  let repNum = 1;

  for (const peak of effectivePeaks) {
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
    // For deadlift this is the common case (bar rises from floor from frame 0).
    if (!prevValley && peak.index > 0 && smoothed[0] < peak.value - minProminence * 0.5) {
      prevValley = { index: 0, value: smoothed[0] };
    }

    if (!prevValley) continue;

    const romProj = peak.value - prevValley.value;
    if (romProj < totalRange * 0.20) continue; // ignore micro-movements

    // Enforce minimum frame gap to prevent noise spikes from being counted as reps
    if (peak.index - prevValley.index < minRepFrames) continue;

    usedValleyIndices.add(prevValley.index);

    const startIdx = prevValley.index;
    const endIdx = peak.index;
    const posSlice = smoothed.slice(startIdx, endIdx + 1);
    const tSlice = times.slice(startIdx, endIdx + 1);

    const startTime = tSlice[0];
    const endTime = tSlice[tSlice.length - 1];
    const duration = endTime - startTime;
    // Minimum concentric time: 0.3s (relaxed from 0.4s to catch fast RPE 6 reps)
    if (duration < 0.3) continue;

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

  return { reps, smoothedPositions: smoothed, warnings };
}
