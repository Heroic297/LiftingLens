import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeProgram } from './normalizeProgram';
import type { Program } from '../../types/training';

export async function importFromFile(file: File): Promise<Program> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv' || ext === 'tsv') {
    return importCSV(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    return importXLSX(file);
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }
}

async function importCSV(file: File): Promise<Program> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const program = normalizeProgram(results.data as Record<string, string>[], file.name);
          resolve(program);
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}

async function importXLSX(file: File): Promise<Program> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allRows: Record<string, string>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    rows.forEach((r) => allRows.push({ ...r, _sheet: sheetName }));
  }

  return normalizeProgram(allRows, file.name);
}

export function importFromText(text: string, name = 'Pasted Program'): Program {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return normalizeProgram(result.data, name);
}
