/**
 * Principal-axis analysis of 2D tracked points using PCA on the covariance
 * matrix. Lets us project the bar's image-plane motion onto its true axis
 * of travel (which may not be perfectly vertical due to camera angle),
 * giving a clean 1D signal for rep segmentation and velocity computation.
 */

export interface MotionAxis {
  meanX: number;
  meanY: number;
  /** Unit vector along principal direction (max-variance axis) */
  axisX: number;
  axisY: number;
  /** Variance along principal / secondary axes */
  primaryVariance: number;
  secondaryVariance: number;
  /** primary / secondary ratio — large value (>10) means clearly 1D motion */
  linearity: number;
  /** Angle of axis vs vertical, in degrees. 0° = perfectly vertical motion */
  angleFromVertical: number;
}

export function computeMotionAxis(points: Array<{ x: number; y: number }>): MotionAxis {
  if (points.length < 2) {
    return {
      meanX: 0,
      meanY: 0,
      axisX: 0,
      axisY: -1,
      primaryVariance: 0,
      secondaryVariance: 0,
      linearity: 0,
      angleFromVertical: 0,
    };
  }

  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= points.length;
  syy /= points.length;
  sxy /= points.length;

  // Eigenvalues of [[sxx, sxy], [sxy, syy]]
  const trace = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) + 4 * sxy * sxy));
  const lam1 = (trace + disc) / 2;
  const lam2 = (trace - disc) / 2;

  // Eigenvector for lam1
  let ax: number;
  let ay: number;
  if (Math.abs(sxy) > 1e-6) {
    ax = lam1 - syy;
    ay = sxy;
  } else if (sxx >= syy) {
    ax = 1;
    ay = 0;
  } else {
    ax = 0;
    ay = 1;
  }
  const len = Math.hypot(ax, ay) || 1;
  ax /= len;
  ay /= len;

  // Make sure axisY <= 0 so positive projection = upward in image coords.
  // (Image Y increases downward; "up in the gym" = decreasing Y.)
  if (ay > 0) {
    ax = -ax;
    ay = -ay;
  }

  // Angle from vertical (0,-1)
  const dot = -ay; // axisY=-1 dot with (ax,ay) = -ay
  const angleFromVertical = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;

  return {
    meanX: mx,
    meanY: my,
    axisX: ax,
    axisY: ay,
    primaryVariance: lam1,
    secondaryVariance: lam2,
    linearity: lam1 / Math.max(lam2, 0.01),
    angleFromVertical,
  };
}

/**
 * Project a point onto the principal axis. Result is signed scalar
 * displacement along the axis, with positive = "up in the gym."
 */
export function projectOnAxis(point: { x: number; y: number }, axis: MotionAxis): number {
  const dx = point.x - axis.meanX;
  const dy = point.y - axis.meanY;
  // Positive when in the direction of the axis vector (which we forced to point upward)
  return dx * axis.axisX + dy * axis.axisY;
}
