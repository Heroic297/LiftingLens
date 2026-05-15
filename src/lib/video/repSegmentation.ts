import type { LiftType, RepResult } from '../../types/training';
import { movingAverage } from '../utils';

export interface SegmentationResult {
  reps: RepResult[];
  smoothedY: number[];
  warnings: string[];
}

function detectPeaksAndValleys(arr: number[]): { peaks: number[]; valleys: number[] } {
  const peaks: number[] = [];
  const valleys: number[] = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) peaks.push(i);
    if (arr[i] < arr[i - 1] && arr[i] < arr[i + 1]) valleys.push(i);
  }
  return { peaks, valleys };
}

export function segmentReps(
  yPositions: number[],
  times: number[],
  liftType: LiftType,
  metersPerPixel: number | null,
  minRomPixels = 20,
): SegmentationResult {
  const warnings: string[] = [];

  if (yPositions.length < 5) {
    warnings.push('Too few tracking points to segment reps.');
    return { reps: [], smoothedY: yPositions, warnings };
  }

  const smoothed = movingAverage(yPositions, 7);

  // In image coords, Y increases downward
  // Concentric direction:
  //   squat/bench: bar moves UP = y decreases
  //   deadlift: bar moves UP = y decreases
  //   overhead_press: bar moves UP = y decreases
  //   row: bar moves UP = y decreases (pulling toward body)
  // So concentric = decreasing Y for most lifts

  const { peaks, valleys } = detectPeaksAndValleys(smoothed);

  // Pair valleys → peaks (concentric: from bottom to top = valley to peak in raw y)
  // Actually since Y increases downward: bottom of lift = high Y (valley in inverted), top = low Y
  // peaks in smoothed Y = bottom of lift
  // valleys in smoothed Y = top of lift
  // concentric = from peak to valley (moving up)

  const reps: RepResult[] = [];

  if (peaks.length === 0 || valleys.length === 0) {
    warnings.push('Could not detect rep peaks/valleys. Check marker tracking or lift direction.');
    return { reps, smoothedY: smoothed, warnings };
  }

  // Build concentric segments: peak → next valley
  const sortedPeaks = [...peaks].sort((a, b) => a - b);
  const sortedValleys = [...valleys].sort((a, b) => a - b);

  let repNum = 1;
  for (const peak of sortedPeaks) {
    const nextValley = sortedValleys.find((v) => v > peak);
    if (!nextValley) continue;

    const romPixels = smoothed[peak] - smoothed[nextValley];
    if (Math.abs(romPixels) < minRomPixels) continue;

    const startTime = times[peak];
    const endTime = times[nextValley];
    const duration = endTime - startTime;
    if (duration <= 0) continue;

    const ySlice = smoothed.slice(peak, nextValley + 1);
    const tSlice = times.slice(peak, nextValley + 1);

    // Compute velocity at each frame pair
    const velocities: number[] = [];
    for (let i = 1; i < ySlice.length; i++) {
      const dy = ySlice[i - 1] - ySlice[i]; // upward movement = positive
      const dt = tSlice[i] - tSlice[i - 1];
      if (dt > 0) {
        const pixelVel = dy / dt;
        const vel = metersPerPixel ? pixelVel * metersPerPixel : pixelVel;
        if (vel > 0) velocities.push(vel);
      }
    }

    if (velocities.length === 0) continue;

    const meanVel = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const peakVel = Math.max(...velocities);
    const romMeters = metersPerPixel ? Math.abs(romPixels) * metersPerPixel : null;

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
    warnings.push('No complete reps detected. Try adjusting marker position or recording more of the lift.');
  }

  return { reps, smoothedY: smoothed, warnings };
}
