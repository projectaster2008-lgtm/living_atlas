import * as THREE from 'three';
import {
  buildActorRig,
  buildVehicleMesh,
  ActorRigParts,
  VehicleMeshParts,
} from '../engine/builders/CompositeBuilders';
import {
  buildInteriorScene,
  buildRegionScene,
  BuiltRegionScene,
} from '../engine/builders/RegionSceneBuilder';
import { AmbientAudio } from '../engine/audio/AmbientAudio';
import { CameraRig } from '../engine/camera/CameraRig';
import { DiagnosticsTracker } from '../engine/core/Diagnostics';
import { EngineContext } from '../engine/core/EngineContext';
import { ResourceRegistry } from '../engine/core/ResourceRegistry';
import { AtmosphereRig } from '../engine/lighting/AtmosphereRig';
import { MaterialLibrary } from '../engine/materials/MaterialLibrary';
import { InputHub } from '../gameplay/input/InputHub';
import { resolveInteractionPrompt } from '../gameplay/interactions/InteractionSystem';
import {
  buildBuildingColliders,
  ColliderBox,
  PlayerController,
} from '../gameplay/player/PlayerController';
import { VehicleSystem } from '../gameplay/vehicles/VehicleSystem';
import { DEFAULT_SETTINGS, IndexedDbStore } from '../persistence/IndexedDbStore';
import { EventBus, WorldEvents } from '../shared/events/EventBus';
import { clamp, dist2D } from '../shared/math/prng';
import {
  ActiveInteractionPrompt,
  CameraMode,
  DiagnosticsSnapshot,
  DialogueChoice,
  DialogueNode,
  GameShellState,
  HudViewModel,
  NpcProfile,
  PhotoRecord,
  QualityTier,
  RegionId,
  SaveGameV1,
  SettingsState,
  WeatherKind,
} from '../shared/types/world';
import { WorldClock } from '../simulation/clock/WorldClock';
import { DynamicEvents } from '../simulation/events/DynamicEvents';
import { MissionSystem } from '../simulation/missions/MissionSystem';
import { DialogueEngine } from '../simulation/npcs/DialogueEngine';
import { NpcSimulation } from '../simulation/npcs/NpcSimulation';
import { RelationshipModel } from '../simulation/npcs/RelationshipModel';
import { TrafficSystem } from '../simulation/traffic/TrafficSystem';
import { WeatherSystem } from '../simulation/weather/WeatherSystem';
import { ALL_REGION_IDS, getRegionManifest } from '../worlds/WorldCatalog';

export interface ActiveDialogueSession {
  npc: NpcProfile;
  node: DialogueNode;
  relationshipTier: string;
  familiarity: number;
  trust: number;
  friendship: number;
  respect: number;
  replyText: string | null;
}

export interface UiCallbacks {
  onHudUpdate: (vm: HudViewModel) => void;
  onDiagnosticsUpdate: (diag: DiagnosticsSnapshot) => void;
  onShellStateChange: (state: GameShellState) => void;
  onDialogueChange: (session: ActiveDialogueSession | null) => void;
  onOpenGatewayModal: () => void;
  onOpenMapJournal: () => void;
  onTransitionState: (label: string | null) => void;
}

export class GameRuntime {
  public readonly events = new EventBus<WorldEvents>();
  public readonly input = new InputHub();
  public readonly clock = new WorldClock(9.5 * 3600, 1);
  public readonly weather: WeatherSystem;
  public readonly npcSim: NpcSimulation;
  public readonly relationships = new RelationshipModel();
  public readonly dialogueEngine = new DialogueEngine();
  public readonly traffic: TrafficSystem;
  public readonly dynamicEvents = new DynamicEvents();
  public readonly missions = new MissionSystem();
  public readonly playerCtrl = new PlayerController();
  public readonly vehicles = new VehicleSystem();
  public readonly audio = new AmbientAudio();
  public readonly cameraRig = new CameraRig();
  public readonly diagnostics = new DiagnosticsTracker();

  private readonly worldSeed = 104729;
  private registry = new ResourceRegistry();
  private engine: EngineContext;
  private mats: MaterialLibrary;
  private atmosphere: AtmosphereRig;
  private callbacks: UiCallbacks;

  public shellState: GameShellState = 'title';
  public settings: SettingsState = { ...DEFAULT_SETTINGS };
  public unlockedRegions = new Set<RegionId>([
    'gateway',
    'solara-bay',
    'vesper-city',
    'verdant-highlands',
    'aether-district',
  ]);
  public discoveredLandmarks = new Set<string>(['sb-plaza']);
  public collectedIds = new Set<string>();
  public worldFlags = new Set<string>();
  public photos: PhotoRecord[] = [];
  public activeDialogue: ActiveDialogueSession | null = null;

  private currentRegionId: RegionId = 'solara-bay';
  private activeInteriorId: string | null = null;
  private regionBuilt: BuiltRegionScene | null = null;
  private interiorGroup: THREE.Group | null = null;
  private playerRig: ActorRigParts | null = null;
  private npcRigs = new Map<string, ActorRigParts>();
  private vehicleRigs = new Map<string, VehicleMeshParts>();
  private trafficRigs = new Map<string, VehicleMeshParts>();
  private colliders: ColliderBox[] = [];

  private hudEmitTimer = 0;
  private autosaveTimer = 0;
  private notificationBanner: string | null = null;
  private notificationTimer = 0;
  private lastPromptKey = '';
  private currentPrompt: ActiveInteractionPrompt | null = null;
  private disposed = false;

  constructor(canvasContainer: HTMLElement, callbacks: UiCallbacks, initialSettings: SettingsState) {
    this.callbacks = callbacks;
    this.settings = { ...initialSettings };

    this.weather = new WeatherSystem(this.worldSeed);
    this.npcSim = new NpcSimulation(this.worldSeed);
    this.traffic = new TrafficSystem(this.worldSeed);

    // Register all world manifests into simulation subsystems
    for (const id of ALL_REGION_IDS) {
      const m = getRegionManifest(id);
      this.weather.registerRegion(id, m.weatherWeights, {
        current: 'clear',
        next: 'clear',
        progress: 1,
        durationSec: 220,
      });
      this.npcSim.registerRegion(m, this.clock.totalSeconds);
      this.dynamicEvents.registerRegion(id, m.events);
      this.missions.registerMissions(m.missions);
      this.vehicles.registerRegion(m);
    }

    this.engine = new EngineContext(canvasContainer, this.settings.quality);
    this.mats = new MaterialLibrary(this.registry, this.engine.renderer);
    this.atmosphere = new AtmosphereRig(this.engine.scene, this.engine.isSoftwareGl);
    this.input.attach(this.engine.renderer.domElement);
    this.audio.setVolume(this.settings.masterVolume, this.settings.muted);

    this.loadRegion('solara-bay', true);
    this.engine.startLoop((dt) => this.tick(dt));
  }

  public startNewGame(): void {
    this.audio.unlockAndStart();
    this.clock.totalSeconds = 9.5 * 3600;
    this.clock.paused = false;
    this.clock.timeScale = 1;
    this.discoveredLandmarks = new Set(['sb-plaza']);
    this.collectedIds.clear();
    this.worldFlags.clear();
    this.photos = [];
    this.relationships.load({});
    this.dialogueEngine.load({}, {});
    for (const id of ALL_REGION_IDS) {
      const m = getRegionManifest(id);
      this.vehicles.registerRegion(m);
    }
    this.playerCtrl.state.mode = 'foot';
    this.playerCtrl.state.activeVehicleId = null;
    this.activeInteriorId = null;
    this.loadRegion('solara-bay', false);
    this.setShellState('playing');
    this.notify('Welcome to Solara Bay — Talk to Elena Vance near Central Plaza');
    this.emitHud();
  }

  public resumeFromSave(save: SaveGameV1): void {
    this.audio.unlockAndStart();
    this.clock.totalSeconds = save.worldClockSeconds;
    this.clock.paused = false;
    this.clock.timeScale = 1;
    this.unlockedRegions = new Set(save.unlockedRegions);
    this.discoveredLandmarks = new Set(save.discoveredLandmarks);
    this.collectedIds = new Set(save.collectedIds);
    this.worldFlags = new Set(save.worldFlags);
    this.photos = [...save.photos];
    this.relationships.load(save.relationships);
    this.dialogueEngine.load(save.npcDialogueCooldowns, save.recentDialogueIds);
    this.missions.loadProgress(save.missions);
    this.vehicles.loadSavedStates(save.vehicleStates);
    for (const rId of ALL_REGION_IDS) {
      const ws = save.weatherByRegion[rId];
      if (ws) {
        this.weather.setState(rId, { ...ws, elapsedSec: 0 });
      }
    }

    this.playerCtrl.state.exteriorReturnPosition = { ...save.exteriorReturnPosition };
    this.playerCtrl.state.exteriorReturnYaw = save.exteriorReturnYaw;
    this.loadRegion(save.currentRegionId, false, {
      position: save.playerPosition,
      yaw: save.playerYaw,
      interiorId: save.activeInteriorId,
      vehicleId: save.activeVehicleId,
    });
    this.setShellState('playing');
    this.notify(`Resumed in ${getRegionManifest(save.currentRegionId).name}`);
    this.emitHud();
  }

  public setShellState(next: GameShellState): void {
    this.shellState = next;
    document.body.dataset.state = next;
    if (next !== 'playing' && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    if (next === 'playing') {
      this.input.clearAll();
      this.input.enabled = !this.activeDialogue;
    } else {
      this.input.clearAll();
      this.input.enabled = false;
    }
    this.callbacks.onShellStateChange(next);
  }

  public travelToRegion(targetRegion: RegionId): void {
    if (targetRegion === this.currentRegionId && !this.activeInteriorId) return;
    this.callbacks.onTransitionState(`Traveling to ${getRegionManifest(targetRegion).name}...`);
    this.events.emit('region:changing', { from: this.currentRegionId, to: targetRegion });

    if (this.playerCtrl.state.mode === 'vehicle' && this.playerCtrl.state.activeVehicleId) {
      const veh = this.vehicles.getVehicleById(this.playerCtrl.state.activeVehicleId);
      if (veh) veh.occupiedByPlayer = false;
      this.playerCtrl.state.mode = 'foot';
      this.playerCtrl.state.activeVehicleId = null;
    }

    this.activeInteriorId = null;
    this.loadRegion(targetRegion, false);
    this.cameraRig.mode = 'third-person';
    this.notify(`Arrived in ${getRegionManifest(targetRegion).name}`);
    void this.saveToSlot('autosave', 'Autosave');
    window.setTimeout(() => {
      if (!this.disposed) this.callbacks.onTransitionState(null);
    }, 220);
  }

  private loadRegion(
    regionId: RegionId,
    isBoot: boolean,
    restore?: {
      position: { x: number; y: number; z: number };
      yaw: number;
      interiorId: string | null;
      vehicleId: string | null;
    },
  ): void {
    const prevScope = `region:${this.currentRegionId}`;
    this.unloadCurrentScene(prevScope);

    this.currentRegionId = regionId;
    const manifest = getRegionManifest(regionId);
    const scope = `region:${regionId}`;

    this.npcSim.deactivateRegion(this.currentRegionId, this.clock.totalSeconds);
    const atm = this.weather.getAtmosphere(regionId);
    this.npcSim.activateRegion(regionId, this.clock.totalSeconds, this.clock.getHourOfDay(), atm.activeWeather);
    this.traffic.loadRegion(manifest, this.engine.activeQuality === 'low' ? 4 : 8);
    this.playerCtrl.configureRegion(manifest);
    this.colliders = buildBuildingColliders(manifest.buildings);

    this.playerCtrl.state.regionId = regionId;
    this.playerCtrl.state.interiorId = null;
    this.playerCtrl.state.position = restore
      ? { ...restore.position }
      : { ...manifest.arrivalSpawn };
    this.playerCtrl.state.yaw = restore ? restore.yaw : manifest.arrivalYaw;
    this.playerCtrl.state.velocity = { x: 0, y: 0, z: 0 };

    if (restore?.vehicleId) {
      const veh = this.vehicles.getVehicleById(restore.vehicleId);
      if (veh && veh.regionId === regionId) {
        this.playerCtrl.state.mode = 'vehicle';
        this.playerCtrl.state.activeVehicleId = veh.id;
        veh.occupiedByPlayer = true;
      }
    }

    this.regionBuilt = buildRegionScene(manifest, this.mats, this.registry, scope);
    for (const colId of this.collectedIds) {
      const mesh = this.regionBuilt.collectibleMeshes.get(colId);
      if (mesh) mesh.visible = false;
    }
    this.engine.scene.add(this.regionBuilt.group);

    // Build Player Avatar
    this.playerRig = buildActorRig(
      {
        coatColor: '#2d6a7a',
        accentColor: '#e0a952',
        pantsColor: '#232b36',
        skinTone: '#e8b996',
        hairColor: '#2c221d',
        heightScale: 1.0,
        hatStyle: 'none',
      },
      this.mats,
      this.registry,
      scope,
      true,
    );
    this.engine.scene.add(this.playerRig.root);

    // Build NPC Rigs
    for (const profile of manifest.residents) {
      const rig = buildActorRig(profile.appearance, this.mats, this.registry, scope, false);
      this.npcRigs.set(profile.id, rig);
      this.engine.scene.add(rig.root);
    }

    // Build Drivable Vehicle Rigs
    for (const vState of this.vehicles.getRegionVehicles(regionId)) {
      const spec = this.vehicles.getSpec(vState.specId);
      if (!spec) continue;
      const vRig = buildVehicleMesh(spec.kind, spec.primaryColor, this.mats, this.registry, scope);
      this.vehicleRigs.set(vState.id, vRig);
      this.engine.scene.add(vRig.root);
    }

    // Build Traffic Vehicle Rigs
    for (const tv of this.traffic.getVehicles()) {
      const tvRig = buildVehicleMesh(tv.kind, tv.color, this.mats, this.registry, scope);
      this.trafficRigs.set(tv.id, tvRig);
      this.engine.scene.add(tvRig.root);
    }

    if (restore?.interiorId) {
      this.enterInterior(restore.interiorId, true);
    } else {
      this.cameraRig.snapToTarget(this.playerCtrl.state.position, this.playerCtrl.state.yaw);
    }

    if (!isBoot) {
      this.engine.prewarmShaders();
    }
    this.events.emit('region:changed', { regionId });
  }

  private unloadCurrentScene(scope: string): void {
    if (this.interiorGroup) {
      this.engine.scene.remove(this.interiorGroup);
      this.interiorGroup = null;
      this.registry.disposeScope('interior');
      this.mats.clearScopeCache('interior');
    }
    if (this.regionBuilt) {
      this.engine.scene.remove(this.regionBuilt.group);
      this.regionBuilt = null;
    }
    if (this.playerRig) {
      this.engine.scene.remove(this.playerRig.root);
      this.playerRig = null;
    }
    for (const rig of this.npcRigs.values()) this.engine.scene.remove(rig.root);
    this.npcRigs.clear();
    for (const rig of this.vehicleRigs.values()) this.engine.scene.remove(rig.root);
    this.vehicleRigs.clear();
    for (const rig of this.trafficRigs.values()) this.engine.scene.remove(rig.root);
    this.trafficRigs.clear();

    this.registry.disposeScope(scope);
    this.mats.clearScopeCache(scope);
  }

  private enterInterior(interiorId: string, silent = false): void {
    const manifest = getRegionManifest(this.currentRegionId);
    const interior = manifest.interiors.find((i) => i.id === interiorId);
    if (!interior) return;

    if (!silent) {
      this.playerCtrl.state.exteriorReturnPosition = { ...this.playerCtrl.state.position };
      this.playerCtrl.state.exteriorReturnYaw = this.playerCtrl.state.yaw;
    }

    this.activeInteriorId = interiorId;
    this.playerCtrl.state.interiorId = interiorId;
    this.playerCtrl.state.position = { ...interior.spawnLocal };
    this.playerCtrl.state.yaw = Math.PI;

    if (this.regionBuilt) this.regionBuilt.group.visible = false;
    for (const vRig of this.vehicleRigs.values()) vRig.root.visible = false;
    for (const tRig of this.trafficRigs.values()) tRig.root.visible = false;

    this.interiorGroup = buildInteriorScene(interior, this.mats, this.registry, 'interior');
    this.engine.scene.add(this.interiorGroup);
    this.cameraRig.snapToTarget(this.playerCtrl.state.position, this.playerCtrl.state.yaw);

    const completion = this.missions.notifyAction('enter_interior', interiorId, this.currentRegionId);
    this.handleMissionCompletion(completion);
    if (!silent) {
      this.audio.playChime('interact');
      this.notify(`Entered ${interior.name}`);
    }
    this.events.emit('interior:entered', { interiorId, name: interior.name });
  }

  private exitInterior(): void {
    if (!this.activeInteriorId) return;
    if (this.interiorGroup) {
      this.engine.scene.remove(this.interiorGroup);
      this.interiorGroup = null;
      this.registry.disposeScope('interior');
      this.mats.clearScopeCache('interior');
    }
    this.activeInteriorId = null;
    this.playerCtrl.state.interiorId = null;
    this.playerCtrl.state.position = { ...this.playerCtrl.state.exteriorReturnPosition };
    this.playerCtrl.state.yaw = this.playerCtrl.state.exteriorReturnYaw;

    if (this.regionBuilt) this.regionBuilt.group.visible = true;
    for (const vRig of this.vehicleRigs.values()) vRig.root.visible = true;
    for (const tRig of this.trafficRigs.values()) tRig.root.visible = true;
    this.cameraRig.snapToTarget(this.playerCtrl.state.position, this.playerCtrl.state.yaw);

    this.audio.playChime('interact');
    this.events.emit('interior:exited', { regionId: this.currentRegionId });
  }

  private tick(rawDt: number): void {
    if (this.disposed) return;
    const frameStart = performance.now();
    const manifest = getRegionManifest(this.currentRegionId);

    if (this.shellState === 'title') {
      this.clock.step(rawDt * 0.5);
      const sun = this.clock.getSunState();
      const atm = this.weather.getAtmosphere(this.currentRegionId);
      this.atmosphere.update(rawDt, { x: 0, y: 0, z: -16 }, sun, atm, manifest, this.engine.activeQuality, false);
      if (this.regionBuilt?.waterMaterial) {
        this.regionBuilt.waterMaterial.userData.uTime.value += rawDt;
      }
      this.cameraRig.updateTitleFlyover(this.engine.camera, rawDt);
      this.animateSceneProps(rawDt);
      this.input.endFrame();
      return;
    }

    if (this.shellState === 'paused') {
      this.input.endFrame();
      return;
    }

    // Handle edge-triggered hotkeys in Playing state
    if (this.input.consumeJustPressed('Escape') || this.input.consumeJustPressed('KeyP')) {
      if (this.activeDialogue) {
        this.closeDialogue();
      } else {
        this.setShellState('paused');
        return;
      }
    }
    if (!this.activeDialogue) {
      if (this.input.consumeJustPressed('KeyJ')) {
        this.callbacks.onOpenMapJournal();
      }
      if (this.input.consumeJustPressed('KeyO')) {
        this.toggleObserverMode();
      }
      if (this.input.consumeJustPressed('KeyM')) {
        this.setMuted(!this.settings.muted);
      }
      if (this.input.consumeJustPressed('KeyV')) {
        if (this.cameraRig.mode === 'third-person') this.cameraRig.mode = 'shoulder';
        else if (this.cameraRig.mode === 'shoulder') this.cameraRig.mode = 'third-person';
      }
    }

    const simStart = performance.now();
    const simDt = this.clock.paused ? 0 : rawDt * this.clock.timeScale;

    if (simDt > 0) {
      this.clock.step(rawDt);
      const weatherChanged = this.weather.step(simDt, this.currentRegionId);
      if (weatherChanged) {
        this.events.emit('weather:changed', { regionId: this.currentRegionId, weather: weatherChanged });
      }
    }

    const sun = this.clock.getSunState();
    const atm = this.weather.getAtmosphere(this.currentRegionId);
    const activeEvent = this.dynamicEvents.getActiveEvent(
      this.currentRegionId,
      this.clock.getHourOfDay(),
      atm.activeWeather,
    );

    const activeInterior = this.activeInteriorId
      ? manifest.interiors.find((i) => i.id === this.activeInteriorId) ?? null
      : null;

    // Player & Vehicle stepping (still works when Observer isn't locking foot controls)
    let drivingSpeedKmh: number | null = null;
    if (!this.activeDialogue && this.cameraRig.mode !== 'observer') {
      if (this.playerCtrl.state.mode === 'vehicle' && this.playerCtrl.state.activeVehicleId) {
        const res = this.vehicles.stepActiveVehicle(
          rawDt,
          this.playerCtrl.state.activeVehicleId,
          this.input,
          manifest,
        );
        const veh = this.vehicles.getVehicleById(this.playerCtrl.state.activeVehicleId);
        if (veh) {
          this.playerCtrl.state.position = { ...veh.position };
          this.playerCtrl.state.yaw = veh.yaw;
          drivingSpeedKmh = res.speedKmh;
        }
      } else {
        const { steppedFoot } = this.playerCtrl.step(
          rawDt,
          this.input,
          this.cameraRig.yaw,
          manifest,
          activeInterior,
        );
        if (steppedFoot) this.audio.playFootstep();
      }
    }

    // NPC & Traffic Simulation
    if (simDt > 0) {
      this.npcSim.step(
        this.currentRegionId,
        this.playerCtrl.state.position,
        simDt,
        this.clock.getHourOfDay(),
        atm.activeWeather,
        activeEvent,
      );
      if (!activeInterior) {
        this.traffic.step(simDt, this.playerCtrl.state.position, atm.activeWeather);
      }
    }

    // Landmark discovery & proximity missions
    if (!activeInterior) {
      for (const lm of manifest.landmarks) {
        if (!this.discoveredLandmarks.has(lm.id)) {
          const d = dist2D(
            this.playerCtrl.state.position.x,
            this.playerCtrl.state.position.z,
            lm.position.x,
            lm.position.z,
          );
          if (d <= lm.radius) {
            this.discoveredLandmarks.add(lm.id);
            this.audio.playChime('interact');
            this.notify(`Discovered ${lm.name}`);
            this.events.emit('landmark:discovered', { landmarkId: lm.id, name: lm.name });
          }
        }
      }
      const proxMission = this.missions.checkProximityObjectives(
        this.currentRegionId,
        this.playerCtrl.state.position,
      );
      this.handleMissionCompletion(proxMission);
    }

    // Interaction prompt & [E] trigger
    const npcs = this.npcSim.getActiveRegionNpcs(this.currentRegionId);
    this.currentPrompt = this.activeDialogue
      ? null
      : resolveInteractionPrompt(
          this.playerCtrl.state,
          manifest,
          activeInterior,
          npcs,
          (id) => this.npcSim.getProfile(id),
          this.vehicles,
          this.collectedIds,
        );

    if (
      !this.activeDialogue &&
      this.cameraRig.mode !== 'observer' &&
      this.input.consumeJustPressed('KeyE') &&
      this.currentPrompt
    ) {
      this.executeInteraction(this.currentPrompt);
    }

    if (this.cameraRig.mode === 'observer' && this.input.consumeJustPressed('Space')) {
      this.capturePhoto();
    }

    // Sync Visual Transforms
    this.syncVisuals(rawDt, activeInterior !== null);

    // Update Camera, Atmosphere & Audio
    this.cameraRig.updateGameplay(
      this.engine.camera,
      rawDt,
      this.playerCtrl.state.position,
      this.playerCtrl.state.yaw,
      this.playerCtrl.state.mode === 'vehicle',
      activeInterior !== null,
      this.input,
      this.settings.mouseSensitivity,
      this.colliders,
    );

    this.atmosphere.update(
      rawDt,
      this.playerCtrl.state.position,
      sun,
      atm,
      manifest,
      this.engine.activeQuality,
      activeInterior !== null,
    );
    this.audio.updateAtmosphere(this.currentRegionId, atm.activeWeather, drivingSpeedKmh);

    if (this.regionBuilt?.waterMaterial) {
      this.regionBuilt.waterMaterial.userData.uTime.value += rawDt;
    }
    this.animateSceneProps(rawDt);

    // Timers & Throttled HUD emission
    if (this.notificationTimer > 0) {
      this.notificationTimer = Math.max(0, this.notificationTimer - rawDt);
      if (this.notificationTimer === 0) this.notificationBanner = null;
    }

    this.autosaveTimer += rawDt;
    if (this.autosaveTimer >= 45) {
      this.autosaveTimer = 0;
      void this.saveToSlot('autosave', 'Autosave');
    }

    const simMs = performance.now() - simStart;
    const frameMs = performance.now() - frameStart;
    this.diagnostics.recordFrame(frameMs, simMs);

    const promptKey = this.currentPrompt ? `${this.currentPrompt.kind}:${this.currentPrompt.targetId}` : '';
    this.hudEmitTimer += rawDt;
    if (this.hudEmitTimer >= 0.14 || promptKey !== this.lastPromptKey) {
      this.lastPromptKey = promptKey;
      this.hudEmitTimer = 0;
      this.emitHud(drivingSpeedKmh);
    }

    this.input.endFrame();
  }

  private animateSceneProps(dt: number): void {
    if (!this.regionBuilt) return;
    for (const part of this.regionBuilt.animatedParts) {
      if (part.axis === 'y') part.object.rotation.y += part.speed * dt;
      else part.object.rotation.z += part.speed * dt;
    }
    for (const [sigId, mat] of this.regionBuilt.signalLights.entries()) {
      const col = this.traffic.getSignalColor(sigId);
      const hex = col === 'green' ? 0x22c55e : col === 'amber' ? 0xf59e0b : 0xef4444;
      mat.color.setHex(hex);
      mat.emissive.setHex(hex);
    }
  }

  private syncVisuals(dt: number, isInterior: boolean): void {
    // Player
    if (this.playerRig) {
      const p = this.playerCtrl.state;
      this.playerRig.root.visible = p.mode === 'foot';
      this.playerRig.root.position.set(p.position.x, p.position.y, p.position.z);
      this.playerRig.root.rotation.y = p.yaw;
      this.playerRig.bodyGroup.scale.set(1 / Math.sqrt(p.squashY), p.squashY, 1 / Math.sqrt(p.squashY));
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      const swing = speed > 0.35 ? Math.sin(p.gaitPhase) * 0.58 : 0;
      this.playerRig.leftLeg.rotation.x = swing;
      this.playerRig.rightLeg.rotation.x = -swing;
      this.playerRig.leftArm.rotation.x = -swing * 0.75;
      this.playerRig.rightArm.rotation.x = swing * 0.75;
    }

    // NPCs
    const npcs = this.npcSim.getActiveRegionNpcs(this.currentRegionId);
    for (const npc of npcs) {
      const rig = this.npcRigs.get(npc.id);
      if (!rig) continue;

      if (isInterior) {
        const manifest = getRegionManifest(this.currentRegionId);
        const intDef = manifest.interiors.find((i) => i.id === this.activeInteriorId);
        const insideThis = intDef && npc.targetLocationId === intDef.entryBuildingId;
        rig.root.visible = Boolean(insideThis);
        if (insideThis) {
          rig.root.position.set(0, 0, -2.6);
          rig.root.rotation.y = 0;
          rig.leftLeg.rotation.x = 0;
          rig.rightLeg.rotation.x = 0;
        }
        continue;
      }

      if (npc.tier === 'offscreen' || npc.tier === 'inactive') {
        rig.root.visible = false;
        continue;
      }

      rig.root.visible = true;
      rig.root.position.set(npc.position.x, npc.position.y, npc.position.z);
      rig.root.rotation.y = npc.yaw;

      if (npc.tier === 'near') {
        const swing = npc.speed > 0.2 ? Math.sin(npc.gaitPhase) * 0.55 : 0;
        rig.leftLeg.rotation.x = swing;
        rig.rightLeg.rotation.x = -swing;
        rig.leftArm.rotation.x =
          npc.behavior === 'talk_npc' || npc.behavior === 'talk_player'
            ? Math.sin(performance.now() * 0.004) * 0.25 - 0.3
            : -swing * 0.7;
        rig.rightArm.rotation.x = swing * 0.7;
      } else {
        rig.leftLeg.rotation.x = 0;
        rig.rightLeg.rotation.x = 0;
      }
    }

    // Drivable Vehicles
    if (!isInterior) {
      for (const vState of this.vehicles.getRegionVehicles(this.currentRegionId)) {
        const vRig = this.vehicleRigs.get(vState.id);
        if (!vRig) continue;
        vRig.root.position.set(vState.position.x, vState.position.y, vState.position.z);
        vRig.root.rotation.y = vState.yaw;
        vRig.frontLeftPivot.rotation.y = vState.steerAngle;
        vRig.frontRightPivot.rotation.y = vState.steerAngle;
        for (const w of vRig.wheels) {
          w.rotation.x = vState.wheelSpin;
        }
      }

      // Traffic Vehicles
      for (const tv of this.traffic.getVehicles()) {
        const tRig = this.trafficRigs.get(tv.id);
        if (!tRig) continue;
        tRig.root.position.set(tv.position.x, tv.position.y, tv.position.z);
        tRig.root.rotation.y = tv.yaw;
        for (const w of tRig.wheels) {
          w.rotation.x = tv.wheelSpin;
        }
      }
    }
    void dt;
  }

  public executeInteraction(prompt: ActiveInteractionPrompt): void {
    if (prompt.kind === 'npc') {
      this.openDialogue(prompt.targetId);
    } else if (prompt.kind === 'door') {
      this.enterInterior(prompt.targetId);
    } else if (prompt.kind === 'exit-interior') {
      this.exitInterior();
    } else if (prompt.kind === 'vehicle') {
      const veh = this.vehicles.getVehicleById(prompt.targetId);
      if (veh) {
        veh.occupiedByPlayer = true;
        this.playerCtrl.state.mode = 'vehicle';
        this.playerCtrl.state.activeVehicleId = veh.id;
        this.cameraRig.mode = 'vehicle';
        this.audio.playChime('interact');
        const completion = this.missions.notifyAction('drive_vehicle', veh.id, this.currentRegionId);
        this.handleMissionCompletion(completion);
        this.notify(`Driving ${this.vehicles.getSpec(veh.specId)?.name ?? 'Vehicle'}`);
      }
    } else if (prompt.kind === 'exit-vehicle') {
      const veh = this.vehicles.getVehicleById(prompt.targetId);
      if (veh) {
        veh.occupiedByPlayer = false;
        veh.speed = 0;
        this.playerCtrl.state.position = {
          x: veh.position.x + Math.cos(veh.yaw) * 2.4,
          y: 0,
          z: veh.position.z - Math.sin(veh.yaw) * 2.4,
        };
      }
      this.playerCtrl.state.mode = 'foot';
      this.playerCtrl.state.activeVehicleId = null;
      this.cameraRig.mode = 'third-person';
      this.audio.playChime('interact');
    } else if (prompt.kind === 'collectible') {
      this.collectedIds.add(prompt.targetId);
      const mesh = this.regionBuilt?.collectibleMeshes.get(prompt.targetId);
      if (mesh) mesh.visible = false;
      this.audio.playChime('mission');
      this.notify(`Collected ${prompt.label.replace('Collect ', '')}`);
      const completion = this.missions.notifyAction('collect', prompt.targetId, this.currentRegionId);
      this.handleMissionCompletion(completion);
    } else if (prompt.kind === 'gateway') {
      this.callbacks.onOpenGatewayModal();
    }
  }

  public openDialogue(npcId: string): void {
    const profile = this.npcSim.getProfile(npcId);
    const runtime = this.npcSim.getNpcById(this.currentRegionId, npcId);
    if (!profile || !runtime) return;

    this.npcSim.beginPlayerConversation(this.currentRegionId, npcId, this.playerCtrl.state.position);
    const rel = this.relationships.get(npcId);
    const activeMission = this.missions.getActiveMission();
    const activeIds = new Set<string>(activeMission ? [activeMission.def.id] : []);
    const atm = this.weather.getAtmosphere(this.currentRegionId);

    const node = this.dialogueEngine.selectNode(profile, runtime, {
      clockSec: this.clock.totalSeconds,
      hourOfDay: this.clock.getHourOfDay(),
      weather: atm.activeWeather,
      worldFlags: this.worldFlags,
      activeMissionIds: activeIds,
      relationship: rel,
    });

    this.dialogueEngine.markUsed(npcId, node, this.clock.totalSeconds);
    const completion = this.missions.notifyAction('talk_to', npcId, this.currentRegionId);
    this.handleMissionCompletion(completion);

    this.activeDialogue = {
      npc: profile,
      node,
      relationshipTier: this.relationships.getTierLabel(npcId),
      familiarity: Math.round(rel.familiarity),
      trust: Math.round(rel.trust),
      friendship: Math.round(rel.friendship),
      respect: Math.round(rel.respect),
      replyText: null,
    };
    this.input.clearAll();
    this.input.enabled = false;
    this.audio.playChime('interact');
    this.callbacks.onDialogueChange({ ...this.activeDialogue });
  }

  public chooseDialogueOption(choice: DialogueChoice): void {
    if (!this.activeDialogue) return;
    const npcId = this.activeDialogue.npc.id;
    const updated = this.relationships.applyDelta(
      npcId,
      choice.relationshipDelta ?? { familiarity: 5, friendship: 3 },
      this.clock.totalSeconds,
      choice.setFlags,
    );
    if (choice.setFlags) {
      for (const f of choice.setFlags) this.worldFlags.add(f);
    }

    this.activeDialogue = {
      ...this.activeDialogue,
      relationshipTier: this.relationships.getTierLabel(npcId),
      familiarity: Math.round(updated.familiarity),
      trust: Math.round(updated.trust),
      friendship: Math.round(updated.friendship),
      respect: Math.round(updated.respect),
      replyText: choice.replyText,
    };
    this.audio.playChime('interact');
    this.callbacks.onDialogueChange({ ...this.activeDialogue });
    void this.saveToSlot('autosave', 'Autosave');
  }

  public closeDialogue(): void {
    if (!this.activeDialogue) return;
    this.npcSim.endPlayerConversation(this.currentRegionId, this.activeDialogue.npc.id);
    this.activeDialogue = null;
    this.input.clearAll();
    this.input.enabled = this.shellState === 'playing';
    this.callbacks.onDialogueChange(null);
    this.emitHud();
  }

  public toggleObserverMode(): void {
    if (this.cameraRig.mode === 'observer') {
      this.cameraRig.mode = this.playerCtrl.state.mode === 'vehicle' ? 'vehicle' : 'third-person';
      this.clock.paused = false;
      this.notify('Returned to Exploration Camera');
    } else {
      this.cameraRig.mode = 'observer';
      const p = this.playerCtrl.state.position;
      this.cameraRig.observerPos.set(p.x + 7.5, p.y + 8.5, p.z + 11.5);
      this.cameraRig.pitch = 0.42;
      this.notify('Observer / Photo Mode — [Space] Capture Photo · [O] Exit');
    }
    this.emitHud();
  }

  public capturePhoto(): PhotoRecord {
    const manifest = getRegionManifest(this.currentRegionId);
    const refPos =
      this.cameraRig.mode === 'observer'
        ? { x: this.cameraRig.observerPos.x, z: this.cameraRig.observerPos.z }
        : { x: this.playerCtrl.state.position.x, z: this.playerCtrl.state.position.z };

    // Match closest landmark in range
    let bestLandmark = manifest.landmarks[0];
    let bestDist = Infinity;
    for (const lm of manifest.landmarks) {
      const d = dist2D(refPos.x, refPos.z, lm.position.x, lm.position.z);
      if (d < bestDist) {
        bestDist = d;
        bestLandmark = lm;
      }
    }

    const atm = this.weather.getAtmosphere(this.currentRegionId);
    const record: PhotoRecord = {
      id: `photo-${Date.now()}`,
      regionId: this.currentRegionId,
      landmarkName: bestLandmark?.name ?? manifest.name,
      capturedAtClockSec: this.clock.totalSeconds,
      weather: atm.activeWeather,
    };
    this.photos.unshift(record);
    this.audio.playChime('photo');

    // Also evaluate any photograph mission target near camera or player
    let completed = null;
    for (const lm of manifest.landmarks) {
      const dCam = dist2D(refPos.x, refPos.z, lm.position.x, lm.position.z);
      const dPly = dist2D(this.playerCtrl.state.position.x, this.playerCtrl.state.position.z, lm.position.x, lm.position.z);
      if (Math.min(dCam, dPly) <= 42) {
        this.discoveredLandmarks.add(lm.id);
        const res = this.missions.notifyAction('photograph', lm.id, this.currentRegionId);
        if (res) completed = res;
      }
    }
    if (completed) {
      this.handleMissionCompletion(completed);
    } else {
      this.notify(`Photo captured: ${record.landmarkName}`);
    }
    this.events.emit('photo:captured', { landmarkName: record.landmarkName, regionId: this.currentRegionId });
    this.emitHud();
    return record;
  }

  private handleMissionCompletion(res: ReturnType<MissionSystem['notifyAction']>): void {
    if (!res) return;
    if (res.unlockedRegionId) {
      this.unlockedRegions.add(res.unlockedRegionId);
    }
    this.audio.playChime('mission');
    this.notify(`Mission Complete: ${res.completedMission.title} (${res.completedMission.rewardLabel})`);
    this.events.emit('mission:updated', {
      missionId: res.completedMission.id,
      title: res.completedMission.title,
      status: 'completed',
    });
    void this.saveToSlot('autosave', 'Autosave');
  }

  public setQualityPreset(q: QualityTier): void {
    this.settings.quality = q;
    this.engine.applyQuality(q);
    void IndexedDbStore.saveSettings(this.settings);
    this.emitHud();
  }

  public setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.audio.setVolume(this.settings.masterVolume, muted);
    void IndexedDbStore.saveSettings(this.settings);
  }

  public setVolume(vol: number): void {
    this.settings.masterVolume = clamp(vol, 0, 1);
    this.audio.setVolume(this.settings.masterVolume, this.settings.muted);
    void IndexedDbStore.saveSettings(this.settings);
  }

  public setTimeScale(scale: number, paused: boolean): void {
    this.clock.timeScale = scale;
    this.clock.paused = paused;
    this.emitHud();
  }

  public setWeatherOverride(kind: WeatherKind): void {
    this.weather.forceWeather(this.currentRegionId, kind);
    this.notify(`Weather shifting toward ${kind}`);
    this.emitHud();
  }

  public buildSavePayload(slotId: string, label: string): SaveGameV1 {
    const dlg = this.dialogueEngine.serialize();
    return {
      schemaVersion: 1,
      slotId,
      label,
      savedAtIso: new Date().toISOString(),
      worldSeed: this.worldSeed,
      worldClockSeconds: this.clock.totalSeconds,
      dayCount: this.clock.getDayCount(),
      currentRegionId: this.currentRegionId,
      activeInteriorId: this.activeInteriorId,
      exteriorReturnPosition: { ...this.playerCtrl.state.exteriorReturnPosition },
      exteriorReturnYaw: this.playerCtrl.state.exteriorReturnYaw,
      playerPosition: { ...this.playerCtrl.state.position },
      playerYaw: this.playerCtrl.state.yaw,
      activeVehicleId: this.playerCtrl.state.activeVehicleId,
      vehicleStates: this.vehicles.serialize(),
      weatherByRegion: this.weather.serializeAll(),
      unlockedRegions: Array.from(this.unlockedRegions),
      discoveredLandmarks: Array.from(this.discoveredLandmarks),
      collectedIds: Array.from(this.collectedIds),
      photos: [...this.photos],
      relationships: this.relationships.serialize(),
      npcDialogueCooldowns: dlg.cooldowns,
      recentDialogueIds: dlg.recent,
      worldFlags: Array.from(this.worldFlags),
      missions: this.missions.serialize(),
    };
  }

  public async saveToSlot(slotId: string, label: string): Promise<{ ok: boolean; error?: string }> {
    const payload = this.buildSavePayload(slotId, label);
    const res = await IndexedDbStore.saveSlot(payload);
    if (res.ok && slotId !== 'autosave') {
      this.notify(`Saved to ${label}`);
    }
    return res;
  }

  public getCurrentRegionId(): RegionId {
    return this.currentRegionId;
  }

  public notify(text: string): void {
    this.notificationBanner = text;
    this.notificationTimer = 4.2;
    this.emitHud();
  }

  private emitHud(drivingSpeedKmh: number | null = null): void {
    const manifest = getRegionManifest(this.currentRegionId);
    const sun = this.clock.getSunState();
    const atm = this.weather.getAtmosphere(this.currentRegionId);
    const activeMission = this.missions.getActiveMission();
    const activeEvent = this.dynamicEvents.getActiveEvent(
      this.currentRegionId,
      this.clock.getHourOfDay(),
      atm.activeWeather,
    );
    const activeInterior = this.activeInteriorId
      ? manifest.interiors.find((i) => i.id === this.activeInteriorId) ?? null
      : null;

    let vehicleHud: HudViewModel['vehicleHud'] = null;
    if (this.playerCtrl.state.mode === 'vehicle' && this.playerCtrl.state.activeVehicleId) {
      const v = this.vehicles.getVehicleById(this.playerCtrl.state.activeVehicleId);
      const spec = v ? this.vehicles.getSpec(v.specId) : null;
      if (v && spec) {
        vehicleHud = {
          name: spec.name,
          speedKmh: drivingSpeedKmh ?? Math.round(Math.abs(v.speed) * 3.6),
          condition: Math.round(v.condition),
        };
      }
    }

    const totalLandmarks = ALL_REGION_IDS.reduce(
      (acc, id) => acc + getRegionManifest(id).landmarks.length,
      0,
    );

    const activeObj = activeMission
      ? activeMission.def.objectives[activeMission.progress.currentObjectiveIndex]
      : null;

    this.callbacks.onHudUpdate({
      regionId: this.currentRegionId,
      regionName: manifest.name,
      interiorName: activeInterior?.name ?? null,
      timeFormatted: this.clock.getFormattedTime(),
      dayCount: this.clock.getDayCount(),
      dayPhaseLabel: sun.phaseLabel,
      weather: atm.activeWeather,
      cameraMode: this.cameraRig.mode,
      timeScale: this.clock.timeScale,
      simPaused: this.clock.paused,
      activeMissionTitle: activeMission?.def.title ?? null,
      activeObjectiveText: activeObj?.description ?? null,
      activeEventName: activeEvent?.name ?? null,
      interactionPrompt: this.currentPrompt,
      vehicleHud,
      discoveredCount: this.discoveredLandmarks.size,
      totalLandmarks,
      notificationBanner: this.notificationBanner,
    });

    const npcs = this.npcSim.getActiveRegionNpcs(this.currentRegionId);
    const nearCount = npcs.filter((n) => n.tier === 'near').length;
    const distCount = npcs.filter((n) => n.tier === 'district').length;
    this.callbacks.onDiagnosticsUpdate(
      this.diagnostics.snapshot(
        this.engine.renderer,
        this.engine.isSoftwareGl,
        this.engine.activeQuality,
        this.currentRegionId,
        nearCount,
        distCount,
      ),
    );
  }

  public dispose(): void {
    this.disposed = true;
    this.input.detach();
    this.unloadCurrentScene(`region:${this.currentRegionId}`);
    this.atmosphere.dispose();
    this.registry.disposeAll();
    this.audio.dispose();
    this.events.clearAll();
    this.engine.dispose();
  }
}
