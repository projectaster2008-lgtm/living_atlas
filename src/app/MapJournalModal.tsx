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

const SVG_SIZE = 360;

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
  const pxPerMeter = SVG_SIZE / (mapRadius * 2);
  const project = (x: number, z: number) => {
    const nx = ((x + mapRadius) / (mapRadius * 2)) * SVG_SIZE;
    const ny = ((z + mapRadius) / (mapRadius * 2)) * SVG_SIZE;
    return {
      cx: Math.max(8, Math.min(SVG_SIZE - 8, nx)),
      cy: Math.max(8, Math.min(SVG_SIZE - 8, ny)),
    };
  };
  const projectRaw = (x: number, z: number) => ({
    cx: ((x + mapRadius) / (mapRadius * 2)) * SVG_SIZE,
    cy: ((z + mapRadius) / (mapRadius * 2)) * SVG_SIZE,
  });

  const pProj = project(playerPos.x, playerPos.z);
  const scale50Px = Math.round(50 * pxPerMeter);

  // Build shoreline polygon in SVG coords when hasCoastalOcean is true
  const oceanPath = manifest.hasCoastalOcean
    ? (() => {
        const pts: string[] = ['0,0', `${SVG_SIZE},0`];
        for (let x = mapRadius; x >= -mapRadius; x -= 8) {
          // Coastline drops north of z ~ -44, with central Solara Point headland extending to z = -74 around x=0
          const headland = 26 * Math.exp(-(x * x) / (13 * 13));
          const coveWave = Math.sin(x * 0.06) * 4;
          const coastZ = -45 - headland + coveWave;
          const pt = projectRaw(x, coastZ);
          pts.push(`${pt.cx.toFixed(1)},${pt.cy.toFixed(1)}`);
        }
        return `M ${pts.join(' L ')} Z`;
      })()
    : null;

  const coastlineStroke = manifest.hasCoastalOcean
    ? (() => {
        const pts: string[] = [];
        for (let x = -mapRadius; x <= mapRadius; x += 6) {
          const headland = 26 * Math.exp(-(x * x) / (13 * 13));
          const coveWave = Math.sin(x * 0.06) * 4;
          const coastZ = -45 - headland + coveWave;
          const pt = projectRaw(x, coastZ);
          pts.push(`${pt.cx.toFixed(1)},${pt.cy.toFixed(1)}`);
        }
        return `M ${pts.join(' L ')}`;
      })()
    : null;

  return (
    <div
      data-testid="map-journal-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-5 bg-[var(--atlas-scrim)]"
    >
      <div className="atlas-modal w-full max-w-5xl max-h-[90vh] flex flex-col rounded-[var(--atlas-radius-lg)] overflow-hidden">
        {/* Editorial Folio Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b atlas-divider bg-[#0a1019]">
          <div className="flex items-center gap-3 min-w-0">
            <Compass className="w-5 h-5 text-[#d9a14a] shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h2 className="font-atlas-display text-lg font-semibold text-[#f3ede0] leading-tight">
                  Field Atlas &amp; Journal
                </h2>
                <span className="font-atlas-mono text-[11px] text-[#58b4aa] tracking-wider uppercase">
                  {manifest.name}
                </span>
              </div>
              <p className="text-xs text-[#8fa0b3] truncate">{manifest.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'map', label: 'Map & Gateway', icon: MapPin },
                { id: 'missions', label: 'Missions', icon: Flag },
                { id: 'residents', label: 'Residents', icon: Users },
                { id: 'photos', label: 'Discoveries', icon: Camera },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--atlas-radius-md)] text-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#d9a14a] text-[#090e16] font-semibold'
                      : 'bg-[#131e2d] text-[#cbd5e1] hover:bg-[#19283c]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={onClose}
              className="ml-1.5 p-1.5 rounded-[var(--atlas-radius-md)] atlas-btn-secondary cursor-pointer"
              aria-label="Close Map & Journal"
              title="Close [Esc]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Folio Content */}
        <div className="flex-1 overflow-y-auto atlas-scroll p-5 md:p-6">
          {tab === 'map' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Cartographic Map Plate */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between text-[11px] font-atlas-mono text-[#8fa0b3]">
                  <span className="uppercase tracking-[0.16em]">Survey Plate · 1:{Math.round(mapRadius * 20)}</span>
                  <span>
                    X {Math.round(playerPos.x)} · Z {Math.round(playerPos.z)}
                  </span>
                </div>

                <div className="relative rounded-[var(--atlas-radius-md)] border border-[var(--atlas-hairline-strong)] bg-[#0b1522] p-2">
                  <svg
                    viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
                    className="w-full aspect-square rounded-[var(--atlas-radius-sm)] bg-[#101c2b]"
                    role="img"
                    aria-label={`Cartographic map of ${manifest.name}`}
                  >
                    <defs>
                      <linearGradient id="atlas-sea-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f2c40" />
                        <stop offset="100%" stopColor="#19465e" />
                      </linearGradient>
                    </defs>

                    {/* Land Tint */}
                    <rect x="0" y="0" width={SVG_SIZE} height={SVG_SIZE} fill="#141e2b" />

                    {/* Coastal Ocean & Bathymetry */}
                    {oceanPath && <path d={oceanPath} fill="url(#atlas-sea-grad)" />}
                    {coastlineStroke && (
                      <>
                        <path d={coastlineStroke} fill="none" stroke="#58b4aa" strokeWidth="5" opacity="0.18" />
                        <path d={coastlineStroke} fill="none" stroke="#6ec8be" strokeWidth="1.4" opacity="0.82" />
                      </>
                    )}

                    {/* Alpine Lake */}
                    {manifest.hasAlpineLake && (() => {
                      const lk = projectRaw(34, -48);
                      const r = 24 * pxPerMeter;
                      return (
                        <g>
                          <circle cx={lk.cx} cy={lk.cy} r={r} fill="#164258" stroke="#58b4aa" strokeWidth="1.2" />
                        </g>
                      );
                    })()}

                    {/* Cartographic Graticule Grid */}
                    {[60, 120, 180, 240, 300].map((pos) => (
                      <g key={pos}>
                        <line x1={pos} y1="0" x2={pos} y2={SVG_SIZE} stroke="#233349" strokeWidth="0.7" opacity="0.7" />
                        <line x1="0" y1={pos} x2={SVG_SIZE} y2={pos} stroke="#233349" strokeWidth="0.7" opacity="0.7" />
                      </g>
                    ))}
                    <circle
                      cx={SVG_SIZE / 2}
                      cy={SVG_SIZE / 2}
                      r={manifest.boundsRadius * pxPerMeter}
                      fill="none"
                      stroke="#344861"
                      strokeDasharray="3 4"
                      strokeWidth="0.9"
                    />

                    {/* Central Plaza Disk */}
                    {(() => {
                      const c = projectRaw(0, 0);
                      const pr = 16 * pxPerMeter;
                      return (
                        <circle
                          cx={c.cx}
                          cy={c.cy}
                          r={pr}
                          fill="#202d3f"
                          stroke="#d9a14a"
                          strokeOpacity="0.35"
                          strokeWidth="1"
                        />
                      );
                    })()}

                    {/* Solara Marina Pier Footprint */}
                    {manifest.hasCoastalOcean && (() => {
                      const pt = projectRaw(28, -58);
                      const pw = 7 * pxPerMeter;
                      const ph = 28 * pxPerMeter;
                      return (
                        <rect
                          x={pt.cx - pw / 2}
                          y={pt.cy - ph / 2}
                          width={pw}
                          height={ph}
                          rx="1"
                          fill="#7c5d3f"
                          stroke="#d9a14a"
                          strokeOpacity="0.55"
                          strokeWidth="0.8"
                        />
                      );
                    })()}

                    {/* Traffic Carriageway Hierarchy */}
                    {manifest.trafficNodes.map((n) => {
                      const a = project(n.position.x, n.position.z);
                      return n.nextIds.map((nid) => {
                        const next = manifest.trafficNodes.find((x) => x.id === nid);
                        if (!next) return null;
                        const b = project(next.position.x, next.position.z);
                        return (
                          <g key={`${n.id}-${nid}`}>
                            <line
                              x1={a.cx}
                              y1={a.cy}
                              x2={b.cx}
                              y2={b.cy}
                              stroke="#233142"
                              strokeWidth="7.5"
                              strokeLinecap="round"
                            />
                            <line
                              x1={a.cx}
                              y1={a.cy}
                              x2={b.cx}
                              y2={b.cy}
                              stroke="#3b4d63"
                              strokeWidth="4.2"
                              strokeLinecap="round"
                            />
                            <line
                              x1={a.cx}
                              y1={a.cy}
                              x2={b.cx}
                              y2={b.cy}
                              stroke="#94a3b8"
                              strokeOpacity="0.4"
                              strokeWidth="0.8"
                              strokeDasharray="3 4"
                            />
                          </g>
                        );
                      });
                    })}

                    {/* Rotated Building Footprints */}
                    {manifest.buildings.map((b) => {
                      const pt = project(b.position.x, b.position.z);
                      const w = Math.max(6, b.size.x * pxPerMeter);
                      const h = Math.max(6, b.size.z * pxPerMeter);
                      const deg = (-b.yaw * 180) / Math.PI;
                      return (
                        <g key={b.id} transform={`translate(${pt.cx}, ${pt.cy}) rotate(${deg})`}>
                          <rect
                            x={-w / 2}
                            y={-h / 2}
                            width={w}
                            height={h}
                            rx="1.2"
                            fill={b.interiorId ? '#3c4c63' : '#253346'}
                            stroke={b.interiorId ? '#d9a14a' : '#435670'}
                            strokeWidth={b.interiorId ? '1.15' : '0.8'}
                          />
                          <line
                            x1={-w * 0.36}
                            y1="0"
                            x2={w * 0.36}
                            y2="0"
                            stroke={b.interiorId ? '#e5b363' : '#64748b'}
                            strokeOpacity="0.45"
                            strokeWidth="0.7"
                          />
                        </g>
                      );
                    })}

                    {/* Gateway Portal Marker */}
                    {(() => {
                      const gw = project(manifest.gatewayPortalPosition.x, manifest.gatewayPortalPosition.z);
                      return (
                        <g transform={`translate(${gw.cx}, ${gw.cy})`}>
                          <polygon points="0,-5 4.5,0 0,5 -4.5,0" fill="#58b4aa" stroke="#090e16" strokeWidth="1" />
                        </g>
                      );
                    })()}

                    {/* Landmarks with non-overlapping numbered cartographic markers */}
                    {manifest.landmarks.map((lm, idx) => {
                      const pt = project(lm.position.x, lm.position.z);
                      const found = runtime.discoveredLandmarks.has(lm.id);
                      return (
                        <g key={lm.id}>
                          <title>{lm.name}</title>
                          <circle
                            cx={pt.cx}
                            cy={pt.cy}
                            r="5.5"
                            fill={found ? '#58b4aa' : '#334155'}
                            stroke="#090e16"
                            strokeWidth="1.2"
                          />
                          <text
                            x={pt.cx}
                            y={pt.cy + 2.3}
                            textAnchor="middle"
                            fill={found ? '#090e16' : '#f3ede0'}
                            fontSize="6.8"
                            fontWeight="bold"
                            fontFamily="ui-monospace, monospace"
                          >
                            {idx + 1}
                          </text>
                        </g>
                      );
                    })}

                    {/* Active Residents */}
                    {npcs.map((n) => {
                      const pt = project(n.position.x, n.position.z);
                      return <circle key={n.id} cx={pt.cx} cy={pt.cy} r="2" fill="#f3ede0" opacity="0.78" />;
                    })}

                    {/* Player Direction Arrow (preserve g[transform] contract) */}
                    <g transform={`translate(${pProj.cx}, ${pProj.cy}) rotate(${(-playerYaw * 180) / Math.PI})`}>
                      <circle r="7.5" fill="#d9a14a" fillOpacity="0.18" />
                      <polygon points="0,-7.5 5,6 0,3 -5,6" fill="#d9a14a" stroke="#090e16" strokeWidth="1.1" />
                    </g>

                    {/* Cartographic Compass Rose (top-right) */}
                    <g transform={`translate(${SVG_SIZE - 26}, 26)`}>
                      <circle r="13" fill="#0b1522" fillOpacity="0.72" stroke="#d9a14a" strokeOpacity="0.38" strokeWidth="0.8" />
                      <polygon points="0,-10 2.5,-2 0,-4 -2.5,-2" fill="#d9a14a" />
                      <polygon points="0,10 2,2 0,4 -2,2" fill="#64748b" />
                      <text
                        x="0"
                        y="-14.5"
                        textAnchor="middle"
                        fill="#d9a14a"
                        fontSize="7.5"
                        fontWeight="bold"
                        fontFamily="Georgia, serif"
                      >
                        N
                      </text>
                    </g>

                    {/* Metric Scale Bar (bottom-left) */}
                    <g transform={`translate(14, ${SVG_SIZE - 16})`}>
                      <line x1="0" y1="0" x2={scale50Px} y2="0" stroke="#f3ede0" strokeWidth="1.4" />
                      <line x1="0" y1="-3" x2="0" y2="2" stroke="#f3ede0" strokeWidth="1.2" />
                      <line x1={scale50Px} y1="-3" x2={scale50Px} y2="2" stroke="#f3ede0" strokeWidth="1.2" />
                      <text x={scale50Px + 5} y="2" fill="#cbd5e1" fontSize="8" fontFamily="ui-monospace, monospace">
                        50m
                      </text>
                    </g>
                  </svg>
                </div>

                {/* Flat Key Legend */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[11px] text-[#cbd5e1]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#d9a14a]" /> Explorer
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#58b4aa]" /> Landmark
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[2px] border border-[#d9a14a] bg-[#3c4c63]" /> Interior
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rotate-45 bg-[#58b4aa]" /> Gateway
                  </span>
                </div>
              </div>

              {/* World Gateway Transit Ledger */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="flex items-baseline justify-between pb-2.5 border-b atlas-divider">
                  <h3 className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#d9a14a] font-semibold">
                    World Gateway Transit
                  </h3>
                  <span className="text-xs text-[#8fa0b3]">Direct passage to unlocked regions</span>
                </div>

                <div className="divide-y atlas-divider">
                  {ALL_REGION_IDS.map((id) => {
                    const m = getRegionManifest(id);
                    const unlocked = runtime.unlockedRegions.has(id);
                    const isCurrent = id === currentRegionId;
                    return (
                      <div
                        key={id}
                        className={`py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isCurrent ? 'border-l-2 border-l-[#d9a14a] bg-[#131e2d]/60' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h4 className="font-atlas-display text-[15px] font-semibold text-[#f3ede0]">{m.name}</h4>
                            <span className="text-[11px] text-[#58b4aa]">{m.subtitle}</span>
                            {isCurrent && (
                              <span className="font-atlas-mono text-[10px] uppercase tracking-wider text-[#d9a14a]">
                                · Current Station
                              </span>
                            )}
                            {!unlocked && !isCurrent && (
                              <span className="inline-flex items-center gap-1 font-atlas-mono text-[10px] text-[#8fa0b3]">
                                <Lock className="w-3 h-3" aria-hidden="true" /> Locked
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#cbd5e1] mt-1 leading-relaxed">{m.description}</p>
                          <p className="font-atlas-mono text-[11px] text-[#8fa0b3] mt-1">
                            {m.residents.length} Residents · {m.interiors.length} Interiors
                          </p>
                        </div>

                        <button
                          type="button"
                          data-testid={`travel-${id}`}
                          disabled={!unlocked || isCurrent}
                          onClick={() => {
                            onTravel(id);
                            onClose();
                          }}
                          className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[var(--atlas-radius-md)] text-xs font-semibold shrink-0 whitespace-nowrap ${
                            isCurrent
                              ? 'bg-[#131e2d] text-[#8fa0b3] cursor-default'
                              : unlocked
                                ? 'atlas-btn-primary cursor-pointer'
                                : 'bg-[#131e2d]/60 text-[#64748b] cursor-not-allowed'
                          }`}
                        >
                          <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isCurrent ? 'Present' : 'Travel'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'missions' && (
            <div className="divide-y atlas-divider">
              {missions.map(({ def, progress }) => {
                const isActive = progress.status === 'active';
                const isDone = progress.status === 'completed';
                const isLocked = progress.status === 'locked';
                return (
                  <article
                    key={def.id}
                    className={`py-4 px-3 flex flex-col gap-2.5 ${
                      isActive ? 'border-l-2 border-l-[#d9a14a] bg-[#131e2d]/55' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2.5 flex-wrap">
                        <span className="font-atlas-mono text-[10px] uppercase tracking-[0.14em] text-[#58b4aa]">
                          {getRegionManifest(def.regionId).name}
                        </span>
                        <h3 className="font-atlas-display text-base font-semibold text-[#f3ede0]">{def.title}</h3>
                      </div>
                      <span
                        className={`font-atlas-mono text-[11px] uppercase tracking-wider ${
                          isDone ? 'text-[#58b4aa]' : isActive ? 'text-[#d9a14a]' : 'text-[#8fa0b3]'
                        }`}
                      >
                        {progress.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#cbd5e1] max-w-prose leading-relaxed">{def.summary}</p>

                    <div className="flex flex-col gap-1.5 pl-1">
                      {def.objectives.map((obj, idx) => {
                        const completed = progress.completedObjectiveIds.includes(obj.id);
                        const current = isActive && idx === progress.currentObjectiveIndex;
                        return (
                          <div
                            key={obj.id}
                            className={`flex items-center gap-2 text-xs ${
                              completed
                                ? 'text-[#58b4aa] line-through opacity-75'
                                : current
                                  ? 'text-[#e5b363] font-medium'
                                  : 'text-[#8fa0b3]'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{obj.description}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <span className="text-[#8fa0b3]">
                        Reward: <span className="text-[#f3ede0]">{def.rewardLabel}</span>
                      </span>
                      {!isLocked && !isActive && (!isDone || def.repeatable) && (
                        <button
                          type="button"
                          onClick={() => {
                            runtime.missions.setActiveMission(def.id);
                            setVersion((v) => v + 1);
                          }}
                          className="atlas-btn-primary px-3 py-1.5 rounded-[var(--atlas-radius-md)] font-semibold cursor-pointer"
                        >
                          Track Mission
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {tab === 'residents' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 divide-y md:divide-y-0">
              {manifest.residents.map((res) => {
                const rel = runtime.relationships.get(res.id);
                const tier = runtime.relationships.getTierLabel(res.id);
                const simState = npcs.find((n) => n.id === res.id);
                return (
                  <div
                    key={res.id}
                    className="py-3.5 border-b atlas-divider flex flex-col gap-1"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="font-atlas-display text-[15px] font-semibold text-[#f3ede0]">{res.name}</h4>
                      <span className="font-atlas-mono text-[11px] text-[#d9a14a]">{tier}</span>
                    </div>
                    <p className="text-xs text-[#58b4aa]">{res.occupation}</p>
                    <p className="text-xs text-[#cbd5e1] line-clamp-2 leading-relaxed">{res.bio}</p>
                    <div className="mt-1 flex items-center justify-between font-atlas-mono text-[11px] text-[#8fa0b3]">
                      <span className="capitalize">Activity: {simState?.behavior.replace('_', ' ') ?? 'idle'}</span>
                      <span>Trust {Math.round(rel.trust)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'photos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#d9a14a] pb-2 border-b atlas-divider mb-2">
                  Surveyed Landmarks ({runtime.discoveredLandmarks.size})
                </h3>
                <div className="divide-y atlas-divider">
                  {manifest.landmarks.map((lm) => {
                    const found = runtime.discoveredLandmarks.has(lm.id);
                    return (
                      <div key={lm.id} className="py-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-atlas-display text-sm font-medium text-[#f3ede0]">{lm.name}</p>
                          <p className="text-xs text-[#8fa0b3] mt-0.5 leading-relaxed">{lm.description}</p>
                        </div>
                        <span
                          className={`font-atlas-mono text-[11px] shrink-0 ${
                            found ? 'text-[#58b4aa]' : 'text-[#64748b]'
                          }`}
                        >
                          {found ? 'Visited' : 'Uncharted'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-atlas-mono text-xs uppercase tracking-[0.16em] text-[#d9a14a] pb-2 border-b atlas-divider mb-2">
                  Field Photography Log ({runtime.photos.length})
                </h3>
                {runtime.photos.length === 0 ? (
                  <p className="text-xs text-[#cbd5e1] leading-relaxed py-3">
                    Open Observer / Photo Mode with <kbd className="font-atlas-mono text-[#d9a14a]">[O]</kbd> and press{' '}
                    <kbd className="font-atlas-mono text-[#d9a14a]">[Space]</kbd> near coastal landmarks to record plates in your field log.
                  </p>
                ) : (
                  <div className="divide-y atlas-divider">
                    {runtime.photos.map((ph) => (
                      <div key={ph.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-atlas-display text-sm font-semibold text-[#f3ede0]">{ph.landmarkName}</p>
                          <p className="text-[#8fa0b3] mt-0.5">
                            {getRegionManifest(ph.regionId).name} · Weather: <span className="capitalize">{ph.weather}</span>
                          </p>
                        </div>
                        <Camera className="w-4 h-4 text-[#d9a14a] shrink-0" aria-hidden="true" />
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
