export type LiftType = 'squat' | 'bench' | 'deadlift' | 'overhead_press' | 'row' | 'other';

export type AppMode = 'home' | 'quick' | 'program';

export interface CalibrationData {
  metersPerPixel: number;
  method: 'plate_diameter' | 'custom';
  knownDistanceMeters: number;
  pixelDistance: number;
}

export interface TrackedPoint {
  x: number;
  y: number;
  time: number;
  confidence: number;
}

export interface RepResult {
  repNumber: number;
  meanConcentricVelocity: number;
  peakConcentricVelocity: number;
  rom: number | null;
  duration: number;
  startTime: number;
  endTime: number;
}

export interface SetResult {
  id: string;
  timestamp: number;
  liftType: LiftType;
  repCount: number;
  reps: RepResult[];
  setAvgVelocity: number;
  fastestRep: number;
  slowestRep: number;
  velocityLoss: number;
  isCalibrated: boolean;
  calibration: CalibrationData | null;
  confidence: number;
  warnings: string[];
  notes: string;
  programExerciseId?: string;
  load?: number;
  loadUnit?: 'lb' | 'kg';
  rpe?: number;
  recommendation?: Recommendation;
}

export interface Recommendation {
  action: 'add' | 'hold' | 'reduce' | 'info';
  amountSuggestion: string;
  message: string;
  reasoning: string[];
}

// Program types
export interface ProgramExercise {
  id: string;
  exercise: string;
  sets: number | string;
  reps: number | string;
  load: string;
  percent: string;
  rpe: string;
  notes: string;
  confidence: number;
  completedSetIds?: string[];
}

export interface ProgramDay {
  label: string;
  exercises: ProgramExercise[];
}

export interface ProgramWeek {
  label: string;
  days: ProgramDay[];
}

export interface Program {
  id: string;
  name: string;
  createdAt: number;
  weeks: ProgramWeek[];
}

export interface AppSettings {
  defaultPlateDiameter: number;
  sampleRate: number;
  markerSearchRadius: number;
  units: 'lb' | 'kg';
  defaultIncrement: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultPlateDiameter: 0.45,
  sampleRate: 15,
  markerSearchRadius: 60,
  units: 'lb',
  defaultIncrement: 2.5,
};
