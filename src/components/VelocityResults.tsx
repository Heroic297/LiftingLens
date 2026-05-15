import { Save, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatVelocity, formatDate, liftLabel } from '../lib/utils';
import { VelocityChart } from './VelocityChart';
import { generateRecommendation } from '../lib/coaching/recommendationEngine';
import { useState } from 'react';

interface VelocityResultsProps {
  onSaved?: () => void;
}

export function VelocityResults({ onSaved }: VelocityResultsProps) {
  const { currentSetResult, saveCurrentSet, settings, selectedExerciseId, selectedProgram, selectedWeekIdx, selectedDayIdx } = useAppStore();
  const [saved, setSaved] = useState(false);
  const [userRPE, setUserRPE] = useState<number | ''>('');

  if (!currentSetResult) return null;
  const r = currentSetResult;

  const exercise = selectedExerciseId && selectedProgram
    ? selectedProgram.weeks[selectedWeekIdx]?.days[selectedDayIdx]?.exercises.find((e) => e.id === selectedExerciseId)
    : null;

  const targetRPE = exercise?.rpe ? parseFloat(exercise.rpe) : undefined;
  const plannedLoad = exercise?.load ? parseFloat(exercise.load) : undefined;

  const recommendation = generateRecommendation({
    set: r,
    targetRPE: isNaN(targetRPE!) ? undefined : targetRPE,
    plannedLoad: isNaN(plannedLoad!) ? undefined : plannedLoad,
    userPerceivedRPE: typeof userRPE === 'number' ? userRPE : undefined,
    defaultIncrement: settings.defaultIncrement,
    units: settings.units,
  });

  const handleSave = async () => {
    await saveCurrentSet();
    setSaved(true);
    onSaved?.();
  };

  const velUnit = r.isCalibrated ? 'm/s' : 'rel';
  const actionColors = { add: '#22d3ee', hold: '#f59e0b', reduce: '#f87171', info: '#94a3b8' };

  return (
    <div className="results-panel">
      <div className="results-header">
        <h2>{liftLabel(r.liftType)}</h2>
        <span className="results-date">{formatDate(r.timestamp)}</span>
      </div>

      {!r.isCalibrated && (
        <div className="warn-badge">
          <AlertTriangle size={14} /> Relative velocity — calibrate for m/s estimates
        </div>
      )}

      <div className="disclaimer-box">
        ⚠ Approximate video-based estimate. Accuracy depends on camera angle, frame rate, lighting, and calibration.
      </div>

      <div className="stats-grid">
        <StatCard label="Reps" value={String(r.repCount)} />
        <StatCard label={`Avg Velocity (${velUnit})`} value={r.setAvgVelocity.toFixed(3)} />
        <StatCard label={`Fastest Rep (${velUnit})`} value={formatVelocity(r.fastestRep, r.isCalibrated)} />
        <StatCard label={`Slowest Rep (${velUnit})`} value={formatVelocity(r.slowestRep, r.isCalibrated)} />
        <StatCard label="Velocity Loss" value={`${r.velocityLoss.toFixed(1)}%`} highlight={r.velocityLoss > 20 ? 'warn' : 'ok'} />
        <StatCard label="Confidence" value={`${(r.confidence * 100).toFixed(0)}%`} highlight={r.confidence < 0.4 ? 'warn' : 'ok'} />
      </div>

      {r.reps.length > 0 && (
        <>
          <div className="section-title">Rep Velocities</div>
          <VelocityChart reps={r.reps} isCalibrated={r.isCalibrated} />

          <div className="rep-table">
            <div className="rep-table-header">
              <span>Rep</span><span>Mean ({velUnit})</span><span>Peak ({velUnit})</span><span>ROM</span>
            </div>
            {r.reps.map((rep) => (
              <div key={rep.repNumber} className="rep-table-row">
                <span>#{rep.repNumber}</span>
                <span>{rep.meanConcentricVelocity.toFixed(3)}</span>
                <span>{rep.peakConcentricVelocity.toFixed(3)}</span>
                <span>{rep.rom != null ? `${(rep.rom * 100).toFixed(1)}cm` : '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {r.warnings.length > 0 && (
        <div className="warnings-list">
          {r.warnings.map((w, i) => (
            <div key={i} className="warning-item"><AlertTriangle size={14} /> {w}</div>
          ))}
        </div>
      )}

      <div className="section-title">Coaching</div>
      <div className="rpe-input-row">
        <label>Your perceived RPE (optional):</label>
        <input
          type="number"
          min={1}
          max={10}
          step={0.5}
          value={userRPE}
          onChange={(e) => setUserRPE(e.target.value ? parseFloat(e.target.value) : '')}
          className="input-sm"
          placeholder="6–10"
        />
      </div>

      <div className="recommendation-card" style={{ borderColor: actionColors[recommendation.action] }}>
        <div className="rec-action" style={{ color: actionColors[recommendation.action] }}>
          {recommendation.action === 'add' && <TrendingUp size={18} />}
          {recommendation.action === 'reduce' && <TrendingDown size={18} />}
          {(recommendation.action === 'hold' || recommendation.action === 'info') && <Minus size={18} />}
          {recommendation.action.toUpperCase()} {recommendation.amountSuggestion}
        </div>
        <p className="rec-message">{recommendation.message}</p>
        <details className="rec-reasoning">
          <summary>Why?</summary>
          <ul>{recommendation.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </details>
      </div>

      <button className="btn-primary full-width" onClick={handleSave} disabled={saved}>
        <Save size={16} /> {saved ? 'Saved!' : 'Save Set'}
      </button>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: 'ok' | 'warn' }) {
  return (
    <div className={`stat-card ${highlight === 'warn' ? 'stat-warn' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
