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
  { id: 'manual-1', label: 'Slot 1' },
  { id: 'manual-2', label: 'Slot 2' },
  { id: 'manual-3', label: 'Slot 3' },
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
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#070b11]/82"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0d131d]/98 border border-amber-200/25 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-300" />
            <h2 className="text-base font-semibold text-[#f7f2e8]">World Paused &amp; Settings</h2>
          </div>
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] text-xs font-semibold cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Resume [Esc]</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto atlas-scroll p-5 flex flex-col gap-5 text-sm">
          {statusMessage && (
            <div className="px-3.5 py-2 rounded-lg bg-teal-950/80 border border-teal-400/35 text-xs text-teal-200 flex items-center justify-between">
              <span>{statusMessage}</span>
              <button type="button" onClick={() => setStatusMessage(null)} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Save Slots & Backup */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h3 className="text-xs uppercase tracking-wider text-amber-200 font-semibold">
                Local IndexedDB Save Slots
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="btn-export-save"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-300" />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SLOTS.map((slot) => {
                const existing = slots.find((s) => s.slotId === slot.id);
                return (
                  <div
                    key={slot.id}
                    className="rounded-xl bg-[#111926] border border-slate-700/60 p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100">{slot.label}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {existing
                          ? `${getRegionManifest(existing.regionId as never).name} · Day ${existing.dayCount}`
                          : 'Empty Slot'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {slot.id !== 'autosave' && (
                        <button
                          type="button"
                          data-testid={`save-${slot.id}`}
                          onClick={() => handleSaveSlot(slot.id, slot.label)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] text-xs font-semibold cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      )}
                      {existing && (
                        <button
                          type="button"
                          onClick={() => handleLoadSlot(slot.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
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

          {/* Quality & Audio */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#111926] border border-slate-700/60 p-3.5">
              <p className="text-xs uppercase tracking-wider text-amber-200 font-semibold mb-2">
                Graphics Quality Preset
              </p>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => {
                      setQuality(tier);
                      runtime.setQualityPreset(tier);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs capitalize cursor-pointer ${
                      quality === tier
                        ? 'bg-[#e0a952] text-[#0c121b] font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-[#111926] border border-slate-700/60 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-amber-200 font-semibold">Audio</p>
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    runtime.setMuted(next);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer"
                >
                  {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-teal-300" />}
                  <span>{muted ? 'Muted' : 'Active'}</span>
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  runtime.setVolume(v);
                }}
                className="w-full accent-[#e0a952] cursor-pointer"
              />
            </div>
          </section>

          {/* Engine Diagnostics (inside Pause/Settings only, keeps HUD clean) */}
          <section className="rounded-xl bg-[#111926] border border-slate-700/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
                Engine &amp; Renderer Diagnostics
              </span>
              <button
                type="button"
                onClick={() => setShowDiag((s) => !s)}
                className="text-xs text-teal-300 hover:underline cursor-pointer"
              >
                {showDiag ? 'Hide' : 'Show Metrics'}
              </button>
            </div>
            {showDiag && (
              <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums text-slate-300">
                <div>FPS: {diagnostics.fps}</div>
                <div>Frame: {diagnostics.frameTimeMs} ms</div>
                <div>Sim: {diagnostics.simTimeMs} ms</div>
                <div>Calls: {diagnostics.drawCalls}</div>
                <div>Tris: {diagnostics.triangles}</div>
                <div>Geoms: {diagnostics.geometries}</div>
                <div>Textures: {diagnostics.textures}</div>
                <div>Near/Dist NPCs: {diagnostics.nearNpcCount}/{diagnostics.districtNpcCount}</div>
              </div>
            )}
          </section>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onReturnToTitle}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Return to Title</span>
            </button>
            <button
              type="button"
              onClick={onResume}
              className="px-4 py-2 rounded-lg bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] text-xs font-semibold cursor-pointer"
            >
              Resume World
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
