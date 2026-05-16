import { useRef, useState, useEffect, useCallback } from 'react';
import { Crosshair, Play, AlertTriangle, Wand2, MousePointerClick, Dumbbell } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { extractFrames } from '../lib/video/frameExtractor';
import { trackMarker } from '../lib/video/markerTracker';
import { computeSetResult } from '../lib/video/velocityCalc';
import { detectMarkerAuto } from '../lib/video/autoDetect';
import type { LiftType, TrackedPoint } from '../types/training';
import { liftLabel } from '../lib/utils';

interface VideoAnalyzerProps {
  onComplete: () => void;
}

type Stage = 'idle' | 'extracting' | 'detecting' | 'tracking' | 'computing' | 'manual';

/**
 * Infer lift type from the 2D tracked trajectory.
 *
 * Portrait-mode videos (phone held vertically) store pixel data rotated 90° —
 * the browser ignores the rotation metadata, so "up in the gym" maps to
 * "left or right" in pixel space. We detect this and use the X axis instead of Y.
 */
function classifyLiftType(points: TrackedPoint[], frameW: number, frameH: number): LiftType {
  if (points.length < 5) return 'squat';

  const isPortrait = frameH > frameW * 1.2;

  // For portrait videos the bar moves horizontally; use X values.
  // For landscape videos the bar moves vertically; use Y values.
  const vals = isPortrait ? points.map((p) => p.x) : points.map((p) => p.y);
  const dim = isPortrait ? frameW : frameH;

  const meanVal = vals.reduce((a, b) => a + b, 0) / vals.length;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal;

  // In both orientations: higher value = lower position in the gym
  // (image Y increases downward; portrait X also increases away from "up" side)
  const relMean = meanVal / dim;
  const relRange = range / dim;

  // Dwell fraction: time spent near the "bottom" of the bar's own range
  const dwellThresh = maxVal - range * 0.15;
  const dwellFrac = vals.filter((v) => v >= dwellThresh).length / vals.length;

  if (relMean > 0.58 || (relMean > 0.44 && dwellFrac > 0.25 && relRange > 0.12)) {
    return 'deadlift';
  }
  if (relMean < 0.28 && relRange > 0.10) {
    return 'overhead_press';
  }
  if (relRange < 0.14 && relMean > 0.35 && relMean < 0.65) {
    return 'bench';
  }
  return 'squat';
}

export function VideoAnalyzer({ onComplete }: VideoAnalyzerProps) {
  const {
    recordedBlob,
    calibration,
    setCalibration,
    selectedLift,
    setLift,
    settings,
    setCurrentSetResult,
    setAnalyzing,
    setAnalysisProgress,
    isAnalyzing,
    analysisProgress,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [stageLabel, setStageLabel] = useState('');
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [error, setError] = useState<string | null>(null);
  const [manualPos, setManualPos] = useState<{ x: number; y: number } | null>(null);
  const [autoDetectedPos, setAutoDetectedPos] = useState<{ x: number; y: number; radius: number | null } | null>(null);
  const [detectedLift, setDetectedLift] = useState<LiftType | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    video.currentTime = 0;
    video.addEventListener('loadeddata', () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      setImgSize({ w: video.videoWidth, h: video.videoHeight });
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
    });
    video.load();
  }, [recordedBlob]);

  const drawMarker = useCallback((x: number, y: number, radius: number | null, color: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    video.currentTime = 0;
    video.addEventListener('loadeddata', () => {
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      if (radius) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      URL.revokeObjectURL(url);
    });
    video.load();
  }, [recordedBlob]);

  const runFullAnalysis = useCallback(async () => {
    if (!recordedBlob) return;
    setAnalyzing(true);
    setError(null);
    setAutoDetectedPos(null);
    setManualPos(null);
    setDetectedLift(null);

    try {
      setStage('extracting');
      setStageLabel('Extracting frames…');
      const frames = await extractFrames(recordedBlob, settings.sampleRate, (pct) => setAnalysisProgress(pct * 0.5));
      if (frames.length === 0) {
        throw new Error('Could not extract frames from the recording. Your browser may not support seeking this video format — try a different browser or re-record.');
      }
      if (frames.length < 5) {
        throw new Error(`Only ${frames.length} frame(s) extracted — the video may be very short or corrupted. Try re-recording for at least 3–5 seconds.`);
      }

      setStage('detecting');
      setStageLabel('Auto-detecting bar…');
      setAnalysisProgress(55);
      await new Promise((r) => setTimeout(r, 16));

      const auto = detectMarkerAuto(frames);
      if (!auto) throw new Error('Could not analyze frames — try re-recording.');

      if (auto.motionConfidence < 0.35) {
        setStage('manual');
        setStageLabel('');
        setAnalyzing(false);
        setError('Auto-detection confidence was low. Tap on the bar in the frame below to set the marker manually.');
        return;
      }

      setAutoDetectedPos({ x: auto.seedX, y: auto.seedY, radius: auto.plateRadiusPixels });
      drawMarker(auto.seedX, auto.seedY, auto.plateRadiusPixels, '#4ee2ec');

      let activeCalibration = calibration;
      if (!activeCalibration && auto.plateRadiusPixels && auto.plateConfidence > 0.35) {
        const pixelDiameter = auto.plateRadiusPixels * 2;
        const metersPerPixel = settings.defaultPlateDiameter / pixelDiameter;
        activeCalibration = {
          metersPerPixel,
          method: 'plate_diameter',
          knownDistanceMeters: settings.defaultPlateDiameter,
          pixelDistance: pixelDiameter,
        };
        setCalibration(activeCalibration);
      }

      setStage('tracking');
      setStageLabel('Tracking motion…');
      setAnalysisProgress(70);
      await new Promise((r) => setTimeout(r, 16));

      const frameW = frames[0].imageData.width;
      const frameH = frames[0].imageData.height;

      // Portrait-mode videos (phone held vertically) store pixel data in landscape
      // orientation internally — the browser reads raw pixels without applying the
      // rotation metadata. This means "up in the gym" = left/right in pixel space.
      // We swap the tracker's horizontal/vertical search radii so it searches widely
      // in the actual direction of motion.
      const isPortrait = frameH > frameW * 1.2;
      // Portrait: wide horizontal search (bar moves mostly left/right in raw pixels),
      // narrow vertical (prevents drift perpendicular to motion).
      const trackOpts = isPortrait
        ? { horizontalRadius: 80, verticalRadius: 30 }
        : {};

      // Bidirectional tracking from the frame where bar motion peaks at the
      // detected seed. This ensures the template is always of the bar itself,
      // not background — critical when bar starts at a different height (deadlift).
      let points: TrackedPoint[];
      const seedIdx = auto.seedFrameIdx;
      if (seedIdx <= 1) {
        points = trackMarker(frames, auto.seedX, auto.seedY, settings.markerSearchRadius, trackOpts);
      } else {
        const forwardFrames = frames.slice(seedIdx);
        const backwardFrames = frames.slice(0, seedIdx + 1).reverse();

        const fwd = trackMarker(forwardFrames, auto.seedX, auto.seedY, settings.markerSearchRadius, trackOpts);
        const bwd = trackMarker(backwardFrames, auto.seedX, auto.seedY, settings.markerSearchRadius, trackOpts);
        bwd.reverse();

        // bwd covers [0..seedIdx], fwd covers [seedIdx..end]. Drop the duplicate seedFrame.
        points = [...bwd.slice(0, -1), ...fwd];
      }

      // Infer lift type from the trajectory.
      // For portrait videos, bar motion is horizontal in pixel space —
      // use X position relative to frame width rather than Y/height.
      const inferredLift = classifyLiftType(points, frameW, frameH);
      setDetectedLift(inferredLift);
      setLift(inferredLift);

      setStage('computing');
      setStageLabel('Computing velocity…');
      setAnalysisProgress(92);
      await new Promise((r) => setTimeout(r, 16));

      const warnings: string[] = [];
      if (auto.motionConfidence < 0.6) {
        warnings.push('Auto-detection confidence was moderate — verify the marker on the frame and re-analyze manually if needed.');
      }
      if (!activeCalibration) {
        warnings.push('No calibration — velocity is in relative units. Tap "Calibrate" on results for m/s.');
      }

      const result = computeSetResult(points, inferredLift, activeCalibration, warnings);
      setCurrentSetResult(result);
      setAnalysisProgress(100);
      setStage('idle');
      setTimeout(onComplete, 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Try re-recording.');
      setStage('idle');
    } finally {
      setAnalyzing(false);
    }
  }, [recordedBlob, settings, calibration, setCalibration, setLift, setAnalyzing, setAnalysisProgress, setCurrentSetResult, drawMarker, onComplete]);

  useEffect(() => {
    if (hasRunRef.current || !recordedBlob) return;
    hasRunRef.current = true;
    const t = setTimeout(() => { runFullAnalysis(); }, 100);
    return () => clearTimeout(t);
  }, [recordedBlob, runFullAnalysis]);

  const handleManualClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (stage !== 'manual' || !recordedBlob) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = imgSize.w / rect.width;
    const scaleY = imgSize.h / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setManualPos({ x, y });
    drawMarker(x, y, null, '#f59e0b');
  }, [stage, recordedBlob, imgSize, drawMarker]);

  const runManualTrack = useCallback(async () => {
    if (!manualPos || !recordedBlob) return;
    setAnalyzing(true);
    setError(null);
    try {
      setStage('extracting');
      setStageLabel('Extracting frames…');
      const frames = await extractFrames(recordedBlob, settings.sampleRate, (pct) => setAnalysisProgress(pct * 0.6));

      setStage('tracking');
      setStageLabel('Tracking motion…');
      setAnalysisProgress(70);
      await new Promise((r) => setTimeout(r, 16));
      const mfW = frames[0].imageData.width;
      const mfH = frames[0].imageData.height;
      const mOpts = mfH > mfW * 1.2 ? { horizontalRadius: 80, verticalRadius: 30 } : {};
      const points = trackMarker(frames, manualPos.x, manualPos.y, settings.markerSearchRadius, mOpts);

      setStage('computing');
      setStageLabel('Computing velocity…');
      setAnalysisProgress(92);
      await new Promise((r) => setTimeout(r, 16));

      const warnings: string[] = [];
      if (!calibration) warnings.push('No calibration — velocity is in relative units.');

      const result = computeSetResult(points, selectedLift, calibration, warnings);
      setCurrentSetResult(result);
      setAnalysisProgress(100);
      setStage('idle');
      setTimeout(onComplete, 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.');
      setStage('idle');
    } finally {
      setAnalyzing(false);
    }
  }, [manualPos, recordedBlob, settings, selectedLift, calibration, setAnalyzing, setAnalysisProgress, setCurrentSetResult, onComplete]);

  const retryAuto = useCallback(() => {
    hasRunRef.current = false;
    setError(null);
    setStage('idle');
    setManualPos(null);
    setAutoDetectedPos(null);
    setDetectedLift(null);
    runFullAnalysis();
  }, [runFullAnalysis]);

  const running = isAnalyzing || (stage !== 'idle' && stage !== 'manual');

  return (
    <div className="analyzer-panel">
      <div className="section-title">
        <Wand2 size={14} /> Auto Analysis
      </div>

      {calibration ? (
        <div className="info-badge">Calibrated — results in m/s</div>
      ) : (
        <div className="warn-badge">
          <AlertTriangle size={14} /> Relative velocity (no calibration yet)
        </div>
      )}

      {detectedLift && !running && !error && (
        <div className="info-badge">
          <Dumbbell size={14} /> Detected: {liftLabel(detectedLift)}
        </div>
      )}

      {autoDetectedPos && !running && !error && (
        <div className="info-badge">
          <Crosshair size={14} /> Bar detected at ({Math.round(autoDetectedPos.x)}, {Math.round(autoDetectedPos.y)})
          {autoDetectedPos.radius && ` · plate ~${autoDetectedPos.radius}px`}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="analyzer-canvas"
        onClick={handleManualClick}
        style={{ cursor: stage === 'manual' && !manualPos ? 'crosshair' : 'default' }}
      />

      {running && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${analysisProgress}%` }} />
          <span className="progress-label">{stageLabel || 'Working…'} {Math.round(analysisProgress)}%</span>
        </div>
      )}

      {error && (
        <div className="error-box">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {stage === 'manual' && (
        <>
          <p className="hint small">
            <MousePointerClick size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Tap the bar sleeve, collar, or plate edge in the frame above.
          </p>
          <div className="analyzer-actions">
            <button className="btn-secondary" onClick={retryAuto}>
              <Wand2 size={14} /> Retry Auto
            </button>
            <button className="btn-primary large" onClick={runManualTrack} disabled={!manualPos}>
              <Play size={16} /> Analyze Manual
            </button>
          </div>
        </>
      )}

      {!running && stage !== 'manual' && error && (
        <div className="analyzer-actions">
          <button className="btn-primary" onClick={retryAuto}>
            <Wand2 size={16} /> Retry
          </button>
        </div>
      )}
    </div>
  );
}
