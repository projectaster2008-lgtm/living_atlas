import React, { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Upload } from 'lucide-react';
import { SaveGameV1 } from '../shared/types/world';
import { getRegionManifest } from '../worlds/WorldCatalog';

interface TitleScreenProps {
  latestSave: SaveGameV1 | null;
  onStartNew: () => void;
  onContinueSave: (save: SaveGameV1) => void;
  onImportSaveJson: (jsonText: string) => Promise<{ ok: boolean; error?: string }>;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  latestSave,
  onStartNew,
  onContinueSave,
  onImportSaveJson,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (latestSave) {
          onContinueSave(latestSave);
        } else {
          onStartNew();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [latestSave, onContinueSave, onStartNew]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const res = await onImportSaveJson(text);
      if (!res.ok) {
        setImportError(res.error ?? 'Invalid save file.');
      }
    } catch {
      setImportError('Failed to read selected file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      data-testid="title-screen"
      className="fixed inset-0 z-20 flex flex-col justify-between px-6 py-8 md:px-12 md:py-10 pointer-events-none"
      style={{
        background:
          'linear-gradient(180deg, rgba(10,16,26,0.68) 0%, rgba(10,16,26,0.12) 45%, rgba(10,16,26,0.72) 100%)',
      }}
    >
      {/* Upper calm negative-space emblem & typography */}
      <div
        className="flex flex-col items-center text-center mt-1 md:mt-4 px-6 py-4 rounded-2xl pointer-events-auto"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(10,16,26,0.52) 0%, rgba(10,16,26,0) 75%)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <svg
            width="44"
            height="44"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="32" cy="32" r="28" stroke="#e0a952" strokeWidth="1.75" strokeOpacity="0.85" />
            <circle cx="32" cy="32" r="21" stroke="#4db6ac" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.6" />
            <path d="M32 8L36.5 27.5L56 32L36.5 36.5L32 56L27.5 36.5L8 32L27.5 27.5L32 8Z" fill="#e0a952" fillOpacity="0.92" />
            <circle cx="32" cy="32" r="4" fill="#0c121b" stroke="#f3efe6" strokeWidth="1.5" />
          </svg>
        </div>

        <p className="text-[11px] uppercase tracking-[0.38em] text-amber-200/80 font-medium hud-text-shadow mb-2">
          Autonomous 3D Open-World Sandbox
        </p>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-[0.06em] text-[#f7f2e8] hud-text-shadow">
          LIVING ATLAS
        </h1>
        <p className="mt-2.5 max-w-lg text-sm md:text-base text-slate-200/90 hud-text-shadow">
          Four interconnected districts alive with daily schedules, dynamic weather, coastal roads, and persistent stories.
        </p>

        {/* Primary Action Cluster */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {latestSave ? (
            <>
              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onContinueSave(latestSave);
                }}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] font-semibold text-sm tracking-wide shadow-lg cursor-pointer transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  Continue ({getRegionManifest(latestSave.currentRegionId).name} · Day {latestSave.dayCount})
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onStartNew();
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#0d131d]/90 hover:bg-[#172131] text-[#f3efe6] border border-amber-200/25 font-medium text-sm cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-amber-300" />
                <span>New Atlas</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartNew();
              }}
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-lg bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] font-semibold text-sm tracking-wide shadow-lg cursor-pointer transition-colors"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Enter World</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              fileInputRef.current?.click();
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-[#0d131d]/85 hover:bg-[#172131] text-slate-200 border border-slate-400/25 text-sm cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4 text-teal-300" />
            <span>Import Save JSON</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {importError && (
          <p className="mt-3 px-3.5 py-1.5 rounded bg-red-950/90 border border-red-400/40 text-red-200 text-xs">
            {importError}
          </p>
        )}
      </div>

      {/* Single flat bottom control-hint strip */}
      <div className="flex justify-center">
        <p className="px-4 py-2 rounded-lg bg-[#0d131d]/85 border border-amber-200/15 text-xs md:text-[13px] text-slate-200/90 tracking-wide">
          WASD Move · Mouse Drag / Q / C Look · E Interact · J Map &amp; Journal · O Photo Mode · Esc Pause
        </p>
      </div>
    </div>
  );
};
