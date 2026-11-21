import React, { useEffect, useRef, useState } from 'react';
import { Download, Play, RotateCcw, Save, Sliders, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { GameRuntime } from './GameRuntime';
import { exportSaveToJson } from '../persistence/ExportImport';
import { IndexedDbStore, SaveSlotSummary } from '../persistence/IndexedDbStore';
import { DiagnosticsSnapshot, QualityTier, SaveGameV1 } from '../shared/types/world';
import { getRegionManifest } from '../worlds/WorldCatalog';

interface PauseSettingsModalProps {
  runtime: GameRuntime;
  diagnostics: DiagnosticsSnapshot;
  onResume: () => void;
  onReturnToTitle: () => void;
  onImportSaveJson: (jsonText: string) => Promise<{ ok: boolean; error?: string }>;
}

const SLOTS = [
  { id: 'manual-1', label: 'Journal Slot 1' },
  { id: 'manual-2', label: 'Journal Slot 2' },
  { id: 'manual-3', label: 'Journal Slot 3' },
  { id: 'autosave', label: 'Autosave' },
];

export const PauseSettingsModal: React.FC<PauseSettingsModalProps> = ({
  runtime,
  diagnostics,
  onResume,
  onReturnToTitle,
  onImportSaveJson,
}) => {
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityTier>(runtime.settings.quality);
  const [volume, setVolume] = useState<number>(runtime.settings.masterVolume);
  const [muted, setMuted] = useState<boolean>(runtime.settings.muted);
  const [showDiag, setShowDiag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshSlots = async () => {
    const list = await IndexedDbStore.listSlots();
    setSlots(list);
  };

  useEffect(() => {
    void refreshSlots();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onResume();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onResume]);

  const handleSaveSlot = async (slotId: string, label: string) => {
    const res = await runtime.saveToSlot(slotId, label);
    setStatusMessage(res.ok ? `Saved to ${label}.` : res.error ?? 'Save failed.');
    await refreshSlots();
  };

  const handleLoadSlot = async (slotId: string) => {
    const loaded: SaveGameV1 | null = await IndexedDbStore.loadSlot(slotId);
    if (!loaded) {
      setStatusMessage('No save stored in this slot.');
      return;
    }
    runtime.resumeFromSave(loaded);
  };

  const handleExport = () => {
    const payload = runtime.buildSavePayload('export', 'Living Atlas Export');
    const json = exportSaveToJson(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `living-atlas-${payload.currentRegionId}-day${payload.dayCount}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported JSON save backup.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await onImportSaveJson(text);
      if (!res.ok) {
        setStatusMessage(res.error ?? 'Import failed.');
      }
    } catch {
      setStatusMessage('Could not read file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      data-testid="pause-settings-modal"
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 bg-[var(--atlas-scrim)]"
    >
      <div className="atlas-modal w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[var(--atlas-radius-lg)] overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b atlas-divider bg-[#0a1019]">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-[#d9a14a]" aria-hidden="true" />
            <h2 className="font-atlas-display text-lg font-semibold text-[#f3ede0]">
              Atlas Paused &amp; Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onResume}
            className="atlas-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--atlas-radius-md)] text-xs font-semibold cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>Resume [Esc]</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto atlas-scroll p-5 md:p-6 flex flex-col gap-6 text-sm">
          {statusMessage && (
            <div
              role="status"
              className="px-3.5 py-2 rounded-[var(--atlas-radius-md)] border-l-2 border-[#58b4aa] bg-[#131e2d] text-xs text-[#f3ede0] flex items-center justify-between"
            >
              <span>{statusMessage}</span>
              <button type="button" onClick={() => setStatusMessage(null)} className="cursor-pointer text-[#8fa0b3] hover:text-[#f3ede0]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Save Slots & Backup Ledger */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b atlas-divider">
              <h3 className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#d9a14a] font-semibold">
                Local Save Archive
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="btn-export-save"
                  onClick={handleExport}
                  className="atlas-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--atlas-radius-md)] text-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#d9a14a]" aria-hidden="true" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="atlas-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--atlas-radius-md)] text-xs cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#58b4aa]" aria-hidden="true" />
                  <span>Import JSON</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0">
              {SLOTS.map((slot) => {
                const existing = slots.find((s) => s.slotId === slot.id);
                return (
                  <div
                    key={slot.id}
                    className="py-3 border-b atlas-divider flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#f3ede0]">{slot.label}</p>
                      <p className="text-[11px] text-[#8fa0b3] truncate">
                        {existing
                          ? `${getRegionManifest(existing.regionId as never).name} · Day ${existing.dayCount}`
                          : 'Empty Archive'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {slot.id !== 'autosave' && (
                        <button
                          type="button"
                          data-testid={`save-${slot.id}`}
                          onClick={() => handleSaveSlot(slot.id, slot.label)}
                          className="atlas-btn-primary inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--atlas-radius-sm)] text-xs font-semibold cursor-pointer"
                        >
                          <Save className="w-3 h-3" aria-hidden="true" />
                          <span>Save</span>
                        </button>
                      )}
                      {existing && (
                        <button
                          type="button"
                          onClick={() => handleLoadSlot(slot.id)}
                          className="atlas-btn-secondary px-2.5 py-1 rounded-[var(--atlas-radius-sm)] text-xs cursor-pointer"
                        >
                          Load
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Quality & Audio Instruments */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1 border-b atlas-divider pb-5">
            <div>
              <p className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#d9a14a] font-semibold mb-2.5">
                Render Preset
              </p>
              <div className="flex gap-1.5" role="group" aria-label="Render quality preset">
                {(['low', 'medium', 'high'] as const).map((tier) => {
                  const active = quality === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setQuality(tier);
                        runtime.setQualityPreset(tier);
                      }}
                      className={`flex-1 py-1.5 rounded-[var(--atlas-radius-md)] text-xs capitalize cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#d9a14a] text-[#090e16] font-semibold'
                          : 'bg-[#131e2d] text-[#cbd5e1] hover:bg-[#19283c]'
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#d9a14a] font-semibold">
                  Soundscape
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    runtime.setMuted(next);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-[#cbd5e1] hover:text-[#f3ede0] cursor-pointer"
                >
                  {muted ? <VolumeX className="w-4 h-4 text-[#8fa0b3]" /> : <Volume2 className="w-4 h-4 text-[#58b4aa]" />}
                  <span>{muted ? 'Muted' : `${Math.round(volume * 100)}%`}</span>
                </button>
              </div>
              <input
                type="range"
                aria-label="Master volume"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  runtime.setVolume(v);
                }}
                className="w-full accent-[#d9a14a] cursor-pointer"
              />
            </div>
          </section>

          {/* Engine Diagnostics Ledger (kept inside Pause/Settings only) */}
          <section className="border-b atlas-divider pb-4">
            <div className="flex items-center justify-between">
              <span className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#8fa0b3]">
                Engine &amp; Renderer Diagnostics
              </span>
              <button
                type="button"
                onClick={() => setShowDiag((s) => !s)}
                className="font-atlas-mono text-xs text-[#58b4aa] hover:underline cursor-pointer"
              >
                {showDiag ? 'Hide' : 'Show Metrics'}
              </button>
            </div>
            {showDiag && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 font-atlas-mono text-xs text-[#cbd5e1]">
                <div>FPS: <span className="text-[#f3ede0]">{diagnostics.fps}</span></div>
                <div>Frame: <span className="text-[#f3ede0]">{diagnostics.frameTimeMs} ms</span></div>
                <div>Sim: <span className="text-[#f3ede0]">{diagnostics.simTimeMs} ms</span></div>
                <div>Calls: <span className="text-[#f3ede0]">{diagnostics.drawCalls}</span></div>
                <div>Tris: <span className="text-[#f3ede0]">{diagnostics.triangles}</span></div>
                <div>Geoms: <span className="text-[#f3ede0]">{diagnostics.geometries}</span></div>
                <div>Textures: <span className="text-[#f3ede0]">{diagnostics.textures}</span></div>
                <div>Near/Dist NPCs: <span className="text-[#f3ede0]">{diagnostics.nearNpcCount}/{diagnostics.districtNpcCount}</span></div>
              </div>
            )}
          </section>

          <footer className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onReturnToTitle}
              className="atlas-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--atlas-radius-md)] text-xs text-[#cbd5e1] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Return to Title</span>
            </button>
            <button
              type="button"
              onClick={onResume}
              className="atlas-btn-primary px-4 py-2 rounded-[var(--atlas-radius-md)] text-xs font-semibold cursor-pointer"
            >
              Resume World
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
};
