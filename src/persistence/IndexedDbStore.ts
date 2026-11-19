import { SaveGameV1, SettingsState } from '../shared/types/world';
import { migrateSaveData } from './SaveMigrations';

const DB_NAME = 'living-atlas-db';
const DB_VERSION = 1;
const STORE_SAVES = 'saves';
const STORE_SETTINGS = 'settings';
const STORE_META = 'meta';

export const DEFAULT_SETTINGS: SettingsState = {
  quality: 'medium',
  autoQuality: true,
  masterVolume: 0.45,
  muted: false,
  mouseSensitivity: 1.0,
  showControlHints: true,
};

export interface SaveSlotSummary {
  slotId: string;
  label: string;
  savedAtIso: string;
  regionId: string;
  dayCount: number;
}

class IndexedDbStoreImpl {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private persistenceRequested = false;

  private hasIndexedDb(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.hasIndexedDb()) {
      return Promise.reject(new Error('IndexedDB unavailable'));
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SAVES)) {
          db.createObjectStore(STORE_SAVES, { keyPath: 'slotId' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });

    return this.dbPromise;
  }

  async ensurePersistentStorage(): Promise<boolean> {
    if (this.persistenceRequested) return true;
    this.persistenceRequested = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        return await navigator.storage.persist();
      }
    } catch {
      // Ignore in restricted environments
    }
    return false;
  }

  async estimateStorage(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
      }
    } catch {
      // Ignore
    }
    return null;
  }

  async saveSlot(save: SaveGameV1): Promise<{ ok: boolean; error?: string }> {
    await this.ensurePersistentStorage();
    if (!this.hasIndexedDb()) {
      try {
        localStorage.setItem(`living-atlas:save:${save.slotId}`, JSON.stringify(save));
        localStorage.setItem('living-atlas:lastSlot', save.slotId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Storage write failed' };
      }
    }

    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_SAVES, STORE_META], 'readwrite');
        tx.objectStore(STORE_SAVES).put(save);
        tx.objectStore(STORE_META).put(save.slotId, 'lastSlotId');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        return { ok: false, error: 'Browser storage quota exceeded. Export a backup and clear space.' };
      }
      return { ok: false, error: err instanceof Error ? err.message : 'IndexedDB save failed' };
    }
  }

  async loadSlot(slotId: string): Promise<SaveGameV1 | null> {
    if (!this.hasIndexedDb()) {
      const raw = localStorage.getItem(`living-atlas:save:${slotId}`);
      if (!raw) return null;
      const parsed = migrateSaveData(JSON.parse(raw));
      return parsed.ok ? parsed.data : null;
    }

    try {
      const db = await this.openDb();
      const raw = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE_SAVES, 'readonly');
        const req = tx.objectStore(STORE_SAVES).get(slotId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
      if (!raw) return null;
      const migrated = migrateSaveData(raw);
      if (!migrated.ok) return null;
      if (migrated.migratedFrom !== undefined) {
        await this.saveSlot(migrated.data);
      }
      return migrated.data;
    } catch {
      return null;
    }
  }

  async loadLatestSave(): Promise<SaveGameV1 | null> {
    if (!this.hasIndexedDb()) {
      const last = localStorage.getItem('living-atlas:lastSlot') ?? 'autosave';
      return this.loadSlot(last);
    }
    try {
      const db = await this.openDb();
      const lastSlotId = await new Promise<string | null>((resolve) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get('lastSlotId');
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => resolve(null);
      });
      if (lastSlotId) {
        const loaded = await this.loadSlot(lastSlotId);
        if (loaded) return loaded;
      }
      const list = await this.listSlots();
      if (list.length > 0) {
        return this.loadSlot(list[0].slotId);
      }
      return null;
    } catch {
      return null;
    }
  }

  async listSlots(): Promise<SaveSlotSummary[]> {
    if (!this.hasIndexedDb()) {
      const slots: SaveSlotSummary[] = [];
      for (const id of ['autosave', 'manual-1', 'manual-2', 'manual-3']) {
        const s = await this.loadSlot(id);
        if (s) {
          slots.push({
            slotId: s.slotId,
            label: s.label,
            savedAtIso: s.savedAtIso,
            regionId: s.currentRegionId,
            dayCount: s.dayCount,
          });
        }
      }
      return slots.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
    }

    try {
      const db = await this.openDb();
      const all = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SAVES, 'readonly');
        const req = tx.objectStore(STORE_SAVES).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error);
      });
      const summaries: SaveSlotSummary[] = [];
      for (const item of all) {
        const res = migrateSaveData(item);
        if (res.ok) {
          summaries.push({
            slotId: res.data.slotId,
            label: res.data.label,
            savedAtIso: res.data.savedAtIso,
            regionId: res.data.currentRegionId,
            dayCount: res.data.dayCount,
          });
        }
      }
      return summaries.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
    } catch {
      return [];
    }
  }

  async saveSettings(settings: SettingsState): Promise<void> {
    if (!this.hasIndexedDb()) {
      localStorage.setItem('living-atlas:settings', JSON.stringify(settings));
      return;
    }
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        tx.objectStore(STORE_SETTINGS).put(settings, 'user');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore non-fatal settings write failure
    }
  }

  async loadSettings(): Promise<SettingsState> {
    if (!this.hasIndexedDb()) {
      try {
        const raw = localStorage.getItem('living-atlas:settings');
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch {
        // fallback
      }
      return { ...DEFAULT_SETTINGS };
    }
    try {
      const db = await this.openDb();
      const raw = await new Promise<Partial<SettingsState> | null>((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const req = tx.objectStore(STORE_SETTINGS).get('user');
        req.onsuccess = () => resolve((req.result as Partial<SettingsState>) ?? null);
        req.onerror = () => resolve(null);
      });
      return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

export const IndexedDbStore = new IndexedDbStoreImpl();
