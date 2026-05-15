import { useAppStore } from '../store/useAppStore';
import { ChevronDown } from 'lucide-react';

export function ProgramDayPicker() {
  const { selectedProgram, selectedWeekIdx, selectedDayIdx, setWeekIdx, setDayIdx } = useAppStore();

  if (!selectedProgram) return null;

  const weeks = selectedProgram.weeks;
  const currentWeek = weeks[selectedWeekIdx];
  const days = currentWeek?.days ?? [];

  return (
    <div className="day-picker">
      <div className="picker-row">
        <div className="picker-group">
          <label>Week</label>
          <div className="select-wrap">
            <select
              value={selectedWeekIdx}
              onChange={(e) => { setWeekIdx(Number(e.target.value)); setDayIdx(0); }}
              className="select"
            >
              {weeks.map((w, i) => (
                <option key={i} value={i}>{w.label}</option>
              ))}
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>

        <div className="picker-group">
          <label>Day</label>
          <div className="select-wrap">
            <select
              value={selectedDayIdx}
              onChange={(e) => setDayIdx(Number(e.target.value))}
              className="select"
            >
              {days.map((d, i) => (
                <option key={i} value={i}>{d.label}</option>
              ))}
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>
      </div>
    </div>
  );
}
