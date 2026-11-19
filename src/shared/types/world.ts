export type RegionId =
  | 'gateway'
  | 'solara-bay'
  | 'vesper-city'
  | 'verdant-highlands'
  | 'aether-district';

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'fog' | 'storm';

export type QualityTier = 'low' | 'medium' | 'high';

export type CameraMode = 'third-person' | 'shoulder' | 'vehicle' | 'observer';

export type GameShellState = 'title' | 'playing' | 'paused';

export type NpcSimTier = 'near' | 'district' | 'offscreen' | 'inactive';

export type NpcBehaviorState =
  | 'idle'
  | 'walk'
  | 'commute'
  | 'work'
  | 'sit'
  | 'eat'
  | 'shelter'
  | 'talk_npc'
  | 'talk_player'
  | 'attend_event';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PersonalityTraits {
  extraversion: number; // 0..1
  conscientiousness: number; // 0..1
  curiosity: number; // 0..1
  warmth: number; // 0..1
}

export interface NpcNeeds {
  energy: number; // 0..100
  hunger: number; // 0..100
  social: number; // 0..100
  comfort: number; // 0..100
}

export interface ScheduleBlock {
  startHour: number; // 0..24
  endHour: number; // 0..24
  intent: 'rest' | 'commute' | 'work' | 'break' | 'leisure' | 'social';
  targetLocationId: string;
}

export interface DialogueChoice {
  id: string;
  label: string;
  replyText: string;
  relationshipDelta?: Partial<Omit<RelationshipAxes, 'memoryFlags' | 'lastInteractionSec'>>;
  setFlags?: string[];
  advanceMissionId?: string;
}

export interface DialogueNode {
  id: string;
  tags: string[];
  minFamiliarity?: number;
  minTrust?: number;
  weatherMatch?: WeatherKind[];
  timeRange?: [number, number];
  requiredFlags?: string[];
  forbiddenFlags?: string[];
  requiredMissionId?: string;
  cooldownSec: number;
  greeting: string;
  body: string;
  choices: DialogueChoice[];
}

export interface NpcProfile {
  id: string;
  name: string;
  regionId: RegionId;
  occupation: string;
  bio: string;
  homeLocationId: string;
  workLocationId: string;
  appearance: {
    coatColor: string;
    accentColor: string;
    pantsColor: string;
    skinTone: string;
    hairColor: string;
    heightScale: number;
    hatStyle: 'none' | 'cap' | 'sunhat' | 'beanie' | 'visor';
  };
  personality: PersonalityTraits;
  schedule: ScheduleBlock[];
  dialoguePool: DialogueNode[];
  isKeyResident?: boolean;
}

export interface NpcRuntimeState {
  id: string;
  regionId: RegionId;
  interiorId: string | null;
  position: Vec3;
  yaw: number;
  speed: number;
  tier: NpcSimTier;
  behavior: NpcBehaviorState;
  currentGoal: string;
  targetLocationId: string;
  path: Vec3[];
  pathIndex: number;
  needs: NpcNeeds;
  mood: 'content' | 'cheerful' | 'focused' | 'weary' | 'sheltered';
  stateTimerSec: number;
  decisionCooldownSec: number;
  socialPartnerId: string | null;
  activeBark: string | null;
  barkTimerSec: number;
  gaitPhase: number;
}

export interface RelationshipAxes {
  familiarity: number; // 0..100
  trust: number; // 0..100
  friendship: number; // 0..100
  respect: number; // 0..100
  memoryFlags: string[];
  lastInteractionSec: number;
}

export interface LandmarkDef {
  id: string;
  name: string;
  kind: 'plaza' | 'monument' | 'waterfront' | 'transit' | 'viewpoint' | 'market' | 'nature';
  position: Vec3;
  radius: number;
  description: string;
  isPhotoTarget?: boolean;
}

export interface BuildingDef {
  id: string;
  name: string;
  style:
    | 'coastal-villa'
    | 'coastal-cafe'
    | 'boathouse'
    | 'urban-tower'
    | 'urban-arcade'
    | 'transit-hub'
    | 'timber-cabin'
    | 'alpine-lodge'
    | 'aether-lab'
    | 'aether-pavilion'
    | 'gateway-rotunda';
  position: Vec3;
  size: Vec3; // width, height, depth
  yaw: number;
  primaryColor: string;
  trimColor: string;
  roofColor: string;
  interiorId?: string;
  doorLocalOffset?: Vec3;
  isShelter?: boolean;
}

export interface InteriorDef {
  id: string;
  name: string;
  regionId: RegionId;
  entryBuildingId: string;
  roomSize: Vec3;
  floorColor: string;
  wallColor: string;
  spawnLocal: Vec3;
  exitLocal: Vec3;
  props: Array<{
    kind: 'counter' | 'table' | 'bookshelf' | 'display' | 'sofa' | 'plant' | 'terminal';
    position: Vec3;
    yaw: number;
    color?: string;
  }>;
  npcLocationId: string;
}

export interface NavNode {
  id: string;
  position: Vec3;
  neighbors: string[];
  tag?: 'sidewalk' | 'plaza' | 'crosswalk' | 'trail' | 'shelter';
  crosswalkSignalId?: string;
}

export interface TrafficNode {
  id: string;
  position: Vec3;
  nextIds: string[];
  speedLimit: number;
  signalId?: string;
  crosswalkCenter?: Vec3;
}

export interface TrafficSignalDef {
  id: string;
  position: Vec3;
  yaw: number;
  cycleSec: number;
  phaseOffsetSec: number;
}

export interface VehicleSpec {
  id: string;
  name: string;
  kind: 'roadster' | 'coupe' | 'rover' | 'pod' | 'utility';
  regionId: RegionId;
  spawnPosition: Vec3;
  spawnYaw: number;
  primaryColor: string;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  drivable: boolean;
}

export interface VehicleRuntimeState {
  id: string;
  specId: string;
  regionId: RegionId;
  position: Vec3;
  yaw: number;
  speed: number;
  steerAngle: number;
  condition: number; // 0..100
  occupiedByPlayer: boolean;
  wheelSpin: number;
}

export interface TrafficVehicleState {
  id: string;
  color: string;
  kind: 'coupe' | 'utility' | 'pod';
  currentNodeId: string;
  nextNodeId: string;
  progress: number;
  position: Vec3;
  yaw: number;
  speed: number;
  wheelSpin: number;
}

export type MissionObjectiveKind =
  | 'go_to'
  | 'talk_to'
  | 'enter_interior'
  | 'drive_vehicle'
  | 'photograph'
  | 'collect'
  | 'attend_event';

export interface MissionObjectiveDef {
  id: string;
  description: string;
  kind: MissionObjectiveKind;
  targetId: string; // landmarkId, npcId, interiorId, vehicleId, collectibleId, eventId
  regionId: RegionId;
  targetPosition?: Vec3;
  radius?: number;
}

export interface MissionDef {
  id: string;
  title: string;
  summary: string;
  regionId: RegionId;
  prerequisiteMissionId?: string;
  objectives: MissionObjectiveDef[];
  rewardLabel: string;
  unlockRegionId?: RegionId;
  repeatable?: boolean;
}

export interface MissionProgress {
  missionId: string;
  status: 'locked' | 'available' | 'active' | 'completed';
  currentObjectiveIndex: number;
  completedObjectiveIds: string[];
  completedCount: number;
}

export interface DynamicEventDef {
  id: string;
  name: string;
  regionId: RegionId;
  locationId: string;
  position: Vec3;
  startHour: number;
  endHour: number;
  allowedWeather: WeatherKind[];
  description: string;
  participantNpcIds: string[];
}

export interface CollectibleDef {
  id: string;
  name: string;
  regionId: RegionId;
  position: Vec3;
  kind: 'shell' | 'data-chip' | 'botanical' | 'postcard';
}

export interface PropClusterDef {
  kind: 'palm' | 'pine' | 'oak' | 'lamp' | 'bench' | 'bollard' | 'rock' | 'umbrella';
  positions: Vec3[];
}

export interface RegionManifest {
  id: RegionId;
  name: string;
  subtitle: string;
  description: string;
  boundsRadius: number;
  waterLevel: number | null;
  hasCoastalOcean?: boolean;
  hasAlpineLake?: boolean;
  hasWaterfall?: boolean;
  hasElevatedTransit?: boolean;
  palette: {
    ground: string;
    road: string;
    sidewalk: string;
    water: string;
    fogDay: string;
    fogNight: string;
    accent: string;
  };
  weatherWeights: Record<WeatherKind, number>;
  arrivalSpawn: Vec3;
  arrivalYaw: number;
  gatewayPortalPosition: Vec3;
  landmarks: LandmarkDef[];
  buildings: BuildingDef[];
  interiors: InteriorDef[];
  navNodes: NavNode[];
  trafficNodes: TrafficNode[];
  trafficSignals: TrafficSignalDef[];
  vehicles: VehicleSpec[];
  collectibles: CollectibleDef[];
  props: PropClusterDef[];
  events: DynamicEventDef[];
  missions: MissionDef[];
  residents: NpcProfile[];
}

export interface ActiveInteractionPrompt {
  id: string;
  kind: 'npc' | 'door' | 'exit-interior' | 'vehicle' | 'exit-vehicle' | 'collectible' | 'gateway' | 'photo';
  label: string;
  sublabel?: string;
  targetId: string;
  distance: number;
}

export interface PhotoRecord {
  id: string;
  regionId: RegionId;
  landmarkName: string;
  capturedAtClockSec: number;
  weather: WeatherKind;
}

export interface PlayerRuntimeState {
  regionId: RegionId;
  interiorId: string | null;
  exteriorReturnPosition: Vec3;
  exteriorReturnYaw: number;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  isGrounded: boolean;
  mode: 'foot' | 'vehicle';
  activeVehicleId: string | null;
  gaitPhase: number;
  squashY: number;
}

export interface SettingsState {
  quality: QualityTier;
  autoQuality: boolean;
  masterVolume: number;
  muted: boolean;
  mouseSensitivity: number;
  showControlHints: boolean;
}

export interface SaveGameV1 {
  schemaVersion: 1;
  slotId: string;
  label: string;
  savedAtIso: string;
  worldSeed: number;
  worldClockSeconds: number;
  dayCount: number;
  currentRegionId: RegionId;
  activeInteriorId: string | null;
  exteriorReturnPosition: Vec3;
  exteriorReturnYaw: number;
  playerPosition: Vec3;
  playerYaw: number;
  activeVehicleId: string | null;
  vehicleStates: Record<string, { position: Vec3; yaw: number; condition: number }>;
  weatherByRegion: Record<RegionId, { current: WeatherKind; next: WeatherKind; progress: number; durationSec: number }>;
  unlockedRegions: RegionId[];
  discoveredLandmarks: string[];
  collectedIds: string[];
  photos: PhotoRecord[];
  relationships: Record<string, RelationshipAxes>;
  npcDialogueCooldowns: Record<string, number>;
  recentDialogueIds: Record<string, string[]>;
  worldFlags: string[];
  missions: Record<string, MissionProgress>;
}

export interface DiagnosticsSnapshot {
  fps: number;
  frameTimeMs: number;
  simTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  isSoftwareGl: boolean;
  activeQuality: QualityTier;
  activeRegionId: RegionId;
  nearNpcCount: number;
  districtNpcCount: number;
}

export interface HudViewModel {
  regionId: RegionId;
  regionName: string;
  interiorName: string | null;
  timeFormatted: string;
  dayCount: number;
  dayPhaseLabel: string;
  weather: WeatherKind;
  cameraMode: CameraMode;
  timeScale: number;
  simPaused: boolean;
  activeMissionTitle: string | null;
  activeObjectiveText: string | null;
  activeEventName: string | null;
  interactionPrompt: ActiveInteractionPrompt | null;
  vehicleHud: {
    name: string;
    speedKmh: number;
    condition: number;
  } | null;
  discoveredCount: number;
  totalLandmarks: number;
  notificationBanner: string | null;
}
