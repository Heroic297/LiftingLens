import { Zap, BookOpen } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function ModeSelector() {
  const setMode = useAppStore((s) => s.setMode);

  return (
    <div className="mode-selector">
      <div className="hero-title">
        <h1>Lifting Lens</h1>
        <p className="hero-sub">Video-based bar velocity for powerlifters</p>
        <p className="disclaimer">⚠ Approximate estimates — accuracy depends on camera angle, frame rate, and calibration.</p>
      </div>

      <div className="mode-cards">
        <button className="mode-card" onClick={() => setMode('quick')}>
          <div className="mode-icon quick-icon">
            <Zap size={32} />
          </div>
          <div className="mode-info">
            <h2>Quick Analyze</h2>
            <p>Record a set and get velocity estimates instantly — no program needed.</p>
          </div>
        </button>

        <button className="mode-card" onClick={() => setMode('program')}>
          <div className="mode-icon program-icon">
            <BookOpen size={32} />
          </div>
          <div className="mode-info">
            <h2>Program Mode</h2>
            <p>Import your training program, track sets against targets, and get load recommendations.</p>
          </div>
        </button>
      </div>
    </div>
  );
}
