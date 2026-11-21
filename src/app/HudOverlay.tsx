import React from 'react';
import {
  Camera,
  Car,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Compass,
  Flag,
  Map,
  Pause,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ActiveInteractionPrompt, HudViewModel, WeatherKind } from '../shared/types/world';

interface HudOverlayProps {
  hud: HudViewModel;
  muted: boolean;
  onToggleMute: () => void;
  onToggleObserver: () => void;
  onOpenMapJournal: () => void;
  onPause: () => void;
  onInteract: (prompt: ActiveInteractionPrompt) => void;
}

function WeatherIcon({ weather }: { weather: WeatherKind }) {
  switch (weather) {
    case 'clear':
      return <Sun className="w-3.5 h-3.5 text-[#d9a14a]" />;
    case 'overcast':
      return <Cloud className="w-3.5 h-3.5 text-[#cbd5e1]" />;
    case 'rain':
      return <CloudRain className="w-3.5 h-3.5 text-[#7cc4e8]" />;
    case 'fog':
      return <CloudFog className="w-3.5 h-3.5 text-[#cbd5e1]" />;
    case 'storm':
      return <CloudLightning className="w-3.5 h-3.5 text-[#e5b363]" />;
  }
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  muted,
  onToggleMute,
  onToggleObserver,
  onOpenMapJournal,
  onPause,
  onInteract,
}) => {
  return (
    <div
      data-testid="gameplay-hud"
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-4 md:p-6"
    >
      {/* Top Field Header: Quiet editorial location strip left, compact utility bar right */}
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        {/* Top-Left Region, Time & Objective Ledger */}
        <div className="flex flex-col gap-1.5 max-w-md min-w-0">
          <div className="atlas-surface px-3 py-2 sm:px-3.5 rounded-[var(--atlas-radius-md)]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Compass className="w-4 h-4 text-[#d9a14a] shrink-0 self-center" aria-hidden="true" />
                <span className="font-atlas-display text-[14px] sm:text-[15px] md:text-base font-semibold text-[#f3ede0] truncate">
                  {hud.interiorName ? `${hud.regionName} · ${hud.interiorName}` : hud.regionName}
                </span>
              </div>
              <span className="font-atlas-mono text-[11px] text-[#58b4aa] shrink-0">
                {hud.discoveredCount}/{hud.totalLandmarks} Sites
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[#cbd5e1] tabular-nums">
              <span className="font-medium text-[#f3ede0]">
                Day {hud.dayCount} · {hud.timeFormatted}
              </span>
              <span className="text-[#8fa0b3]" aria-hidden="true">/</span>
              <span className="text-[#8fa0b3]">{hud.dayPhaseLabel}</span>
              <span className="text-[#8fa0b3]" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 capitalize text-[#f3ede0]">
                <WeatherIcon weather={hud.weather} />
                <span>{hud.weather}</span>
              </span>
            </div>
          </div>

          {hud.activeMissionTitle && (
            <div className="px-3.5 py-1.5 rounded-[var(--atlas-radius-md)] bg-[#0b111a]/82 border-l-2 border-[#58b4aa]">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#58b4aa]">
                <Flag className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{hud.activeMissionTitle}</span>
              </div>
              {hud.activeObjectiveText && (
                <p className="mt-0.5 text-xs text-[#e2e8f0] leading-snug">{hud.activeObjectiveText}</p>
              )}
            </div>
          )}

          {hud.activeEventName && (
            <div className="atlas-surface px-3 py-1 rounded-[var(--atlas-radius-md)] border-l-2 border-l-[#d9a14a] text-xs text-[#f3ede0] self-start">
              <span className="text-[#e5b363]">Gathering · </span>
              <span className="font-medium">{hud.activeEventName}</span>
            </div>
          )}
        </div>

        {/* Top-Right Compact Field Instrument Controls */}
        <nav aria-label="World controls" className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle audio [M]"
            title="Toggle Audio [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="atlas-surface inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--atlas-radius-md)] hover:bg-[#19283c] text-xs text-[#f3ede0] cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#8fa0b3]" /> : <Volume2 className="w-4 h-4 text-[#58b4aa]" />}
            <span className="hidden sm:inline font-atlas-mono text-[11px] text-[#cbd5e1]">[M]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-observer"
            aria-label="Observer and Photo Mode [O]"
            title="Observer / Photo Mode [O]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleObserver();
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--atlas-radius-md)] border text-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              hud.cameraMode === 'observer'
                ? 'bg-[#d9a14a] text-[#090e16] border-[#d9a14a] font-semibold'
                : 'atlas-surface hover:bg-[#19283c] text-[#f3ede0]'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Photo [O]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-map-journal"
            aria-label="Open Atlas Map and Field Journal [J]"
            title="Atlas Map & Field Journal [J]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenMapJournal();
            }}
            className="atlas-surface inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--atlas-radius-md)] hover:bg-[#19283c] text-xs text-[#f3ede0] cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <Map className="w-4 h-4 text-[#d9a14a]" />
            <span>Map [J]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-pause"
            aria-label="Pause and Settings [Esc]"
            title="Pause & Settings [Esc]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="atlas-surface inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--atlas-radius-md)] hover:bg-[#19283c] text-xs text-[#f3ede0] cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <Pause className="w-4 h-4 text-[#cbd5e1]" />
            <span className="hidden sm:inline font-atlas-mono text-[11px] text-[#cbd5e1]">[Esc]</span>
          </button>
        </nav>
      </div>

      {/* Bottom Center Toast, Vehicle Readout & Contextual Prompt */}
      <div className="flex flex-col items-center gap-2.5 mb-1">
        {hud.notificationBanner && (
          <div
            data-testid="hud-notification"
            role="status"
            className="atlas-surface px-4 py-2 rounded-[var(--atlas-radius-md)] text-xs md:text-sm text-[#f3ede0] font-medium"
          >
            {hud.notificationBanner}
          </div>
        )}

        {hud.vehicleHud && (
          <div className="atlas-surface flex items-center gap-4 px-4 py-2 rounded-[var(--atlas-radius-md)] text-xs tabular-nums">
            <div className="flex items-center gap-1.5 text-[#58b4aa] font-medium">
              <Car className="w-4 h-4" />
              <span>{hud.vehicleHud.name}</span>
            </div>
            <span className="font-atlas-mono text-base font-semibold text-[#f3ede0]">
              {hud.vehicleHud.speedKmh} km/h
            </span>
            <span className="text-[#8fa0b3]">Hull {hud.vehicleHud.condition}%</span>
          </div>
        )}

        {hud.interactionPrompt && hud.cameraMode !== 'observer' && (
          <button
            type="button"
            tabIndex={-1}
            data-testid="interaction-prompt"
            onClick={(e) => {
              e.currentTarget.blur();
              if (hud.interactionPrompt) onInteract(hud.interactionPrompt);
            }}
            className="pointer-events-auto inline-flex items-center gap-2.5 px-4 py-2 rounded-[var(--atlas-radius-md)] bg-[#0d1520]/94 hover:bg-[#19283c] border border-[#d9a14a]/45 text-sm text-[#f3ede0] shadow-lg cursor-pointer transition-colors"
          >
            <kbd className="font-atlas-mono px-2 py-0.5 rounded-[var(--atlas-radius-sm)] bg-[#d9a14a] text-[#090e16] font-bold text-xs">
              E
            </kbd>
            <span className="font-medium">{hud.interactionPrompt.label}</span>
            {hud.interactionPrompt.sublabel && (
              <span className="text-xs text-[#8fa0b3]">· {hud.interactionPrompt.sublabel}</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
