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
    <div
      data-testid="observer-overlay"
      className="fixed bottom-4 inset-x-0 z-20 flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-[#0d131d]/95 border border-amber-200/30 shadow-2xl text-xs">
        <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
          <Clock className="w-4 h-4 text-amber-300" />
          <span className="tabular-nums font-semibold text-slate-100">{timeFormatted}</span>
          <div className="flex items-center gap-1 ml-1">
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
                  onClick={() => onSetTimeScale(opt.scale, opt.paused)}
                  className={`px-2 py-1 rounded cursor-pointer ${
                    active
                      ? 'bg-[#e0a952] text-[#0c121b] font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700">
          <CloudRain className="w-4 h-4 text-teal-300" />
          {WEATHERS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onSetWeather(w)}
              className={`px-2 py-1 rounded capitalize cursor-pointer ${
                weather === w
                  ? 'bg-teal-400 text-[#0c121b] font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        <button
          type="button"
          data-testid="btn-capture-photo"
          onClick={onCapturePhoto}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] font-semibold cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Capture [Space] ({photoCount})</span>
        </button>

        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>Exit [O]</span>
        </button>
      </div>
    </div>
  );
};
