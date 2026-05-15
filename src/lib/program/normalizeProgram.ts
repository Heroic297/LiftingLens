import type { Program, ProgramWeek, ProgramDay, ProgramExercise } from '../../types/training';
import { generateId } from '../utils';
import { mockAiParser } from './mockAiParser';

const WEEK_KEYS = ['week', 'wk', 'week_number', 'week number'];
const DAY_KEYS = ['day', 'session', 'day_number', 'day number', 'training_day'];
const EXERCISE_KEYS = ['exercise', 'lift', 'movement', 'name', 'exercise_name'];
const SETS_KEYS = ['sets', 'set', 'num_sets', 'number of sets'];
const REPS_KEYS = ['reps', 'rep', 'repetitions', 'target_reps'];
const LOAD_KEYS = ['load', 'weight', 'kg', 'lbs', 'lb', 'intensity'];
const PCT_KEYS = ['percent', '%', 'percentage', '1rm%', 'pct'];
const RPE_KEYS = ['rpe', 'rir', 'effort', 'target_rpe'];
const NOTES_KEYS = ['notes', 'note', 'comments', 'instructions', 'cues'];

function findKey(obj: Record<string, string>, keys: string[]): string | null {
  const lowerObj = Object.fromEntries(Object.keys(obj).map((k) => [k.toLowerCase().trim(), k]));
  for (const k of keys) {
    if (lowerObj[k]) return lowerObj[k];
  }
  return null;
}

function getVal(obj: Record<string, string>, keys: string[]): string {
  const key = findKey(obj, keys);
  return key ? (obj[key] ?? '').toString().trim() : '';
}

function hasStructuredColumns(rows: Record<string, string>[]): boolean {
  if (rows.length === 0) return false;
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
  const hasExercise = EXERCISE_KEYS.some((k) => keys.includes(k));
  const hasSets = SETS_KEYS.some((k) => keys.includes(k));
  const hasReps = REPS_KEYS.some((k) => keys.includes(k));
  return hasExercise && (hasSets || hasReps);
}

function columnBasedParse(rows: Record<string, string>[], sourceName: string): Program {
  const weekMap = new Map<string, Map<string, ProgramExercise[]>>();

  for (const row of rows) {
    const weekRaw = getVal(row, WEEK_KEYS);
    const dayRaw = getVal(row, DAY_KEYS);
    const week = weekRaw ? `Week ${weekRaw}` : 'Week 1';
    const day = dayRaw ? `Day ${dayRaw}` : 'Day 1';
    const exercise = getVal(row, EXERCISE_KEYS);
    if (!exercise) continue;

    const ex: ProgramExercise = {
      id: generateId(),
      exercise,
      sets: getVal(row, SETS_KEYS) || '3',
      reps: getVal(row, REPS_KEYS) || '5',
      load: getVal(row, LOAD_KEYS),
      percent: getVal(row, PCT_KEYS),
      rpe: getVal(row, RPE_KEYS),
      notes: getVal(row, NOTES_KEYS),
      confidence: 0.9,
    };

    if (!weekMap.has(week)) weekMap.set(week, new Map());
    const dayMap = weekMap.get(week)!;
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(ex);
  }

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

export function normalizeProgram(rows: Record<string, string>[], sourceName: string): Program {
  // Structured CSV/XLSX with explicit column headers → column parser wins
  if (hasStructuredColumns(rows)) {
    const result = columnBasedParse(rows, sourceName);
    if (result.weeks.length > 0) return result;
  }

  // Unstructured text → heuristic AI mock parser
  const aiResult = mockAiParser(rows, sourceName);
  if (aiResult) return aiResult;

  // Last resort: dump all rows as flat Day 1 exercises
  const exercises = rows
    .map((row) => {
      const vals = Object.values(row).join(' ').trim();
      if (!vals) return null;
      return {
        id: generateId(),
        exercise: Object.values(row)[0] || 'Exercise',
        sets: '3',
        reps: '5',
        load: '',
        percent: '',
        rpe: '',
        notes: Object.values(row).slice(1).join(' '),
        confidence: 0.3,
      } as ProgramExercise;
    })
    .filter(Boolean) as ProgramExercise[];

  return {
    id: generateId(),
    name: sourceName.replace(/\.[^.]+$/, ''),
    createdAt: Date.now(),
    weeks: [{ label: 'Week 1', days: [{ label: 'Day 1', exercises }] }],
  };
}
