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
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'BUTTON' || activeTag === 'INPUT') return;
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
      className="fixed inset-0 z-20 flex flex-col justify-between px-6 py-7 md:px-14 md:py-11 pointer-events-none"
      style={{
        background:
          'linear-gradient(95deg, rgba(9,14,22,0.78) 0%, rgba(9,14,22,0.42) 38%, rgba(9,14,22,0.06) 72%, rgba(9,14,22,0.18) 100%), linear-gradient(180deg, rgba(9,14,22,0.22) 0%, rgba(9,14,22,0) 35%, rgba(9,14,22,0.68) 100%)',
      }}
    >
      {/* Top quiet cartographic header line */}
      <header className="flex items-center justify-between text-xs text-[#cbd5e1]/85 hud-text-shadow">
        <div className="flex items-center gap-3">
          <svg
            width="28"
            height="28"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="32" cy="32" r="27" stroke="#d9a14a" strokeWidth="1.75" strokeOpacity="0.88" />
            <circle cx="32" cy="32" r="19" stroke="#58b4aa" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.65" />
            <path d="M32 10L36 28L54 32L36 36L32 54L28 36L10 32L28 28L32 10Z" fill="#d9a14a" fillOpacity="0.92" />
            <circle cx="32" cy="32" r="3.5" fill="#090e16" stroke="#f3ede0" strokeWidth="1.5" />
          </svg>
          <span className="font-atlas-mono tracking-wider text-[11px] text-[#d9a14a]">
            36°42&apos;N · 121°54&apos;W
          </span>
        </div>
        <span className="hidden sm:inline font-atlas-mono text-[11px] text-[#cbd5e1]/75">
          Four Interconnected Districts · Local Field Archive
        </span>
      </header>

      {/* Bottom-left editorial lockup keeping central bay & lighthouse vista unobstructed */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <section className="max-w-xl pointer-events-auto">
          <div className="flex items-center gap-3 mb-2.5">
            <span className="h-px w-8 bg-[#d9a14a]/80" aria-hidden="true" />
            <span className="text-xs tracking-[0.18em] uppercase text-[#58b4aa] font-medium hud-text-shadow">
              Coastal Exploration &amp; Living World
            </span>
          </div>

          <h1 className="font-atlas-display text-4xl sm:text-5xl md:text-6xl font-normal tracking-tight text-[#f3ede0] hud-text-shadow text-balance leading-[1.05]">
            Living Atlas
          </h1>

          <p className="mt-3 max-w-md text-sm md:text-[15px] leading-relaxed text-[#e2e8f0]/90 hud-text-shadow">
            Step into four autonomous regions shaped by tidal promenades, daily civic routines, shifting weather, and quiet human stories.
          </p>

          {/* Primary Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {latestSave ? (
              <>
                <button
                  type="button"
                  data-start="true"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onContinueSave(latestSave);
                  }}
                  className="atlas-btn-primary inline-flex items-center gap-2.5 px-6 py-3 rounded-[var(--atlas-radius-md)] font-semibold text-sm cursor-pointer shadow-lg whitespace-nowrap shrink-0"
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
                  className="atlas-btn-secondary inline-flex items-center gap-2 px-4 py-3 rounded-[var(--atlas-radius-md)] font-medium text-sm cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-4 h-4 text-[#d9a14a]" />
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
                className="atlas-btn-primary inline-flex items-center gap-2.5 px-6 py-3 rounded-[var(--atlas-radius-md)] font-semibold text-sm cursor-pointer shadow-lg whitespace-nowrap shrink-0"
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
              className="atlas-btn-secondary inline-flex items-center gap-2 px-4 py-3 rounded-[var(--atlas-radius-md)] text-sm text-[#cbd5e1] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4 text-[#58b4aa]" />
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
            <p className="mt-3 px-3.5 py-2 rounded-[var(--atlas-radius-sm)] bg-[#3a161a]/95 border border-[#d96b6b]/50 text-[#f8d7da] text-xs">
              {importError}
            </p>
          )}
        </section>

        {/* Quiet unboxed keyboard instruction line */}
        <p className="text-xs text-[#cbd5e1]/85 hud-text-shadow tracking-wide md:text-right">
          WASD Move · Mouse Drag or Q/C Look · E Interact · J Atlas Map · O Camera · Esc Menu
        </p>
      </div>
    </div>
  );
};
