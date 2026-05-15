import { useRef, useState, useEffect, useCallback } from 'react';
import { Video, Square, RotateCcw, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { LiftType } from '../types/training';
import { liftLabel } from '../lib/utils';

const LIFT_OPTIONS: LiftType[] = ['squat', 'bench', 'deadlift', 'overhead_press', 'row', 'other'];

interface CameraRecorderProps {
  onRecordingComplete: () => void;
}

export function CameraRecorder({ onRecordingComplete }: CameraRecorderProps) {
  const { selectedLift, setLift, setRecordedBlob, recordedBlob } = useAppStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setError('Camera permission denied or unavailable. Please allow camera access and try again.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stopCamera]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: getSupportedMimeType() });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      setRecordedBlob(blob);
      if (previewRef.current) {
        previewRef.current.src = URL.createObjectURL(blob);
      }
      stopCamera();
    };
    mr.start(100);
    mediaRecorderRef.current = mr;
    setRecording(true);
    setElapsed(0);
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [setRecordedBlob, stopCamera]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    setRecordedBlob(null);
    setElapsed(0);
  }, [setRecordedBlob]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="recorder-panel">
      <div className="lift-selector">
        {LIFT_OPTIONS.map((l) => (
          <button
            key={l}
            className={`lift-chip ${selectedLift === l ? 'active' : ''}`}
            onClick={() => setLift(l)}
          >
            {liftLabel(l)}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      {!recordedBlob ? (
        <div className="camera-area">
          <video ref={videoRef} className="camera-preview" playsInline muted autoPlay />
          {!cameraActive && !recording && (
            <div className="camera-overlay">
              <button className="btn-primary large" onClick={startCamera}>
                <Video size={20} /> Enable Camera
              </button>
            </div>
          )}
          {cameraActive && !recording && (
            <div className="recording-controls">
              <button className="btn-record" onClick={startRecording}>
                <span className="record-dot" /> Record Set
              </button>
            </div>
          )}
          {recording && (
            <div className="recording-controls">
              <div className="recording-timer">● {formatTime(elapsed)}</div>
              <button className="btn-stop" onClick={stopRecording}>
                <Square size={18} /> Stop
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="recorded-area">
          <video ref={previewRef} className="camera-preview" controls playsInline />
          <div className="recorded-actions">
            <button className="btn-secondary" onClick={reset}>
              <RotateCcw size={16} /> Re-record
            </button>
            <button className="btn-primary" onClick={onRecordingComplete}>
              <Check size={16} /> Analyze This Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getSupportedMimeType(): string {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
