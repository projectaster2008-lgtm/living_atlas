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
      return <Sun className="w-4 h-4 text-amber-300" />;
    case 'overcast':
      return <Cloud className="w-4 h-4 text-slate-300" />;
    case 'rain':
      return <CloudRain className="w-4 h-4 text-sky-300" />;
    case 'fog':
      return <CloudFog className="w-4 h-4 text-slate-200" />;
    case 'storm':
      return <CloudLightning className="w-4 h-4 text-amber-200" />;
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
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5"
    >
      {/* Top Row: Left compact location/clock/mission strip & Right icon utility cluster */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Compact Info Cluster */}
        <div className="flex flex-col gap-2 max-w-xs sm:max-w-sm">
          <div className="px-3.5 py-2 rounded-lg bg-[#0d131d]/88 border border-amber-200/20 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Compass className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="font-semibold text-sm text-[#f7f2e8] truncate">
                  {hud.interiorName ? `${hud.regionName} · ${hud.interiorName}` : hud.regionName}
                </span>
              </div>
              <span className="text-[11px] uppercase tracking-wider text-teal-300 font-medium tabular-nums shrink-0">
                {hud.discoveredCount}/{hud.totalLandmarks} Sites
              </span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs text-slate-300 tabular-nums">
              <span className="font-medium text-amber-100">
                Day {hud.dayCount} · {hud.timeFormatted}
              </span>
              <span className="text-slate-400">{hud.dayPhaseLabel}</span>
              <span className="inline-flex items-center gap-1 capitalize text-slate-200">
                <WeatherIcon weather={hud.weather} />
                <span>{hud.weather}</span>
              </span>
            </div>
          </div>

          {hud.activeMissionTitle && (
            <div className="px-3.5 py-2 rounded-lg bg-[#0d131d]/85 border border-teal-300/20 shadow-md">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-teal-300 font-semibold">
                <Flag className="w-3.5 h-3.5" />
                <span className="truncate">{hud.activeMissionTitle}</span>
              </div>
              {hud.activeObjectiveText && (
                <p className="mt-0.5 text-xs text-slate-200 leading-snug">{hud.activeObjectiveText}</p>
              )}
            </div>
          )}

          {hud.activeEventName && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-950/85 border border-amber-300/30 text-xs text-amber-100">
              Active Gathering: <span className="font-semibold">{hud.activeEventName}</span>
            </div>
          )}
        </div>

        {/* Top-Right Compact Utility Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            title="Toggle Audio [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#0d131d]/88 hover:bg-[#172233] border border-amber-200/20 text-xs text-slate-100 cursor-pointer transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-teal-300" />}
            <span className="hidden sm:inline text-[11px] text-slate-300">[M]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-observer"
            title="Observer / Photo Mode [O]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleObserver();
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
              hud.cameraMode === 'observer'
                ? 'bg-amber-500/90 text-[#0c121b] border-amber-200 font-semibold'
                : 'bg-[#0d131d]/88 hover:bg-[#172233] border-amber-200/20 text-slate-100'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Photo [O]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-map-journal"
            title="Map & Journal [J]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenMapJournal();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0d131d]/88 hover:bg-[#172233] border border-amber-200/20 text-xs text-slate-100 cursor-pointer transition-colors"
          >
            <Map className="w-4 h-4 text-amber-300" />
            <span>Map [J]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-pause"
            title="Pause & Settings [Esc]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#0d131d]/88 hover:bg-[#172233] border border-amber-200/20 text-xs text-slate-100 cursor-pointer transition-colors"
          >
            <Pause className="w-4 h-4 text-slate-200" />
            <span className="hidden sm:inline">[Esc]</span>
          </button>
        </div>
      </div>

      {/* Bottom Center Notification Banner, Vehicle Readout & Contextual Prompt */}
      <div className="flex flex-col items-center gap-2.5 mb-1">
        {hud.notificationBanner && (
          <div
            data-testid="hud-notification"
            className="px-4 py-2 rounded-lg bg-[#0d131d]/92 border border-amber-300/35 text-xs md:text-sm text-amber-100 font-medium shadow-lg"
          >
            {hud.notificationBanner}
          </div>
        )}

        {hud.vehicleHud && (
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-[#0d131d]/90 border border-teal-300/25 text-xs tabular-nums shadow-md">
            <div className="flex items-center gap-1.5 text-teal-300 font-medium">
              <Car className="w-4 h-4" />
              <span>{hud.vehicleHud.name}</span>
            </div>
            <span className="text-base font-semibold text-white">{hud.vehicleHud.speedKmh} km/h</span>
            <span className="text-slate-300">Hull {hud.vehicleHud.condition}%</span>
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
            className="pointer-events-auto inline-flex items-center gap-2.5 px-4 py-2 rounded-lg bg-[#0d131d]/94 hover:bg-[#1a2434] border border-amber-300/45 text-sm text-[#f7f2e8] shadow-lg cursor-pointer transition-colors"
          >
            <span className="px-2 py-0.5 rounded bg-[#e0a952] text-[#0c121b] font-bold text-xs">E</span>
            <span className="font-medium">{hud.interactionPrompt.label}</span>
            {hud.interactionPrompt.sublabel && (
              <span className="text-xs text-slate-400">· {hud.interactionPrompt.sublabel}</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
