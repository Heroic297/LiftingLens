import { useState, useRef } from 'react';
import { Upload, FileText, Check, AlertTriangle } from 'lucide-react';
import { importFromFile, importFromText } from '../lib/program/importProgram';
import { useAppStore } from '../store/useAppStore';
import type { Program } from '../types/training';

interface ProgramImportWizardProps {
  onImported: () => void;
}

export function ProgramImportWizard({ onImported }: ProgramImportWizardProps) {
  const { addProgram, selectProgram } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<Program | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'file' | 'paste'>('file');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const program = await importFromFile(file);
      setPreview(program);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    setError(null);
    try {
      const program = importFromText(pasteText, 'Pasted Program');
      setPreview(program);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    await addProgram(preview);
    selectProgram(preview);
    onImported();
  };

  if (preview) {
    return (
      <div className="import-preview">
        <div className="section-title"><Check size={18} /> Program Preview</div>
        <div className="program-summary">
          <strong>{preview.name}</strong>
          <span>{preview.weeks.length} week(s)</span>
          <span>{preview.weeks.reduce((s, w) => s + w.days.length, 0)} day(s)</span>
          <span>{preview.weeks.reduce((s, w) => s + w.days.reduce((ss, d) => ss + d.exercises.length, 0), 0)} exercise(s)</span>
        </div>

        {preview.weeks.slice(0, 2).map((week) => (
          <div key={week.label} className="preview-week">
            <div className="preview-week-label">{week.label}</div>
            {week.days.slice(0, 2).map((day) => (
              <div key={day.label} className="preview-day">
                <div className="preview-day-label">{day.label}</div>
                {day.exercises.slice(0, 4).map((ex) => (
                  <div key={ex.id} className="preview-exercise">
                    <span className="ex-name">{ex.exercise}</span>
                    <span className="ex-detail">{ex.sets}×{ex.reps}</span>
                    {ex.load && <span className="ex-detail">{ex.load}</span>}
                    {ex.rpe && <span className="ex-detail">@{ex.rpe}</span>}
                    {ex.notes && <span className="ex-note">{ex.notes}</span>}
                  </div>
                ))}
                {day.exercises.length > 4 && <div className="preview-more">+{day.exercises.length - 4} more…</div>}
              </div>
            ))}
            {week.days.length > 2 && <div className="preview-more">+{week.days.length - 2} more days…</div>}
          </div>
        ))}

        <div className="import-actions">
          <button className="btn-secondary" onClick={() => setPreview(null)}>Back</button>
          <button className="btn-primary" onClick={handleConfirm}><Check size={16} /> Save & Use Program</button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-wizard">
      <div className="section-title"><Upload size={18} /> Import Training Program</div>
      <p className="hint">Import CSV, XLSX, or paste tab-separated data. Supports week/day/exercise/sets/reps/load/RPE columns.</p>

      <div className="tab-row">
        <button className={`tab ${tab === 'file' ? 'active' : ''}`} onClick={() => setTab('file')}>Upload File</button>
        <button className={`tab ${tab === 'paste' ? 'active' : ''}`} onClick={() => setTab('paste')}>Paste Text</button>
      </div>

      {tab === 'file' && (
        <div className="file-drop" onClick={() => fileRef.current?.click()}>
          <Upload size={32} />
          <p>Tap to upload CSV or XLSX</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv" onChange={handleFile} className="hidden" />
        </div>
      )}

      {tab === 'paste' && (
        <div className="paste-area">
          <textarea
            className="paste-input"
            placeholder={'Paste CSV or tab-separated data here.\nExample:\nWeek,Day,Exercise,Sets,Reps,Load,RPE\n1,1,Squat,3,5,185lb,7'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
          />
          <button className="btn-primary" onClick={handlePaste}><FileText size={16} /> Parse</button>
        </div>
      )}

      {loading && <div className="hint">Parsing…</div>}
      {error && <div className="error-box"><AlertTriangle size={16} /> {error}</div>}
    </div>
  );
}
