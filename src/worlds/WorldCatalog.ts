import { RegionId, RegionManifest } from '../shared/types/world';
import { AETHER_DISTRICT_MANIFEST } from './aether-district/manifest';
import { GATEWAY_MANIFEST } from './gateway/manifest';
import { SOLARA_BAY_MANIFEST } from './solara-bay/manifest';
import { VERDANT_HIGHLANDS_MANIFEST } from './verdant-highlands/manifest';
import { VESPER_CITY_MANIFEST } from './vesper-city/manifest';

export const WORLD_MANIFESTS: Record<RegionId, RegionManifest> = {
  gateway: GATEWAY_MANIFEST,
  'solara-bay': SOLARA_BAY_MANIFEST,
  'vesper-city': VESPER_CITY_MANIFEST,
  'verdant-highlands': VERDANT_HIGHLANDS_MANIFEST,
  'aether-district': AETHER_DISTRICT_MANIFEST,
};

export const ALL_REGION_IDS: RegionId[] = [
  'gateway',
  'solara-bay',
  'vesper-city',
  'verdant-highlands',
  'aether-district',
];

export function getRegionManifest(id: RegionId): RegionManifest {
  return WORLD_MANIFESTS[id];
}
