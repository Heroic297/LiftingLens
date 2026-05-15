import type { TrackedPoint, SetResult, CalibrationData, LiftType } from '../../types/training';
import { segmentReps } from './repSegmentation';
import { generateId } from '../utils';

export function computeSetResult(
  points: TrackedPoint[],
  liftType: LiftType,
  calibration: CalibrationData | null,
  existingWarnings: string[] = [],
): SetResult {
  const warnings = [...existingWarnings];

  const yPositions = points.map((p) => p.y);
  const times = points.map((p) => p.time);
  const metersPerPixel = calibration?.metersPerPixel ?? null;

  const avgConfidence = points.reduce((s, p) => s + p.confidence, 0) / points.length;
  if (avgConfidence < 0.4) {
    warnings.push('Low tracking confidence. Results may be inaccurate — consider re-tracking.');
  }

  const { reps, warnings: segWarnings } = segmentReps(yPositions, times, liftType, metersPerPixel);
  warnings.push(...segWarnings);

  const velocities = reps.map((r) => r.meanConcentricVelocity);
  const setAvgVelocity = velocities.length > 0
    ? velocities.reduce((a, b) => a + b, 0) / velocities.length
    : 0;
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
