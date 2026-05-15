import type { Program, ProgramWeek, ProgramDay, ProgramExercise } from '../../types/training';
import { generateId } from '../utils';

// TODO: Replace with real AI model (Gemma via Ollama, Claude API, or E2B sandbox)
// Interface contract: accepts raw rows/text → returns normalized Program or null (fall through to heuristic parser)

const EXERCISE_NAMES = [
  'squat', 'bench', 'deadlift', 'overhead press', 'ohp', 'rdl', 'row', 'pullup', 'pull-up',
  'press', 'curl', 'extension', 'hip thrust', 'lunge', 'leg press', 'hack squat',
];

const SPECIAL_NOTES = ['top single', 'amrap', 'paused', 'tempo', 'beltless', 'comp style', 'backoff'];

function looksLikeExercise(val: string): boolean {
  const lower = val.toLowerCase();
  return EXERCISE_NAMES.some((n) => lower.includes(n));
}

function extractRPE(text: string): string {
  const m = text.match(/@\s*(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)|RPE\s*(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)/i);
  return m ? (m[1] || m[2]) : '';
}

function extractNotes(text: string): string {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const note of SPECIAL_NOTES) {
    if (lower.includes(note)) found.push(note);
  }
  return found.join(', ');
}

export function mockAiParser(rows: Record<string, string>[], sourceName: string): Program | null {
  // Only apply if we can detect exercise-like content
  const allText = rows.map((r) => Object.values(r).join(' ')).join('\n');
  if (!EXERCISE_NAMES.some((n) => allText.toLowerCase().includes(n))) return null;

  const weekMap = new Map<string, Map<string, ProgramExercise[]>>();
  let currentWeek = 'Week 1';
  let currentDay = 'Day 1';

  for (const row of rows) {
    const vals = Object.values(row).map((v) => v.toString().trim());
    const joined = vals.join(' ');

    // Detect week header
    const weekMatch = joined.match(/\bweek\s*(\d+)\b/i);
    if (weekMatch) {
      currentWeek = `Week ${weekMatch[1]}`;
      const dayMatch = joined.match(/\bday\s*(\d+)\b/i);
      if (dayMatch) currentDay = `Day ${dayMatch[1]}`;
    }

    // Detect day header
    const dayMatch = joined.match(/\b(?:day|session)\s*(\d+)\b/i);
    if (dayMatch && !weekMatch) {
      currentDay = `Day ${dayMatch[1]}`;
    }

    // Try to find exercise
    const exerciseVal = vals.find(looksLikeExercise) ?? '';
    if (!exerciseVal) continue;

    // Extract sets x reps patterns like "3x5", "4 x 3", "5 sets of 3"
    const setsRepsMatch = joined.match(/(\d+)\s*[xX×]\s*(\d+)/);
    const sets = setsRepsMatch ? setsRepsMatch[1] : (vals.find((v) => /^\d+$/.test(v) && parseInt(v) < 10) ?? '3');
    const reps = setsRepsMatch ? setsRepsMatch[2] : '5';

    // Extract load
    const loadMatch = joined.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs?|lb)/i);
    const pctMatch = joined.match(/(\d+(?:\.\d+)?)\s*%/);

    const rpe = extractRPE(joined);
    const notes = extractNotes(joined);

    const ex: ProgramExercise = {
      id: generateId(),
      exercise: exerciseVal,
      sets,
      reps,
      load: loadMatch ? loadMatch[0] : '',
      percent: pctMatch ? pctMatch[0] : '',
      rpe,
      notes,
      confidence: 0.7,
    };

    if (!weekMap.has(currentWeek)) weekMap.set(currentWeek, new Map());
    const dayMap = weekMap.get(currentWeek)!;
    if (!dayMap.has(currentDay)) dayMap.set(currentDay, []);
    dayMap.get(currentDay)!.push(ex);
  }

  if (weekMap.size === 0) return null;

  const weeks: ProgramWeek[] = [];
  for (const [weekLabel, dayMap] of weekMap) {
    const days: ProgramDay[] = [];
    for (const [dayLabel, exercises] of dayMap) {
      days.push({ label: dayLabel, exercises });
    }
    weeks.push({ label: weekLabel, days });
  }

  return {
    id: generateId(),
    name: sourceName.replace(/\.[^.]+$/, ''),
    createdAt: Date.now(),
    weeks,
  };
}
