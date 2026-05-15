import { useRef, useState, useEffect, useCallback } from 'react';
import { Crosshair, Play, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { extractFrames } from '../lib/video/frameExtractor';
import { trackMarker } from '../lib/video/markerTracker';
import { computeSetResult } from '../lib/video/velocityCalc';

interface VideoAnalyzerProps {
  onComplete: () => void;
}

export function VideoAnalyzer({ onComplete }: VideoAnalyzerProps) {
  const { recordedBlob, calibration, selectedLift, settings, setCurrentSetResult, setAnalyzing, setAnalysisProgress, isAnalyzing, analysisProgress } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [markerSet, setMarkerSet] = useState(false);
  const [markerPos, setMarkerPos] = useState<{ x: number; y: number } | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [error, setError] = useState<string | null>(null);

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
      setFrameLoaded(true);
      URL.revokeObjectURL(url);
    });
    video.load();
  }, [recordedBlob]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (markerSet || isAnalyzing) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = imgSize.w / rect.width;
    const scaleY = imgSize.h / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setMarkerPos({ x, y });

    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();

    setMarkerSet(true);
  }, [markerSet, isAnalyzing, imgSize]);

  const runAnalysis = useCallback(async () => {
    if (!recordedBlob || !markerPos) return;
    setAnalyzing(true);
    setError(null);

    try {
      const frames = await extractFrames(recordedBlob, settings.sampleRate, (pct) => setAnalysisProgress(pct * 0.7));
      if (frames.length < 5) throw new Error('Video too short or frame extraction failed.');

      setAnalysisProgress(70);
      const points = trackMarker(frames, markerPos.x, markerPos.y, settings.markerSearchRadius);
      setAnalysisProgress(90);

      const result = computeSetResult(points, selectedLift, calibration);
      setCurrentSetResult(result);
      setAnalysisProgress(100);
      setTimeout(onComplete, 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Try re-recording.');
    } finally {
      setAnalyzing(false);
    }
  }, [recordedBlob, markerPos, settings, selectedLift, calibration, setAnalyzing, setAnalysisProgress, setCurrentSetResult, onComplete]);

  if (!recordedBlob) return null;

  return (
    <div className="analyzer-panel">
      <div className="section-title"><Crosshair size={18} /> Select Tracking Marker</div>

      {calibration ? (
        <div className="info-badge">Calibrated — results in m/s</div>
      ) : (
        <div className="warn-badge"><AlertTriangle size={14} /> No calibration — relative velocity only</div>
      )}

      <p className="hint">Tap the bar sleeve, collar, or visible plate edge to set the tracking point.</p>

      <canvas
        ref={canvasRef}
        className="analyzer-canvas"
        onClick={handleCanvasClick}
        style={{ cursor: markerSet ? 'default' : 'crosshair' }}
      />

      {frameLoaded && !markerSet && (
        <p className="hint small">👆 Tap on the video frame above to place the tracking marker.</p>
      )}

      {isAnalyzing && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${analysisProgress}%` }} />
          <span className="progress-label">{analysisProgress < 70 ? 'Extracting frames…' : analysisProgress < 90 ? 'Tracking marker…' : 'Computing velocity…'}</span>
        </div>
      )}

      {error && <div className="error-box"><AlertTriangle size={16} /> {error}</div>}

      <div className="analyzer-actions">
        <button
          className="btn-secondary"
          onClick={() => { setMarkerSet(false); setMarkerPos(null); }}
          disabled={!markerSet || isAnalyzing}
        >
          Reset Marker
        </button>
        <button
          className="btn-primary large"
          onClick={runAnalysis}
          disabled={!markerSet || isAnalyzing}
        >
          <Play size={18} /> {isAnalyzing ? `Analyzing… ${Math.round(analysisProgress)}%` : 'Run Analysis'}
        </button>
      </div>
    </div>
  );
}
