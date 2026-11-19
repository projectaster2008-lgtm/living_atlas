import { SaveGameV1 } from '../shared/types/world';
import { migrateSaveData } from './SaveMigrations';

export function exportSaveToJson(save: SaveGameV1): string {
  return JSON.stringify(save, null, 2);
}

export function importSaveFromJson(
  jsonText: string,
): { ok: true; data: SaveGameV1 } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'Selected file is not valid JSON.' };
  }

  const migrated = migrateSaveData(parsed);
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }
  return { ok: true, data: migrated.data };
}
