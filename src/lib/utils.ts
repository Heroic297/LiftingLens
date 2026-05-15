export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatVelocity(v: number, isCalibrated: boolean): string {
  if (!isCalibrated) return `${v.toFixed(3)} rel`;
  return `${v.toFixed(3)} m/s`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function movingAverage(arr: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(arr.length, i + Math.ceil(window / 2));
    const slice = arr.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function liftLabel(lift: string): string {
  const map: Record<string, string> = {
    squat: 'Squat',
    bench: 'Bench Press',
    deadlift: 'Deadlift',
    overhead_press: 'Overhead Press',
    row: 'Row',
    other: 'Other',
  };
  return map[lift] ?? lift;
}
