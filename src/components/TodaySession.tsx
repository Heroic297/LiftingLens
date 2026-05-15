import { Play, CheckCircle, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { LiftType } from '../types/training';

const LIFT_MAP: Record<string, LiftType> = {
  squat: 'squat', bench: 'bench', deadlift: 'deadlift',
  'overhead press': 'overhead_press', ohp: 'overhead_press',
  row: 'row', press: 'overhead_press',
};

function guessLift(name: string): LiftType {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(LIFT_MAP)) {
    if (lower.includes(k)) return v;
  }
  return 'other';
}

interface TodaySessionProps {
  onAnalyzeExercise: () => void;
}

export function TodaySession({ onAnalyzeExercise }: TodaySessionProps) {
  const { selectedProgram, selectedWeekIdx, selectedDayIdx, setExerciseId, setLift, history } = useAppStore();

  if (!selectedProgram) return null;

  const day = selectedProgram.weeks[selectedWeekIdx]?.days[selectedDayIdx];
  if (!day) return null;

  const handleAnalyze = (exerciseId: string, exerciseName: string) => {
    setExerciseId(exerciseId);
    setLift(guessLift(exerciseName));
    onAnalyzeExercise();
  };

  return (
    <div className="today-session">
      <div className="section-title">Today's Session — {day.label}</div>
      <div className="exercise-list">
        {day.exercises.map((ex) => {
          const completed = history.some((s) => s.programExerciseId === ex.id);
          return (
            <div key={ex.id} className={`exercise-card ${completed ? 'completed' : ''}`}>
              <div className="exercise-card-main">
                <div className="exercise-name">
                  {completed && <CheckCircle size={14} className="done-icon" />}
                  {ex.exercise}
                </div>
                <div className="exercise-meta">
                  <span>{ex.sets}×{ex.reps}</span>
                  {ex.load && <span>{ex.load}</span>}
                  {ex.percent && <span>{ex.percent}</span>}
                  {ex.rpe && <span>@RPE {ex.rpe}</span>}
                </div>
                {ex.notes && <div className="exercise-notes">{ex.notes}</div>}
              </div>
              <button
                className="btn-icon-analyze"
                onClick={() => handleAnalyze(ex.id, ex.exercise)}
                title="Analyze a set for this exercise"
              >
                <Play size={16} />
                <ChevronRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
