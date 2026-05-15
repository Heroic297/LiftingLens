import { useRef, useState, useEffect } from 'react';
import { Ruler, Check, X } from 'lucide-react';
import type { CalibrationData } from '../types/training';

interface CalibrationWizardProps {
  videoBlob: Blob;
  defaultPlateDiameter: number;
  onCalibrated: (cal: CalibrationData) => void;
  onSkip: () => void;
}

export function CalibrationWizard({ videoBlob, defaultPlateDiameter, onCalibrated, onSkip }: CalibrationWizardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [method, setMethod] = useState<'plate_diameter' | 'custom'>('plate_diameter');
  const [knownDistance, setKnownDistance] = useState(defaultPlateDiameter);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    video.currentTime = 0;
    video.addEventListener('loadeddata', () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      setImageSize({ w: video.videoWidth, h: video.videoHeight });
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      setFrameLoaded(true);
      URL.revokeObjectURL(url);
    });
    video.load();
  }, [videoBlob]);

  useEffect(() => {
    if (!frameLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    // Redraw just the dots
    const url2 = URL.createObjectURL(videoBlob);
    const video2 = document.createElement('video');
    video2.muted = true;
    video2.src = url2;
    video2.currentTime = 0;
    video2.addEventListener('loadeddata', () => {
      ctx.drawImage(video2, 0, 0);
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#f59e0b' : '#6366f1';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      if (points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      URL.revokeObjectURL(url2);
    });
    video2.load();
  }, [points, frameLoaded, videoBlob]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (points.length >= 2) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = imageSize.w / rect.width;
    const scaleY = imageSize.h / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setPoints((prev) => [...prev, { x, y }]);
  };

  const pixelDist = points.length === 2
    ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
    : null;

  const handleConfirm = () => {
    if (!pixelDist) return;
    const mpp = knownDistance / pixelDist;
    onCalibrated({ metersPerPixel: mpp, method, knownDistanceMeters: knownDistance, pixelDistance: pixelDist });
  };

  return (
    <div className="calibration-panel">
      <div className="section-title"><Ruler size={18} /> Calibration</div>

      <div className="cal-method-row">
        <button className={`chip ${method === 'plate_diameter' ? 'active' : ''}`} onClick={() => setMethod('plate_diameter')}>
          Standard Plate (45cm)
        </button>
        <button className={`chip ${method === 'custom' ? 'active' : ''}`} onClick={() => setMethod('custom')}>
          Custom Distance
        </button>
      </div>

      <div className="cal-distance-row">
        <label>Known distance (meters):</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={knownDistance}
          onChange={(e) => setKnownDistance(parseFloat(e.target.value) || defaultPlateDiameter)}
          className="input-sm"
        />
      </div>

      <p className="cal-instruction">
        {points.length === 0 && 'Tap the first edge of the known distance on the frame below.'}
        {points.length === 1 && 'Tap the second edge of the known distance.'}
        {points.length === 2 && `Pixel distance: ${pixelDist?.toFixed(1)}px → ${(knownDistance / pixelDist!).toFixed(6)} m/px`}
      </p>

      <canvas
        ref={canvasRef}
        className="cal-canvas"
        onClick={handleCanvasClick}
        style={{ cursor: points.length < 2 ? 'crosshair' : 'default' }}
      />

      <div className="cal-actions">
        <button className="btn-secondary" onClick={() => setPoints([])}>
          <X size={16} /> Reset Points
        </button>
        <button className="btn-secondary" onClick={onSkip}>
          Skip (Relative Only)
        </button>
        <button className="btn-primary" disabled={points.length < 2} onClick={handleConfirm}>
          <Check size={16} /> Apply Calibration
        </button>
      </div>
    </div>
  );
}
