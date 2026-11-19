import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Compass, Flag, Lock, MapPin, Navigation, Users, X } from 'lucide-react';
import { GameRuntime } from './GameRuntime';
import { RegionId } from '../shared/types/world';
import { ALL_REGION_IDS, getRegionManifest } from '../worlds/WorldCatalog';

interface MapJournalModalProps {
  runtime: GameRuntime;
  initialTab?: 'map' | 'missions' | 'residents' | 'photos';
  onTravel: (regionId: RegionId) => void;
  onClose: () => void;
}

export const MapJournalModal: React.FC<MapJournalModalProps> = ({
  runtime,
  initialTab = 'map',
  onTravel,
  onClose,
}) => {
  const [tab, setTab] = useState<'map' | 'missions' | 'residents' | 'photos'>(initialTab);
  const [, setVersion] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyJ') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const currentRegionId = runtime.getCurrentRegionId();
  const manifest = getRegionManifest(currentRegionId);
  const missions = runtime.missions.getAllMissions();
  const npcs = runtime.npcSim.getActiveRegionNpcs(currentRegionId);
  const playerPos = runtime.playerCtrl.state.position;
  const playerYaw = runtime.playerCtrl.state.yaw;

  const mapRadius = manifest.boundsRadius + 15;
  const project = (x: number, z: number) => {
    const nx = ((x + mapRadius) / (mapRadius * 2)) * 340;
    const ny = ((z + mapRadius) / (mapRadius * 2)) * 340;
    return { cx: Math.max(10, Math.min(330, nx)), cy: Math.max(10, Math.min(330, ny)) };
  };
  const pProj = project(playerPos.x, playerPos.z);

  return (
    <div
      data-testid="map-journal-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b11]/80"
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#0d131d]/98 border border-amber-200/25 shadow-2xl overflow-hidden">
        {/* Header & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base font-semibold text-[#f7f2e8]">Atlas Map &amp; Field Journal</h2>
              <p className="text-xs text-slate-400">
                Active Region: {manifest.name} · {manifest.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'map', label: 'Map & Gateway', icon: MapPin },
                { id: 'missions', label: 'Missions', icon: Flag },
                { id: 'residents', label: 'Residents', icon: Users },
                { id: 'photos', label: 'Discoveries', icon: Camera },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    tab === item.id
                      ? 'bg-[#e0a952] text-[#0c121b] font-semibold'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={onClose}
              className="ml-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              aria-label="Close Map & Journal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto atlas-scroll p-5">
          {tab === 'map' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Top-Down Vector Radar Map */}
              <div className="lg:col-span-5 flex flex-col items-center bg-[#090e16] rounded-xl border border-slate-700/50 p-4">
                <svg viewBox="0 0 340 340" className="w-full max-w-[320px] aspect-square rounded-lg bg-[#0d1521]">
                  {/* Grid lines */}
                  <line x1="170" y1="0" x2="170" y2="340" stroke="#1e293b" strokeWidth="1" />
                  <line x1="0" y1="170" x2="340" y2="170" stroke="#1e293b" strokeWidth="1" />
                  <circle cx="170" cy="170" r="110" fill="none" stroke="#1e293b" strokeDasharray="4 4" />

                  {/* Traffic roads */}
                  {manifest.trafficNodes.map((n) => {
                    const a = project(n.position.x, n.position.z);
                    return n.nextIds.map((nid) => {
                      const next = manifest.trafficNodes.find((x) => x.id === nid);
                      if (!next) return null;
                      const b = project(next.position.x, next.position.z);
                      return (
                        <line
                          key={`${n.id}-${nid}`}
                          x1={a.cx}
                          y1={a.cy}
                          x2={b.cx}
                          y2={b.cy}
                          stroke="#334155"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      );
                    });
                  })}

                  {/* Buildings */}
                  {manifest.buildings.map((b) => {
                    const pt = project(b.position.x, b.position.z);
                    const w = Math.max(6, (b.size.x / (mapRadius * 2)) * 340);
                    const h = Math.max(6, (b.size.z / (mapRadius * 2)) * 340);
                    return (
                      <rect
                        key={b.id}
                        x={pt.cx - w / 2}
                        y={pt.cy - h / 2}
                        width={w}
                        height={h}
                        rx="2"
                        fill={b.interiorId ? '#475569' : '#263244'}
                        stroke={b.interiorId ? '#e0a952' : '#334155'}
                        strokeWidth="1"
                      />
                    );
                  })}

                  {/* Landmarks */}
                  {manifest.landmarks.map((lm) => {
                    const pt = project(lm.position.x, lm.position.z);
                    const found = runtime.discoveredLandmarks.has(lm.id);
                    return (
                      <g key={lm.id}>
                        <circle
                          cx={pt.cx}
                          cy={pt.cy}
                          r="4.5"
                          fill={found ? '#4db6ac' : '#64748b'}
                          stroke="#0c121b"
                          strokeWidth="1.2"
                        />
                      </g>
                    );
                  })}

                  {/* NPCs */}
                  {npcs.map((n) => {
                    const pt = project(n.position.x, n.position.z);
                    return <circle key={n.id} cx={pt.cx} cy={pt.cy} r="2.2" fill="#cbd5e1" opacity="0.8" />;
                  })}

                  {/* Player arrow */}
                  <g transform={`translate(${pProj.cx}, ${pProj.cy}) rotate(${(-playerYaw * 180) / Math.PI})`}>
                    <polygon points="0,-7 5,6 0,3 -5,6" fill="#e0a952" stroke="#0c121b" strokeWidth="1" />
                  </g>
                </svg>

                <div className="mt-3 flex flex-wrap justify-center gap-3 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e0a952]" /> You
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#4db6ac]" /> Landmark
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm border border-[#e0a952] bg-[#475569]" /> Interior
                  </span>
                </div>
              </div>

              {/* World Gateway Quick-Travel Cards */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-200 uppercase tracking-wider">
                    World Gateway Transit
                  </h3>
                  <span className="text-xs text-slate-400">Select any unlocked district</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ALL_REGION_IDS.map((id) => {
                    const m = getRegionManifest(id);
                    const unlocked = runtime.unlockedRegions.has(id);
                    const isCurrent = id === currentRegionId;
                    return (
                      <div
                        key={id}
                        className={`rounded-xl p-3.5 border transition-colors ${
                          isCurrent
                            ? 'bg-[#162233] border-amber-300/55'
                            : 'bg-[#111926] border-slate-700/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-semibold text-sm text-[#f7f2e8]">{m.name}</h4>
                          {isCurrent ? (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 font-medium">
                              Current
                            </span>
                          ) : !unlocked ? (
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                          ) : null}
                        </div>
                        <p className="text-[11px] text-teal-300 mt-0.5">{m.subtitle}</p>
                        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{m.description}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">
                            {m.residents.length} Residents · {m.interiors.length} Interiors
                          </span>
                          <button
                            type="button"
                            data-testid={`travel-${id}`}
                            disabled={!unlocked || isCurrent}
                            onClick={() => {
                              onTravel(id);
                              onClose();
                            }}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                              isCurrent
                                ? 'bg-slate-800 text-slate-500 cursor-default'
                                : unlocked
                                  ? 'bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b]'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Navigation className="w-3 h-3" />
                            <span>{isCurrent ? 'Here' : 'Travel'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'missions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {missions.map(({ def, progress }) => {
                const isActive = progress.status === 'active';
                const isDone = progress.status === 'completed';
                const isLocked = progress.status === 'locked';
                return (
                  <div
                    key={def.id}
                    className={`rounded-xl p-4 border ${
                      isActive
                        ? 'bg-[#152232] border-amber-300/50'
                        : 'bg-[#101824] border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-teal-300 font-semibold">
                          {getRegionManifest(def.regionId).name}
                        </span>
                        <h3 className="text-sm font-semibold text-[#f7f2e8]">{def.title}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                          isDone
                            ? 'bg-emerald-900/60 text-emerald-200'
                            : isActive
                              ? 'bg-amber-400/20 text-amber-200'
                              : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {progress.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-1.5">{def.summary}</p>

                    <div className="mt-3 flex flex-col gap-1.5">
                      {def.objectives.map((obj, idx) => {
                        const completed = progress.completedObjectiveIds.includes(obj.id);
                        const current = isActive && idx === progress.currentObjectiveIndex;
                        return (
                          <div
                            key={obj.id}
                            className={`flex items-center gap-2 text-xs ${
                              completed
                                ? 'text-emerald-300 line-through opacity-80'
                                : current
                                  ? 'text-amber-200 font-medium'
                                  : 'text-slate-400'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{obj.description}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Reward: {def.rewardLabel}</span>
                      {!isLocked && !isActive && (!isDone || def.repeatable) && (
                        <button
                          type="button"
                          onClick={() => {
                            runtime.missions.setActiveMission(def.id);
                            setVersion((v) => v + 1);
                          }}
                          className="px-3 py-1 rounded bg-[#e0a952] hover:bg-[#eab96b] text-[#0c121b] font-semibold cursor-pointer"
                        >
                          Track Mission
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'residents' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {manifest.residents.map((res) => {
                const rel = runtime.relationships.get(res.id);
                const tier = runtime.relationships.getTierLabel(res.id);
                const simState = npcs.find((n) => n.id === res.id);
                return (
                  <div
                    key={res.id}
                    className="rounded-xl bg-[#101824] border border-slate-700/60 p-3.5 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-[#f7f2e8]">{res.name}</h4>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-amber-200">
                        {tier}
                      </span>
                    </div>
                    <p className="text-xs text-teal-300">{res.occupation}</p>
                    <p className="text-xs text-slate-400 line-clamp-2">{res.bio}</p>
                    <div className="mt-1 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
                      <span className="capitalize">Activity: {simState?.behavior.replace('_', ' ') ?? 'idle'}</span>
                      <span>Trust {Math.round(rel.trust)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'photos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold text-amber-200 mb-2.5">
                  Discovered Landmarks ({runtime.discoveredLandmarks.size})
                </h3>
                <div className="flex flex-col gap-2">
                  {manifest.landmarks.map((lm) => {
                    const found = runtime.discoveredLandmarks.has(lm.id);
                    return (
                      <div
                        key={lm.id}
                        className="rounded-lg bg-[#101824] border border-slate-700/50 p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-100">{lm.name}</p>
                          <p className="text-xs text-slate-400">{lm.description}</p>
                        </div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded ${
                            found ? 'bg-teal-900/70 text-teal-200' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {found ? 'Visited' : 'Unvisited'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-amber-200 mb-2.5">
                  Field Photography Log ({runtime.photos.length})
                </h3>
                {runtime.photos.length === 0 ? (
                  <p className="text-xs text-slate-400 rounded-lg bg-[#101824] border border-slate-700/50 p-4">
                    Open Observer / Photo Mode with [O] and press [Space] near landmarks to record field photographs.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {runtime.photos.map((ph) => (
                      <div
                        key={ph.id}
                        className="rounded-lg bg-[#101824] border border-slate-700/50 p-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-100">{ph.landmarkName}</p>
                          <p className="text-slate-400">
                            {getRegionManifest(ph.regionId).name} · Weather: {ph.weather}
                          </p>
                        </div>
                        <Camera className="w-4 h-4 text-amber-300" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
