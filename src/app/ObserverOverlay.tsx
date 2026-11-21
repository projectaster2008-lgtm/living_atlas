import React from 'react';
import { Camera, Clock, CloudRain, EyeOff } from 'lucide-react';
import { WeatherKind } from '../shared/types/world';

interface ObserverOverlayProps {
  timeFormatted: string;
  timeScale: number;
  simPaused: boolean;
  weather: WeatherKind;
  photoCount: number;
  onSetTimeScale: (scale: number, paused: boolean) => void;
  onSetWeather: (kind: WeatherKind) => void;
  onCapturePhoto: () => void;
  onExit: () => void;
}

const WEATHERS: WeatherKind[] = ['clear', 'overcast', 'rain', 'fog', 'storm'];

export const ObserverOverlay: React.FC<ObserverOverlayProps> = ({
  timeFormatted,
  timeScale,
  simPaused,
  weather,
  photoCount,
  onSetTimeScale,
  onSetWeather,
  onCapturePhoto,
  onExit,
}) => {
  return (
    <>
      {/* Subtle photographer's viewfinder corner brackets */}
      <div className="fixed inset-6 md:inset-10 z-10 pointer-events-none" aria-hidden="true">
        <span className="absolute top-0 left-0 w-5 h-5 border-t border-l border-[#f3ede0]/40" />
        <span className="absolute top-0 right-0 w-5 h-5 border-t border-r border-[#f3ede0]/40" />
        <span className="absolute bottom-14 left-0 w-5 h-5 border-b border-l border-[#f3ede0]/40" />
        <span className="absolute bottom-14 right-0 w-5 h-5 border-b border-r border-[#f3ede0]/40" />
      </div>

      <div
        data-testid="observer-overlay"
        className="fixed bottom-4 inset-x-0 z-20 flex justify-center px-3 pointer-events-none"
      >
        <div className="atlas-modal pointer-events-auto flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-[var(--atlas-radius-lg)] text-xs max-w-[96vw]">
          {/* Time Pace Instrument */}
          <div className="flex items-center gap-2 pr-3 border-r atlas-divider">
            <Clock className="w-3.5 h-3.5 text-[#d9a14a]" aria-hidden="true" />
            <span className="font-atlas-mono font-semibold text-[#f3ede0]">{timeFormatted}</span>
            <div className="flex items-center gap-1 ml-1" role="group" aria-label="Simulation speed">
              {[
                { label: 'Pause', scale: 1, paused: true },
                { label: '1x', scale: 1, paused: false },
                { label: '4x', scale: 4, paused: false },
                { label: '12x', scale: 12, paused: false },
              ].map((opt) => {
                const active = opt.paused ? simPaused : !simPaused && timeScale === opt.scale;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSetTimeScale(opt.scale, opt.paused)}
                    className={`px-2 py-1 rounded-[var(--atlas-radius-sm)] cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#d9a14a] text-[#090e16] font-semibold'
                        : 'bg-[#131e2d] text-[#cbd5e1] hover:bg-[#19283c]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Atmosphere Override Instrument */}
          <div className="flex items-center gap-1 pr-3 border-r atlas-divider" role="group" aria-label="Weather condition">
            <CloudRain className="w-3.5 h-3.5 text-[#58b4aa] mr-0.5" aria-hidden="true" />
            {WEATHERS.map((w) => {
              const active = weather === w;
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSetWeather(w)}
                  className={`px-2 py-1 rounded-[var(--atlas-radius-sm)] capitalize cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#58b4aa] text-[#090e16] font-semibold'
                      : 'bg-[#131e2d] text-[#cbd5e1] hover:bg-[#19283c]'
                  }`}
                >
                  {w}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="btn-capture-photo"
            onClick={onCapturePhoto}
            className="atlas-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--atlas-radius-md)] font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Capture [Space] ({photoCount})</span>
          </button>

          <button
            type="button"
            onClick={onExit}
            className="atlas-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--atlas-radius-md)] text-[#cbd5e1] cursor-pointer whitespace-nowrap shrink-0"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Exit [O]</span>
          </button>
        </div>
      </div>
    </>
  );
};
