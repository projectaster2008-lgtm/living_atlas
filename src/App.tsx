import { useCallback, useEffect, useRef, useState } from 'react';
import { ActiveDialogueSession, GameRuntime } from './app/GameRuntime';
import { DialogueModal } from './app/DialogueModal';
import { HudOverlay } from './app/HudOverlay';
import { MapJournalModal } from './app/MapJournalModal';
import { ObserverOverlay } from './app/ObserverOverlay';
import { PauseSettingsModal } from './app/PauseSettingsModal';
import { TitleScreen } from './app/TitleScreen';
import { TransitionOverlay } from './app/TransitionOverlay';
import { importSaveFromJson } from './persistence/ExportImport';
import { DEFAULT_SETTINGS, IndexedDbStore } from './persistence/IndexedDbStore';
import {
  DiagnosticsSnapshot,
  GameShellState,
  HudViewModel,
  SaveGameV1,
} from './shared/types/world';

const INITIAL_HUD: HudViewModel = {
  regionId: 'solara-bay',
  regionName: 'Solara Bay',
  interiorName: null,
  timeFormatted: '09:30',
  dayCount: 1,
  dayPhaseLabel: 'Morning',
  weather: 'clear',
  cameraMode: 'third-person',
  timeScale: 1,
  simPaused: false,
  activeMissionTitle: null,
  activeObjectiveText: null,
  activeEventName: null,
  interactionPrompt: null,
  vehicleHud: null,
  discoveredCount: 1,
  totalLandmarks: 15,
  notificationBanner: null,
};

const INITIAL_DIAG: DiagnosticsSnapshot = {
  fps: 60,
  frameTimeMs: 16.6,
  simTimeMs: 1,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  isSoftwareGl: false,
  activeQuality: 'medium',
  activeRegionId: 'solara-bay',
  nearNpcCount: 0,
  districtNpcCount: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);

  const [shellState, setShellState] = useState<GameShellState>('title');
  const [hud, setHud] = useState<HudViewModel>(INITIAL_HUD);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot>(INITIAL_DIAG);
  const [dialogue, setDialogue] = useState<ActiveDialogueSession | null>(null);
  const [mapJournalOpen, setMapJournalOpen] = useState(false);
  const [mapInitialTab, setMapInitialTab] = useState<'map' | 'missions' | 'residents' | 'photos'>('map');
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [latestSave, setLatestSave] = useState<SaveGameV1 | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    let cancelled = false;

    const boot = async () => {
      const [settings, saved] = await Promise.all([
        IndexedDbStore.loadSettings(),
        IndexedDbStore.loadLatestSave(),
      ]);
      if (cancelled) return;

      setLatestSave(saved);
      setMuted(settings.muted);

      const rt = new GameRuntime(
        mount,
        {
          onHudUpdate: (vm) => setHud(vm),
          onDiagnosticsUpdate: (diag) => setDiagnostics(diag),
          onShellStateChange: (next) => {
            setShellState(next);
            if (next !== 'playing') {
              setMapJournalOpen(false);
            }
          },
          onDialogueChange: (session) => setDialogue(session),
          onOpenGatewayModal: () => {
            setMapInitialTab('map');
            setMapJournalOpen(true);
            rt.input.enabled = false;
          },
          onOpenMapJournal: () => {
            setMapInitialTab('map');
            setMapJournalOpen((open) => {
              const next = !open;
              rt.input.enabled = !next && !rt.activeDialogue && rt.shellState === 'playing';
              return next;
            });
          },
          onTransitionState: (lbl) => setTransitionLabel(lbl),
        },
        settings ?? DEFAULT_SETTINGS,
      );

      runtimeRef.current = rt;

      // Headless / quick launch parameter support
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        if (saved && params.get('new') !== '1') {
          rt.resumeFromSave(saved);
        } else {
          rt.startNewGame();
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  // Refresh latestSave whenever returning to title
  useEffect(() => {
    if (shellState === 'title') {
      void IndexedDbStore.loadLatestSave().then((s) => setLatestSave(s));
    }
  }, [shellState]);

  const handleCloseMapJournal = useCallback(() => {
    setMapJournalOpen(false);
    const rt = runtimeRef.current;
    if (rt) {
      rt.input.clearAll();
      rt.input.enabled = rt.shellState === 'playing' && !rt.activeDialogue;
    }
  }, []);

  const handleImportSaveJson = useCallback(async (jsonText: string) => {
    const res = importSaveFromJson(jsonText);
    if (!res.ok) return res;
    await IndexedDbStore.saveSlot(res.data);
    setLatestSave(res.data);
    runtimeRef.current?.resumeFromSave(res.data);
    return { ok: true };
  }, []);

  const runtime = runtimeRef.current;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0c121b]">
      {/* Isolated imperative WebGL canvas mount (React never renders inside this node) */}
      <div
        ref={canvasMountRef}
        data-testid="world-canvas-container"
        className="fixed inset-0 w-full h-full"
      />

      {shellState === 'title' && (
        <TitleScreen
          latestSave={latestSave}
          onStartNew={() => runtimeRef.current?.startNewGame()}
          onContinueSave={(save) => runtimeRef.current?.resumeFromSave(save)}
          onImportSaveJson={handleImportSaveJson}
        />
      )}

      {shellState === 'playing' && runtime && (
        <>
          <HudOverlay
            hud={hud}
            muted={muted}
            onToggleMute={() => {
              const next = !muted;
              setMuted(next);
              runtime.setMuted(next);
            }}
            onToggleObserver={() => runtime.toggleObserverMode()}
            onOpenMapJournal={() => {
              setMapInitialTab('map');
              setMapJournalOpen(true);
              runtime.input.enabled = false;
            }}
            onPause={() => runtime.setShellState('paused')}
            onInteract={(prompt) => runtime.executeInteraction(prompt)}
          />

          {hud.cameraMode === 'observer' && !dialogue && !mapJournalOpen && (
            <ObserverOverlay
              timeFormatted={hud.timeFormatted}
              timeScale={hud.timeScale}
              simPaused={hud.simPaused}
              weather={hud.weather}
              photoCount={runtime.photos.length}
              onSetTimeScale={(s, p) => runtime.setTimeScale(s, p)}
              onSetWeather={(w) => runtime.setWeatherOverride(w)}
              onCapturePhoto={() => runtime.capturePhoto()}
              onExit={() => runtime.toggleObserverMode()}
            />
          )}

          {dialogue && (
            <DialogueModal
              session={dialogue}
              onSelectChoice={(choice) => runtime.chooseDialogueOption(choice)}
              onClose={() => runtime.closeDialogue()}
            />
          )}

          {mapJournalOpen && (
            <MapJournalModal
              runtime={runtime}
              initialTab={mapInitialTab}
              onTravel={(id) => runtime.travelToRegion(id)}
              onClose={handleCloseMapJournal}
            />
          )}
        </>
      )}

      {shellState === 'paused' && runtime && (
        <PauseSettingsModal
          runtime={runtime}
          diagnostics={diagnostics}
          onResume={() => runtime.setShellState('playing')}
          onReturnToTitle={() => runtime.setShellState('title')}
          onImportSaveJson={handleImportSaveJson}
        />
      )}

      <TransitionOverlay label={transitionLabel} />
    </div>
  );
}
