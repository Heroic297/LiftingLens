import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/Header';
import { ModeSelector } from './components/ModeSelector';
import { CameraRecorder } from './components/CameraRecorder';
import { CalibrationWizard } from './components/CalibrationWizard';
import { VideoAnalyzer } from './components/VideoAnalyzer';
import { VelocityResults } from './components/VelocityResults';
import { ProgramImportWizard } from './components/ProgramImportWizard';
import { ProgramDayPicker } from './components/ProgramDayPicker';
import { TodaySession } from './components/TodaySession';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';

type QuickStep = 'record' | 'analyze' | 'results';
type ProgramStep = 'import_or_select' | 'day_session' | 'record' | 'analyze' | 'results';
type Overlay = 'history' | 'settings' | null;

export default function App() {
  const { mode, loadHistory, loadPrograms, loadSettings, settings, recordedBlob, setCalibration, resetAnalysis, selectedProgram } = useAppStore();
  const [quickStep, setQuickStep] = useState<QuickStep>('record');
  const [programStep, setProgramStep] = useState<ProgramStep>('import_or_select');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [showRecalibrate, setShowRecalibrate] = useState(false);

  useEffect(() => {
    loadHistory();
    loadPrograms();
    loadSettings();
  }, [loadHistory, loadPrograms, loadSettings]);

  useEffect(() => {
    setQuickStep('record');
    setProgramStep(selectedProgram ? 'day_session' : 'import_or_select');
    resetAnalysis();
    setShowRecalibrate(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toggleOverlay = (o: Overlay) => setOverlay((prev) => (prev === o ? null : o));

  const handleRecordingComplete = () => {
    if (mode === 'quick') setQuickStep('analyze');
    else setProgramStep('analyze');
  };

  const handleAnalysisComplete = () => {
    if (mode === 'quick') setQuickStep('results');
    else setProgramStep('results');
  };

  const handleSaved = () => {
    if (mode === 'quick') { setQuickStep('record'); resetAnalysis(); }
    else { setProgramStep('day_session'); resetAnalysis(); }
  };

  const handleRecalibrate = (cal: Parameters<typeof setCalibration>[0]) => {
    setCalibration(cal);
    setShowRecalibrate(false);
    // Re-run analysis with new calibration
    if (mode === 'quick') setQuickStep('analyze');
    else setProgramStep('analyze');
  };

  return (
    <div className="app">
      <Header onHistory={() => toggleOverlay('history')} onSettings={() => toggleOverlay('settings')} />

      {overlay && (
        <div className="overlay-panel">
          <button className="overlay-close" onClick={() => setOverlay(null)}>✕ Close</button>
          {overlay === 'history' && <HistoryPanel />}
          {overlay === 'settings' && <SettingsPanel />}
        </div>
      )}

      <main className="main-content">
        {mode === 'home' && <ModeSelector />}

        {mode === 'quick' && (
          <div className="flow-container">
            <StepIndicator steps={['Record', 'Analyze', 'Results']} current={['record', 'analyze', 'results'].indexOf(quickStep)} />

            {quickStep === 'record' && (
              <CameraRecorder onRecordingComplete={handleRecordingComplete} />
            )}

            {quickStep === 'analyze' && <VideoAnalyzer onComplete={handleAnalysisComplete} />}

            {quickStep === 'results' && !showRecalibrate && (
              <VelocityResults onSaved={handleSaved} onRecalibrate={() => setShowRecalibrate(true)} />
            )}

            {quickStep === 'results' && showRecalibrate && recordedBlob && (
              <CalibrationWizard
                videoBlob={recordedBlob}
                defaultPlateDiameter={settings.defaultPlateDiameter}
                onCalibrated={handleRecalibrate}
                onSkip={() => setShowRecalibrate(false)}
              />
            )}
          </div>
        )}

        {mode === 'program' && (
          <div className="flow-container">
            {programStep === 'import_or_select' && (
              <ProgramImportOrSelect onImported={() => setProgramStep('day_session')} />
            )}

            {programStep === 'day_session' && (
              <div>
                <ProgramDayPicker />
                <TodaySession onAnalyzeExercise={() => setProgramStep('record')} />
              </div>
            )}

            {programStep === 'record' && (
              <CameraRecorder onRecordingComplete={handleRecordingComplete} />
            )}

            {programStep === 'analyze' && <VideoAnalyzer onComplete={handleAnalysisComplete} />}

            {programStep === 'results' && !showRecalibrate && (
              <VelocityResults onSaved={handleSaved} onRecalibrate={() => setShowRecalibrate(true)} />
            )}

            {programStep === 'results' && showRecalibrate && recordedBlob && (
              <CalibrationWizard
                videoBlob={recordedBlob}
                defaultPlateDiameter={settings.defaultPlateDiameter}
                onCalibrated={handleRecalibrate}
                onSkip={() => setShowRecalibrate(false)}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="step-indicator">
      {steps.map((s, i) => (
        <div key={s} className={`step ${i === current ? 'active' : i < current ? 'done' : ''}`}>
          <div className="step-dot">{i < current ? '✓' : i + 1}</div>
          <div className="step-label">{s}</div>
        </div>
      ))}
    </div>
  );
}

function ProgramImportOrSelect({ onImported }: { onImported: () => void }) {
  const { programs, selectProgram } = useAppStore();
  const [showImport, setShowImport] = useState(programs.length === 0);

  if (showImport) {
    return (
      <div>
        {programs.length > 0 && (
          <button className="btn-secondary" onClick={() => setShowImport(false)} style={{ marginBottom: 12 }}>
            ← Back to programs
          </button>
        )}
        <ProgramImportWizard onImported={onImported} />
      </div>
    );
  }

  return (
    <div className="program-list">
      <div className="section-title">Your Programs</div>
      {programs.map((p) => (
        <button key={p.id} className="program-card" onClick={() => { selectProgram(p); onImported(); }}>
          <div className="program-card-name">{p.name}</div>
          <div className="program-card-meta">{p.weeks.length}w · {p.weeks.reduce((s, w) => s + w.days.length, 0)}d</div>
        </button>
      ))}
      <button className="btn-primary" onClick={() => setShowImport(true)}>+ Import New Program</button>
    </div>
  );
}
