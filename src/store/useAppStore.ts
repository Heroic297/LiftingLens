import { create } from 'zustand';
import type {
  AppMode, LiftType, SetResult, Program, AppSettings, CalibrationData,
} from '../types/training';
import { DEFAULT_SETTINGS } from '../types/training';
import { saveSet, getSets, saveProgram, getPrograms, getSettings, saveSettings } from '../lib/db';

interface AppState {
  mode: AppMode;
  selectedLift: LiftType;
  recordedBlob: Blob | null;
  calibration: CalibrationData | null;
  currentSetResult: SetResult | null;
  history: SetResult[];
  programs: Program[];
  selectedProgram: Program | null;
  selectedWeekIdx: number;
  selectedDayIdx: number;
  selectedExerciseId: string | null;
  settings: AppSettings;
  isAnalyzing: boolean;
  analysisProgress: number;

  setMode: (mode: AppMode) => void;
  setLift: (lift: LiftType) => void;
  setRecordedBlob: (blob: Blob | null) => void;
  setCalibration: (cal: CalibrationData | null) => void;
  setCurrentSetResult: (result: SetResult | null) => void;
  saveCurrentSet: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadPrograms: () => Promise<void>;
  addProgram: (p: Program) => Promise<void>;
  selectProgram: (p: Program | null) => void;
  setWeekIdx: (idx: number) => void;
  setDayIdx: (idx: number) => void;
  setExerciseId: (id: string | null) => void;
  loadSettings: () => Promise<void>;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  setAnalyzing: (v: boolean) => void;
  setAnalysisProgress: (v: number) => void;
  resetAnalysis: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'home',
  selectedLift: 'squat',
  recordedBlob: null,
  calibration: null,
  currentSetResult: null,
  history: [],
  programs: [],
  selectedProgram: null,
  selectedWeekIdx: 0,
  selectedDayIdx: 0,
  selectedExerciseId: null,
  settings: DEFAULT_SETTINGS,
  isAnalyzing: false,
  analysisProgress: 0,

  setMode: (mode) => set({ mode }),
  setLift: (selectedLift) => set({ selectedLift }),
  setRecordedBlob: (recordedBlob) => set({ recordedBlob }),
  setCalibration: (calibration) => set({ calibration }),
  setCurrentSetResult: (currentSetResult) => set({ currentSetResult }),

  saveCurrentSet: async () => {
    const { currentSetResult } = get();
    if (!currentSetResult) return;
    await saveSet(currentSetResult);
    set((state) => ({ history: [currentSetResult, ...state.history] }));
  },

  loadHistory: async () => {
    const history = await getSets();
    set({ history });
  },

  loadPrograms: async () => {
    const programs = await getPrograms();
    set({ programs });
  },

  addProgram: async (program) => {
    await saveProgram(program);
    set((state) => ({ programs: [program, ...state.programs] }));
  },

  selectProgram: (selectedProgram) => set({ selectedProgram, selectedWeekIdx: 0, selectedDayIdx: 0, selectedExerciseId: null }),
  setWeekIdx: (selectedWeekIdx) => set({ selectedWeekIdx }),
  setDayIdx: (selectedDayIdx) => set({ selectedDayIdx }),
  setExerciseId: (selectedExerciseId) => set({ selectedExerciseId }),

  loadSettings: async () => {
    const settings = await getSettings();
    set({ settings });
  },

  updateSettings: async (partial) => {
    const settings = { ...get().settings, ...partial };
    await saveSettings(settings);
    set({ settings });
  },

  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setAnalysisProgress: (analysisProgress) => set({ analysisProgress }),
  resetAnalysis: () => set({ recordedBlob: null, calibration: null, currentSetResult: null, isAnalyzing: false, analysisProgress: 0 }),
}));
