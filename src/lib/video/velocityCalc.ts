import type { TrackedPoint, SetResult, CalibrationData, LiftType } from '../../types/training';
import { segmentReps } from './repSegmentation';
import { computeMotionAxis, projectOnAxis } from './motionAxis';
import { generateId } from '../utils';

export function computeSetResult(
  points: TrackedPoint[],
  liftType: LiftType,
  calibration: CalibrationData | null,
  existingWarnings: string[] = [],
): SetResult {
  const warnings = [...existingWarnings];

  // If no explicit calibration, use a reasonable fallback so we output
  // a plausible m/s estimate instead of returning 0 or NaN.
  // 0.002 m/px assumes ~2m camera distance from bar and typical phone resolution
  // (a 45cm plate spanning ~225px → 0.45/225 ≈ 0.002). Actual values will vary,
  // but this keeps the output in the correct order-of-magnitude for RPE feedback.
  const DEFAULT_METERS_PER_PIXEL = 0.002;
  const metersPerPixel = calibration?.metersPerPixel ?? DEFAULT_METERS_PER_PIXEL;

  const avgConfidence = points.reduce((s, p) => s + p.confidence, 0) / points.length;
  if (avgConfidence < 0.4) {
    warnings.push('Low tracking confidence. Results may be inaccurate — try re-recording with better lighting or a clearer view of the bar.');
  }

  // Project 2D tracked path onto the principal motion axis (PCA).
  // This corrects for any camera angle and gives a clean 1D signal
  // for rep detection and velocity, regardless of how the camera is positioned.
  const axis = computeMotionAxis(points);
  const positions = points.map((p) => projectOnAxis(p, axis));
  const times = points.map((p) => p.time);

  if (axis.linearity < 3 && points.length > 10) {
    warnings.push('Bar motion appears non-linear — tracking may have drifted. Results are approximate.');
  }
  // Only warn about camera angle when the motion is clearly off-axis but NOT
  // close to horizontal — angles near 90° are expected for portrait-mode videos
  // where the rotation metadata isn't applied, so we'd just confuse the user.
  if (axis.angleFromVertical > 25 && axis.angleFromVertical < 70) {
    warnings.push(
      `Bar path is ${axis.angleFromVertical.toFixed(0)}° from vertical. For best accuracy, position the camera side-on to the lift.`,
    );
  }

  const { reps, warnings: segWarnings } = segmentReps(positions, times, liftType, metersPerPixel);
  warnings.push(...segWarnings);

  const velocities = reps.map((r) => r.meanConcentricVelocity);
  const setAvgVelocity =
    velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0;
  const fastestRep = velocities.length > 0 ? Math.max(...velocities) : 0;
  const slowestRep = velocities.length > 0 ? Math.min(...velocities) : 0;
  const velocityLoss = fastestRep > 0 ? ((fastestRep - slowestRep) / fastestRep) * 100 : 0;

  return {
    id: generateId(),
    timestamp: Date.now(),
    liftType,
    repCount: reps.length,
    reps,
    setAvgVelocity,
    fastestRep,
    slowestRep,
    velocityLoss,
    isCalibrated: !!calibration,
    calibration,
    confidence: avgConfidence,
    warnings,
    notes: '',
  };
}
