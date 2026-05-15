import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { SetResult, Program, AppSettings } from '../types/training';
import { DEFAULT_SETTINGS } from '../types/training';

interface LiftingLensDB extends DBSchema {
  sets: {
    key: string;
    value: SetResult;
    indexes: { 'by-timestamp': number };
  };
  programs: {
    key: string;
    value: Program;
    indexes: { 'by-createdAt': number };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

let dbPromise: Promise<IDBPDatabase<LiftingLensDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<LiftingLensDB>('liftinglens', 1, {
      upgrade(db) {
        const setStore = db.createObjectStore('sets', { keyPath: 'id' });
        setStore.createIndex('by-timestamp', 'timestamp');

        const programStore = db.createObjectStore('programs', { keyPath: 'id' });
        programStore.createIndex('by-createdAt', 'createdAt');

        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function saveSet(set: SetResult): Promise<void> {
  const db = await getDB();
  await db.put('sets', set);
}

export async function getSets(): Promise<SetResult[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('sets', 'by-timestamp');
  return all.reverse();
}

export async function deleteSet(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sets', id);
}

export async function saveProgram(program: Program): Promise<void> {
  const db = await getDB();
  await db.put('programs', program);
}

export async function getPrograms(): Promise<Program[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('programs', 'by-createdAt');
  return all.reverse();
}

export async function deleteProgram(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('programs', id);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const stored = await db.get('settings', 'appSettings');
  if (stored) return stored.value as AppSettings;
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: 'appSettings', value: settings });
}
