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

  const metersPerPixel = calibration?.metersPerPixel ?? null;

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
  if (axis.angleFromVertical > 25) {
    warnings.push(
      `Bar path is ${axis.angleFromVertical.toFixed(0)}° from vertical. For best accuracy, position the camera perpendicular to the bar's direction of travel.`,
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
