import { Trash2, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatDate, formatVelocity, liftLabel } from '../lib/utils';
import { deleteSet } from '../lib/db';

export function HistoryPanel() {
  const { history, loadHistory } = useAppStore();

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this set from history?')) return;
    await deleteSet(id);
    await loadHistory();
  };

  if (history.length === 0) {
    return (
      <div className="history-panel empty">
        <p>No sets recorded yet. Complete your first set to see history here.</p>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="section-title">Set History</div>
      {history.map((set) => (
        <div key={set.id} className="history-card">
          <div className="history-card-header">
            <span className="history-lift">{liftLabel(set.liftType)}</span>
            <span className="history-date">{formatDate(set.timestamp)}</span>
            <button className="icon-btn small" onClick={() => handleDelete(set.id)} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="history-stats">
            <span>{set.repCount} reps</span>
            <span>avg {formatVelocity(set.setAvgVelocity, set.isCalibrated)}</span>
            <span>VL {set.velocityLoss.toFixed(1)}%</span>
            {!set.isCalibrated && <span className="rel-badge">relative</span>}
          </div>
          {set.warnings.length > 0 && (
            <div className="history-warn"><AlertTriangle size={12} /> {set.warnings[0]}</div>
          )}
        </div>
      ))}
    </div>
  );
}
