import * as THREE from 'three';
import { InteriorDef, RegionManifest } from '../../shared/types/world';
import { clamp } from '../../shared/math/prng';
import { ResourceRegistry } from '../core/ResourceRegistry';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { buildBuildingMesh, buildInstancedPropClusters } from './CompositeBuilders';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export interface BuiltRegionScene {
  group: THREE.Group;
  waterMaterial: THREE.MeshStandardMaterial | null;
  animatedParts: Array<{ object: THREE.Object3D; speed: number; axis: 'y' | 'z' | 'bob' }>;
  collectibleMeshes: Map<string, THREE.Object3D>;
  signalLights: Map<string, THREE.MeshStandardMaterial>;
}

/**
 * Natural coastal shoreline Z coordinate across Solara Bay X axis.
 * Negative Z faces open ocean north of town; positive Z is town & inland hills.
 */
function getSolaraCoastZ(x: number): number {
  const base = -53;
  const beachBay = -7.5 * Math.exp(-((x + 38) * (x + 38)) / (24 * 24));
  const marinaCut = 6.5 * Math.exp(-((x - 27.5) * (x - 27.5)) / (11 * 11));
  const lighthousePoint = -23.5 * Math.exp(-(x * x) / (11.5 * 11.5));
  const boathouseQuay = -9.5 * Math.exp(-((x - 44) * (x - 44)) / (10.5 * 10.5));
  return base + beachBay + marinaCut + lighthousePoint + boathouseQuay;
}

function buildCompositeSkiff(
  hullColor: string,
  trimColor: string,
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): THREE.Group {
  const skiff = new THREE.Group();
  const hullMat = mats.getStandardMaterial(
    `skiff-hull:${hullColor}`,
    { color: hullColor, roughness: 0.52, metalness: 0.08 },
    scope,
  );
  const trimMat = mats.getStandardMaterial(
    `skiff-trim:${trimColor}`,
    { color: trimColor, roughness: 0.62, metalness: 0.08 },
    scope,
  );
  const deckMat = mats.getStandardMaterial(
    'skiff-deck',
    { color: '#b58d63', roughness: 0.72, metalness: 0.04 },
    scope,
  );

  // Tapered hull body + raised bow stem
  const hull = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.1, 0.65, 5.2), scope), hullMat);
  hull.position.y = 0.25;
  hull.castShadow = true;

  const bow = new THREE.Mesh(registry.track(new THREE.ConeGeometry(1.06, 1.9, 4), scope), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1.0, 0.52, 1.0);
  bow.position.set(0, 0.34, 3.45);
  bow.castShadow = true;

  // Gunwale stripe
  const stripe = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.2, 0.12, 5.3), scope), trimMat);
  stripe.position.y = 0.56;

  // Deck thwarts & forward wheelhouse cabin
  const deck = new THREE.Mesh(registry.track(new THREE.BoxGeometry(1.8, 0.08, 4.6), scope), deckMat);
  deck.position.y = 0.52;

  const cabin = new THREE.Mesh(registry.track(new THREE.BoxGeometry(1.35, 0.95, 1.55), scope), hullMat);
  cabin.position.set(0, 1.0, 0.85);
  cabin.castShadow = true;

  const cabinRoof = new THREE.Mesh(registry.track(new THREE.BoxGeometry(1.5, 0.1, 1.7), scope), trimMat);
  cabinRoof.position.set(0, 1.5, 0.85);

  const mast = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), scope), deckMat);
  mast.position.set(0, 2.4, 0.6);

  skiff.add(hull, bow, stripe, deck, cabin, cabinRoof, mast);
  return skiff;
}

export function buildRegionScene(
  manifest: RegionManifest,
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): BuiltRegionScene {
  const group = new THREE.Group();
  const animatedParts: BuiltRegionScene['animatedParts'] = [];
  const collectibleMeshes = new Map<string, THREE.Object3D>();
  const signalLights = new Map<string, THREE.MeshStandardMaterial>();
  let waterMaterial: THREE.MeshStandardMaterial | null = null;

  // 1. Sculpted Region Terrain + Horizon Hills (coast-aware so ocean is never buried by ground plane!)
  const groundBump = mats.getGrainBumpTexture('grass', 28);
  const groundTex = mats.getTerrainAlbedoTexture(scope, manifest.palette.ground);

  if (manifest.hasCoastalOcean) {
    const terrainGeo = registry.track(new THREE.PlaneGeometry(760, 760, 108, 108), scope);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const baseCol = new THREE.Color(manifest.palette.ground);
    const sandCol = new THREE.Color('#dfca9b');
    const wetSandCol = new THREE.Color('#b69e74');
    const hillCol = new THREE.Color('#8e9c74');
    const tmpCol = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const coastZ = getSolaraCoastZ(x);
      const dist = Math.hypot(x, z);

      let y = 0;
      // Carve submerged shelf cleanly below ocean water north of shoreline
      if (z < coastZ + 1.5) {
        const shelfT = smoothstep(coastZ + 1.5, coastZ - 14, z);
        y = -2.6 * shelfT;
      } else if (dist > manifest.boundsRadius + 12) {
        // Gentle inland coastal hills south/east/west beyond town bounds
        const hillWave =
          Math.sin(x * 0.032) * Math.cos(z * 0.032) * 5.5 + (dist - manifest.boundsRadius - 12) * 0.065;
        y = Math.max(0, hillWave);
      }
      pos.setY(i, y);

      // Natural coastline sand -> town ground -> grassy hills gradient
      tmpCol.copy(baseCol);
      const shoreDist = z - coastZ;
      if (y < -0.05) {
        tmpCol.copy(wetSandCol);
      } else if (shoreDist < 12 && x < 24) {
        const sandFactor = clamp(1 - shoreDist / 12, 0, 1);
        tmpCol.lerp(sandCol, sandFactor * 0.85);
      } else if (y > 0.6) {
        tmpCol.lerp(hillCol, clamp(y / 8, 0, 0.78));
      }
      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const coastalGroundMat = mats.getStandardMaterial(
      `ground-coastal:${manifest.id}`,
      {
        color: '#ffffff',
        vertexColors: true,
        map: groundTex,
        roughness: 0.92,
        metalness: 0.02,
        bumpMap: groundBump,
        bumpScale: 0.05,
      },
      scope,
    );
    const groundMesh = new THREE.Mesh(terrainGeo, coastalGroundMat);
    groundMesh.receiveShadow = true;
    group.add(groundMesh);
  } else {
    const groundMat = mats.getStandardMaterial(
      `ground:${manifest.id}`,
      {
        color: '#ffffff',
        map: groundTex,
        roughness: 0.92,
        metalness: 0.02,
        bumpMap: groundBump,
        bumpScale: 0.06,
      },
      scope,
    );
    const groundGeo = registry.track(new THREE.CircleGeometry(380, 48), scope);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = 0;
    groundMesh.receiveShadow = true;
    group.add(groundMesh);

    const ridgeGeo = registry.track(new THREE.RingGeometry(manifest.boundsRadius + 6, 360, 40, 2), scope);
    ridgeGeo.rotateX(-Math.PI / 2);
    const ridgePos = ridgeGeo.attributes.position;
    for (let i = 0; i < ridgePos.count; i++) {
      const x = ridgePos.getX(i);
      const z = ridgePos.getZ(i);
      const dist = Math.hypot(x, z);
      if (dist > manifest.boundsRadius + 14) {
        const wave = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 7 + (dist - manifest.boundsRadius) * 0.07;
        ridgePos.setY(i, Math.max(0, wave));
      }
    }
    ridgeGeo.computeVertexNormals();
    const ridgeMat = mats.getStandardMaterial(
      `ridge:${manifest.id}`,
      {
        color: manifest.id === 'verdant-highlands' ? '#364d36' : '#5c6975',
        roughness: 0.94,
        metalness: 0.02,
      },
      scope,
    );
    const ridgeMesh = new THREE.Mesh(ridgeGeo, ridgeMat);
    ridgeMesh.receiveShadow = true;
    group.add(ridgeMesh);
  }

  // 2. Central plaza cobblestone/paver disk + raised stone rim & fountain monument
  const stoneBump = mats.getGrainBumpTexture('stone', 12);
  const paverTex = mats.getPaverAlbedoTexture(scope, manifest.palette.sidewalk, manifest.palette.accent);
  const plazaMat = mats.getStandardMaterial(
    `plaza:${manifest.id}`,
    {
      color: '#ffffff',
      map: paverTex,
      roughness: 0.78,
      metalness: 0.04,
      bumpMap: stoneBump,
      bumpScale: 0.05,
    },
    scope,
  );
  const plazaGeo = registry.track(new THREE.CylinderGeometry(15.6, 16.2, 0.14, 36), scope);
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.position.y = 0.07;
  plaza.receiveShadow = true;
  group.add(plaza);

  const rimMat = mats.getStandardMaterial(
    `plaza-rim:${manifest.id}`,
    { color: manifest.palette.accent, roughness: 0.55, metalness: 0.18 },
    scope,
  );
  const rim = new THREE.Mesh(registry.track(new THREE.TorusGeometry(15.6, 0.22, 8, 48), scope), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.15;
  group.add(rim);

  if (manifest.id !== 'gateway') {
    const basinMat = mats.getStandardMaterial(
      `fountain-stone:${manifest.id}`,
      { color: '#d4ccbe', roughness: 0.68, metalness: 0.06, bumpMap: stoneBump, bumpScale: 0.04 },
      scope,
    );
    const poolMat = mats.getStandardMaterial(
      `fountain-water:${manifest.id}`,
      { color: manifest.palette.water, roughness: 0.14, metalness: 0.25 },
      scope,
    );
    const basin = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(3.2, 3.6, 0.75, 24), scope), basinMat);
    basin.position.y = 0.42;
    basin.castShadow = true;
    basin.receiveShadow = true;
    const basinRim = new THREE.Mesh(registry.track(new THREE.TorusGeometry(3.25, 0.16, 8, 28), scope), basinMat);
    basinRim.rotation.x = Math.PI / 2;
    basinRim.position.y = 0.8;
    const pool = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(2.85, 2.85, 0.12, 24), scope), poolMat);
    pool.position.y = 0.76;
    const spire = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.42, 0.75, 2.4, 12), scope), basinMat);
    spire.position.y = 1.65;
    const upperBowl = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(1.15, 0.5, 0.35, 16), scope), basinMat);
    upperBowl.position.y = 2.45;
    const finial = new THREE.Mesh(registry.track(new THREE.OctahedronGeometry(0.55, 0), scope), rimMat);
    finial.position.y = 3.25;
    animatedParts.push({ object: finial, speed: 0.65, axis: 'y' });
    group.add(basin, basinRim, pool, spire, upperBowl, finial);
  }

  // 3. Road ring & avenues
  if (manifest.trafficNodes.length > 0 || manifest.id !== 'gateway') {
    const roadTex = mats.getRoadAlbedoTexture(scope, manifest.palette.road);
    const roadMat = mats.getStandardMaterial(
      `road:${manifest.id}`,
      {
        color: '#ffffff',
        map: roadTex,
        roughness: 0.78,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      },
      scope,
    );
    const roadLoopGeo = registry.track(new THREE.PlaneGeometry(7.2, 54), scope);
    roadLoopGeo.rotateX(-Math.PI / 2);

    const westRoad = new THREE.Mesh(roadLoopGeo, roadMat);
    westRoad.position.set(-15, 0.055, 0);
    westRoad.receiveShadow = true;
    const eastRoad = new THREE.Mesh(roadLoopGeo, roadMat);
    eastRoad.position.set(15, 0.055, 0);
    eastRoad.receiveShadow = true;

    const northRoad = new THREE.Mesh(roadLoopGeo, roadMat);
    northRoad.rotation.y = Math.PI / 2;
    northRoad.position.set(0, 0.068, -24);
    northRoad.receiveShadow = true;

    const southRoad = new THREE.Mesh(roadLoopGeo, roadMat);
    southRoad.rotation.y = Math.PI / 2;
    southRoad.position.set(0, 0.068, 22);
    southRoad.receiveShadow = true;

    group.add(westRoad, eastRoad, northRoad, southRoad);
  }

  // 4. Water (Coastal Ocean + Solara Promenade + Composite Pier + Moored Skiffs)
  if (manifest.hasCoastalOcean || manifest.hasAlpineLake) {
    waterMaterial = new THREE.MeshStandardMaterial({
      color: manifest.palette.water,
      roughness: 0.14,
      metalness: 0.22,
      envMapIntensity: 1.45,
    });
    waterMaterial.userData.uTime = { value: 0 };
    waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterMaterial!.userData.uTime;
      shader.vertexShader =
        `uniform float uTime;\nvarying vec3 vWorldPos;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float w1 = sin(transformed.x * 0.2 + uTime * 1.45) * 0.12;
          float w2 = cos(transformed.z * 0.17 + uTime * 1.15) * 0.10;
          float w3 = sin((transformed.x + transformed.z) * 0.34 - uTime * 1.9) * 0.05;
          transformed.y += w1 + w2 + w3;
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader =
        `uniform float uTime;\nvarying vec3 vWorldPos;\n` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float crest = sin(vWorldPos.x * 0.2 + uTime * 1.45) * 0.5 + cos(vWorldPos.z * 0.17 + uTime * 1.15) * 0.5;
          // Deepen offshore ocean while highlighting warm turquoise shallows near shore
          float offshore = smoothstep(-52.0, -145.0, vWorldPos.z);
          vec3 shallowTint = vec3(0.18, 0.52, 0.60);
          vec3 deepTint = vec3(0.06, 0.24, 0.36);
          diffuseColor.rgb = mix(shallowTint, deepTint, offshore);
          diffuseColor.rgb += vec3(0.05, 0.08, 0.09) * max(0.0, crest);`,
        );
    };
    registry.track(waterMaterial, scope);

    if (manifest.hasCoastalOcean) {
      const seaGeo = registry.track(new THREE.PlaneGeometry(760, 380, 68, 42), scope);
      seaGeo.rotateX(-Math.PI / 2);
      const sea = new THREE.Mesh(seaGeo, waterMaterial);
      sea.position.set(0, -0.26, -226);
      sea.receiveShadow = true;
      group.add(sea);

      // Stone Waterfront Promenade Seawall & Paved Esplanade
      const seawallMat = mats.getStandardMaterial(
        'sb-seawall-stone',
        { color: '#cfc5b4', roughness: 0.78, metalness: 0.04, bumpMap: stoneBump, bumpScale: 0.04 },
        scope,
      );
      const boardwalkMat = mats.getStandardMaterial(
        'sb-promenade-pave',
        { color: '#ffffff', map: paverTex, roughness: 0.75, metalness: 0.04, bumpMap: stoneBump, bumpScale: 0.03 },
        scope,
      );

      const promenadeDeck = new THREE.Mesh(
        registry.track(new THREE.BoxGeometry(92, 0.18, 7.6), scope),
        boardwalkMat,
      );
      promenadeDeck.position.set(0, 0.09, -35.5);
      promenadeDeck.receiveShadow = true;
      group.add(promenadeDeck);

      // Seawall curbing edges overlooking Crescent Beach & Marina
      for (const seg of [
        { x: -24, w: 38 },
        { x: 14, w: 18 },
      ]) {
        const curb = new THREE.Mesh(
          registry.track(new THREE.BoxGeometry(seg.w, 0.42, 0.55), scope),
          seawallMat,
        );
        curb.position.set(seg.x, 0.21, -39.4);
        curb.castShadow = true;
        curb.receiveShadow = true;
        group.add(curb);
      }

      // Weathered Timber Marina Pier extending cleanly into open bay water (x=28, z=-44..-72)
      const pierTex = mats.getTimberAlbedoTexture(scope, '#7f5e40', 2, 7);
      const pierMat = mats.getStandardMaterial(
        'sb-pier-wood',
        {
          color: '#ffffff',
          map: pierTex,
          roughness: 0.82,
          metalness: 0.04,
          bumpMap: mats.getGrainBumpTexture('wood', 5),
          bumpScale: 0.045,
        },
        scope,
      );
      const stringerMat = mats.getStandardMaterial(
        'sb-pier-stringer',
        { color: '#563e2a', roughness: 0.86, metalness: 0.04 },
        scope,
      );
      const cleatMat = mats.getStandardMaterial(
        'sb-pier-cleat',
        { color: '#2b333d', roughness: 0.38, metalness: 0.7 },
        scope,
      );

      const pierDeck = new THREE.Mesh(registry.track(new THREE.BoxGeometry(7.0, 0.36, 28.5), scope), pierMat);
      pierDeck.position.set(28, 0.38, -58);
      pierDeck.castShadow = true;
      pierDeck.receiveShadow = true;
      group.add(pierDeck);

      // Heavy timber curb stringers along pier edges
      const stringerGeo = registry.track(new THREE.BoxGeometry(0.32, 0.24, 28.5), scope);
      for (const sx of [-3.35, 3.35]) {
        const str = new THREE.Mesh(stringerGeo, stringerMat);
        str.position.set(28 + sx, 0.62, -58);
        str.castShadow = true;
        group.add(str);
      }

      // 12 Submerged Timber Pilings anchored into seabed
      const pilingGeo = registry.track(new THREE.CylinderGeometry(0.24, 0.28, 3.3, 10), scope);
      const capGeo = registry.track(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 10), scope);
      for (const pz of [-46, -51, -56, -61, -66, -71]) {
        for (const px of [24.6, 31.4]) {
          const piling = new THREE.Mesh(pilingGeo, stringerMat);
          piling.position.set(px, -0.55, pz);
          piling.castShadow = true;
          const cap = new THREE.Mesh(capGeo, cleatMat);
          cap.position.set(px, 1.12, pz);
          group.add(piling, cap);
        }
      }

      // Mooring bollards along pier deck
      const cleatGeo = registry.track(new THREE.BoxGeometry(0.45, 0.22, 0.18), scope);
      for (const pz of [-50, -60, -69]) {
        const cl = new THREE.Mesh(cleatGeo, cleatMat);
        cl.position.set(24.9, 0.8, pz);
        group.add(cl);
      }

      // 2 Moored Coastal Skiffs gently resting on the harbor water beside the pier
      const skiffWest = buildCompositeSkiff('#e8dfd1', '#2d6878', mats, registry, scope);
      skiffWest.position.set(21.4, -0.32, -56.5);
      skiffWest.rotation.y = 0.08;
      animatedParts.push({ object: skiffWest, speed: 0.4, axis: 'bob' });

      const skiffEast = buildCompositeSkiff('#d8b98c', '#9c4e38', mats, registry, scope);
      skiffEast.position.set(34.6, -0.32, -62.5);
      skiffEast.rotation.y = Math.PI - 0.1;
      animatedParts.push({ object: skiffEast, speed: 2.1, axis: 'bob' });

      group.add(skiffWest, skiffEast);
    }

    if (manifest.hasAlpineLake) {
      const lakeGeo = registry.track(new THREE.CircleGeometry(24, 32), scope);
      lakeGeo.rotateX(-Math.PI / 2);
      const lake = new THREE.Mesh(lakeGeo, waterMaterial);
      lake.position.set(34, 0.06, -48);
      group.add(lake);
    }
  }

  // Waterfall cliff & falling stream in Verdant Highlands
  if (manifest.hasWaterfall) {
    const cliffMat = mats.getStandardMaterial(
      'vh-cliff',
      { color: '#5c6066', roughness: 0.9, metalness: 0.05 },
      scope,
    );
    const cliff = new THREE.Mesh(registry.track(new THREE.DodecahedronGeometry(16, 1), scope), cliffMat);
    cliff.scale.set(1.5, 1.35, 0.9);
    cliff.position.set(0, 8, -76);
    cliff.castShadow = true;
    const cascadeMat = mats.getStandardMaterial(
      'vh-cascade',
      { color: '#a5e1eb', emissive: '#3b82a6', emissiveIntensity: 0.35, roughness: 0.15, transparent: true, opacity: 0.86 },
      scope,
    );
    const cascade = new THREE.Mesh(registry.track(new THREE.BoxGeometry(4.5, 18, 1.2), scope), cascadeMat);
    cascade.position.set(0, 8.5, -67);
    const basin = new THREE.Mesh(registry.track(new THREE.CircleGeometry(10, 24), scope), cascadeMat);
    basin.rotation.x = -Math.PI / 2;
    basin.position.set(0, 0.08, -61);
    group.add(cliff, cascade, basin);
  }

  // Elevated transit bridge in Aether District
  if (manifest.hasElevatedTransit) {
    const bridgeMat = mats.getStandardMaterial(
      'ae-bridge',
      { color: '#cbd5e1', roughness: 0.35, metalness: 0.55 },
      scope,
    );
    const deck = new THREE.Mesh(registry.track(new THREE.BoxGeometry(110, 1.1, 4.4), scope), bridgeMat);
    deck.position.set(0, 8.5, -24);
    deck.castShadow = true;
    group.add(deck);
    for (const px of [-38, -14, 14, 38]) {
      const pillar = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.65, 0.85, 8.5, 10), scope), bridgeMat);
      pillar.position.set(px, 4.25, -24);
      pillar.castShadow = true;
      group.add(pillar);
    }
  }

  // 5. Architectural Buildings
  for (const b of manifest.buildings) {
    group.add(buildBuildingMesh(b, mats, registry, scope));
  }

  // 6. Signature Hero Landmarks (composite coastal silhouettes)
  const brassMat = mats.getStandardMaterial(
    'hero-brass',
    { color: '#d9a14a', roughness: 0.28, metalness: 0.8 },
    scope,
  );
  const stoneHeroMat = mats.getStandardMaterial(
    'hero-stone',
    { color: '#ebe4d6', roughness: 0.7, metalness: 0.04, bumpMap: stoneBump, bumpScale: 0.04 },
    scope,
  );
  const ironHeroMat = mats.getStandardMaterial(
    'hero-iron',
    { color: '#26313d', roughness: 0.36, metalness: 0.72 },
    scope,
  );
  const beaconMat = mats.getStandardMaterial(
    'hero-beacon',
    { color: '#fff5d1', emissive: '#ffce6b', emissiveIntensity: 1.5, roughness: 0.1 },
    scope,
  );

  if (manifest.id === 'solara-bay') {
    const lh = new THREE.Group();
    lh.position.set(0, 0, -68);

    // Granite cliff rock apron around headland
    const rockHeroMat = mats.getStandardMaterial(
      'lh-granite',
      { color: '#6e7378', roughness: 0.92, metalness: 0.04 },
      scope,
    );
    for (const [rx, ry, rz, rad] of [
      [-3.6, -0.1, -2.4, 2.2],
      [3.8, -0.15, -2.1, 2.0],
      [0.4, -0.2, -4.4, 2.4],
      [-2.8, 0.05, 2.5, 1.5],
      [3.0, 0.05, 2.2, 1.6],
    ]) {
      const boulder = new THREE.Mesh(registry.track(new THREE.DodecahedronGeometry(rad, 0), scope), rockHeroMat);
      boulder.position.set(rx, ry, rz);
      boulder.scale.set(1.2, 0.65, 1.1);
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      lh.add(boulder);
    }

    // Dressed stone octagonal base & doorway
    const base = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(3.2, 3.7, 2.6, 8), scope), stoneHeroMat);
    base.position.y = 1.3;
    base.castShadow = true;
    base.receiveShadow = true;

    const baseCap = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(3.35, 3.35, 0.28, 8), scope), ironHeroMat);
    baseCap.position.y = 2.68;

    const doorFrame = new THREE.Mesh(registry.track(new THREE.BoxGeometry(1.4, 2.2, 0.45), scope), brassMat);
    doorFrame.position.set(0, 1.1, 3.25);

    // Tapered masonry tower + terracotta maritime daymark + belt rings
    const tower = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(1.75, 2.75, 14.8, 16), scope), stoneHeroMat);
    tower.position.y = 10.1;
    tower.castShadow = true;

    const stripe = new THREE.Mesh(
      registry.track(new THREE.CylinderGeometry(2.08, 2.36, 4.0, 16), scope),
      mats.getStandardMaterial('lh-stripe', { color: '#b84c37', roughness: 0.62 }, scope),
    );
    stripe.position.y = 10.2;

    const midRing = new THREE.Mesh(registry.track(new THREE.TorusGeometry(2.35, 0.14, 8, 24), scope), stoneHeroMat);
    midRing.rotation.x = Math.PI / 2;
    midRing.position.y = 7.4;

    // Cantilevered watch gallery deck & dark-iron perimeter railing
    const gallery = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(2.7, 2.0, 0.45, 16), scope), ironHeroMat);
    gallery.position.y = 17.65;
    const railRing = new THREE.Mesh(registry.track(new THREE.TorusGeometry(2.58, 0.06, 6, 24), scope), ironHeroMat);
    railRing.rotation.x = Math.PI / 2;
    railRing.position.y = 18.65;
    const postGeo = registry.track(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), scope);
    for (let p = 0; p < 12; p++) {
      const a = (p / 12) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, ironHeroMat);
      post.position.set(Math.cos(a) * 2.58, 18.25, Math.sin(a) * 2.58);
      lh.add(post);
    }

    // Glazed lantern room + vertical mullions + rotating Fresnel lens
    const lanternGlass = new THREE.Mesh(
      registry.track(new THREE.CylinderGeometry(1.42, 1.42, 2.2, 12), scope),
      beaconMat,
    );
    lanternGlass.position.y = 18.95;

    const mullionGeo = registry.track(new THREE.BoxGeometry(0.1, 2.25, 0.1), scope);
    for (let m = 0; m < 8; m++) {
      const a = (m / 8) * Math.PI * 2;
      const mul = new THREE.Mesh(mullionGeo, ironHeroMat);
      mul.position.set(Math.cos(a) * 1.46, 18.95, Math.sin(a) * 1.46);
      lh.add(mul);
    }

    // Patinated copper/brass conical roof + finial spire
    const copperMat = mats.getStandardMaterial(
      'lh-copper-dome',
      { color: '#467a73', roughness: 0.42, metalness: 0.45 },
      scope,
    );
    const cap = new THREE.Mesh(registry.track(new THREE.ConeGeometry(1.88, 1.9, 12), scope), copperMat);
    cap.position.y = 21.0;
    const spire = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.04, 0.08, 1.4, 6), scope), brassMat);
    spire.position.y = 22.45;

    lh.add(base, baseCap, doorFrame, tower, stripe, midRing, gallery, railRing, lanternGlass, cap, spire);
    group.add(lh);
  } else if (manifest.id === 'aether-district' || manifest.id === 'gateway') {
    const zPos = manifest.id === 'gateway' ? 0 : -46;
    const astrolabe = new THREE.Group();
    astrolabe.position.set(0, 0, zPos);
    const ped = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(3.2, 3.8, 1.4, 16), scope), stoneHeroMat);
    ped.position.y = 0.7;
    const ring1 = new THREE.Mesh(registry.track(new THREE.TorusGeometry(4.2, 0.24, 10, 32), scope), brassMat);
    ring1.position.y = 5.8;
    const ring2 = new THREE.Mesh(
      registry.track(new THREE.TorusGeometry(3.1, 0.18, 10, 28), scope),
      mats.getStandardMaterial('ae-teal-ring', { color: '#4db6ac', emissive: '#2c7a7b', emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.7 }, scope),
    );
    ring2.position.y = 5.8;
    const core = new THREE.Mesh(registry.track(new THREE.OctahedronGeometry(0.95, 0), scope), beaconMat);
    core.position.y = 5.8;
    astrolabe.add(ped, ring1, ring2, core);
    animatedParts.push({ object: ring1, speed: 0.35, axis: 'y' });
    animatedParts.push({ object: ring2, speed: -0.55, axis: 'z' });
    group.add(astrolabe);
  }

  // 7. World Gateway Transit Arch in every region
  const portal = new THREE.Group();
  portal.position.set(manifest.gatewayPortalPosition.x, 0, manifest.gatewayPortalPosition.z);
  const archMat = mats.getStandardMaterial(
    'portal-arch',
    { color: '#2b3645', roughness: 0.35, metalness: 0.7 },
    scope,
  );
  const archGlow = mats.getStandardMaterial(
    'portal-glow',
    { color: '#6ee7b7', emissive: '#38b2ac', emissiveIntensity: 1.1, roughness: 0.15 },
    scope,
  );
  const pColL = new THREE.Mesh(registry.track(new THREE.BoxGeometry(0.9, 5.2, 0.9), scope), archMat);
  pColL.position.set(-2.4, 2.6, 0);
  const pColR = pColL.clone();
  pColR.position.x = 2.4;
  const pTop = new THREE.Mesh(registry.track(new THREE.BoxGeometry(6.2, 0.9, 1.1), scope), brassMat);
  pTop.position.set(0, 5.4, 0);
  const pRing = new THREE.Mesh(registry.track(new THREE.TorusGeometry(1.4, 0.12, 8, 24), scope), archGlow);
  pRing.position.set(0, 2.8, 0);
  portal.add(pColL, pColR, pTop, pRing);
  animatedParts.push({ object: pRing, speed: 0.8, axis: 'z' });
  group.add(portal);

  // 8. Instanced foliage, streetlights, benches, bollards, rocks, umbrellas
  group.add(buildInstancedPropClusters(manifest.props, mats, registry, scope));

  // 9. Traffic Signals
  for (const sig of manifest.trafficSignals) {
    const sg = new THREE.Group();
    sg.position.set(sig.position.x, 0, sig.position.z);
    sg.rotation.y = sig.yaw;
    const pole = new THREE.Mesh(
      registry.track(new THREE.CylinderGeometry(0.1, 0.12, 4.0, 8), scope),
      archMat,
    );
    pole.position.y = 2.0;
    const head = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(0.42, 0.9, 0.38), scope),
      archMat,
    );
    head.position.y = 4.1;
    const bulbMat = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      emissive: '#22c55e',
      emissiveIntensity: 1.3,
      roughness: 0.2,
    });
    registry.track(bulbMat, scope);
    const bulb = new THREE.Mesh(registry.track(new THREE.SphereGeometry(0.16, 8, 8), scope), bulbMat);
    bulb.position.set(0, 4.1, 0.22);
    sg.add(pole, head, bulb);
    signalLights.set(sig.id, bulbMat);
    group.add(sg);
  }

  // 10. Collectibles (spinning keepsake emblems)
  for (const col of manifest.collectibles) {
    const cg = new THREE.Group();
    cg.position.set(col.position.x, 1.0, col.position.z);
    const gem = new THREE.Mesh(
      registry.track(new THREE.OctahedronGeometry(0.45, 0), scope),
      mats.getStandardMaterial(
        `col:${col.kind}`,
        { color: '#fbbf24', emissive: '#d97706', emissiveIntensity: 0.85, roughness: 0.2, metalness: 0.75 },
        scope,
      ),
    );
    cg.add(gem);
    animatedParts.push({ object: gem, speed: 1.6, axis: 'y' });
    collectibleMeshes.set(col.id, cg);
    group.add(cg);
  }

  return { group, waterMaterial, animatedParts, collectibleMeshes, signalLights };
}

export function buildInteriorScene(
  interior: InteriorDef,
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): THREE.Group {
  const group = new THREE.Group();
  const { x: w, y: h, z: d } = interior.roomSize;

  const floorTex = mats.getTimberAlbedoTexture(scope, interior.floorColor, 3, 4);
  const floorMat = mats.getStandardMaterial(
    `int-floor:${interior.id}`,
    {
      color: '#ffffff',
      map: floorTex,
      roughness: 0.58,
      metalness: 0.05,
      bumpMap: mats.getGrainBumpTexture('wood', 5),
      bumpScale: 0.04,
    },
    scope,
  );
  const wallTex = mats.getStuccoAlbedoTexture(scope, interior.wallColor);
  const wallMat = mats.getStandardMaterial(
    `int-wall:${interior.id}`,
    { color: '#ffffff', map: wallTex, roughness: 0.84, metalness: 0.02 },
    scope,
  );
  const wainscotMat = mats.getStandardMaterial(
    `int-wainscot:${interior.id}`,
    { color: '#473629', roughness: 0.72, metalness: 0.06 },
    scope,
  );
  const propMat = mats.getStandardMaterial(
    'int-prop-wood',
    { color: '#5c4330', roughness: 0.65, metalness: 0.08 },
    scope,
  );
  const brassMat = mats.getStandardMaterial(
    'int-brass',
    { color: '#d9a14a', roughness: 0.28, metalness: 0.78 },
    scope,
  );
  const lampGlowMat = mats.getStandardMaterial(
    'int-lamp-glow',
    { color: '#fff3d4', emissive: '#ffcf78', emissiveIntensity: 1.35, roughness: 0.15 },
    scope,
  );
  const windowDayMat = mats.getStandardMaterial(
    'int-day-window',
    { color: '#b4dced', emissive: '#89c4e1', emissiveIntensity: 0.65, roughness: 0.15 },
    scope,
  );

  // Floor
  const floor = new THREE.Mesh(registry.track(new THREE.PlaneGeometry(w, d), scope), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Warm area rug in center lounge
  const rug = new THREE.Mesh(
    registry.track(new THREE.PlaneGeometry(w * 0.45, d * 0.34), scope),
    mats.getStandardMaterial(`int-rug:${interior.id}`, { color: '#7c4536', roughness: 0.92 }, scope),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.015, 0.6);
  rug.receiveShadow = true;
  group.add(rug);

  // Ceiling + Timber Rafters
  const ceiling = new THREE.Mesh(registry.track(new THREE.PlaneGeometry(w, d), scope), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  group.add(ceiling);

  const beamGeo = registry.track(new THREE.BoxGeometry(w, 0.28, 0.28), scope);
  for (let bz = -d * 0.32; bz <= d * 0.35; bz += d * 0.32) {
    const beam = new THREE.Mesh(beamGeo, wainscotMat);
    beam.position.set(0, h - 0.16, bz);
    group.add(beam);
  }

  // Warm hanging brass pendant lamps
  const cordGeo = registry.track(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), scope);
  const shadeGeo = registry.track(new THREE.ConeGeometry(0.42, 0.28, 12), scope);
  const bulbGeo = registry.track(new THREE.SphereGeometry(0.14, 8, 8), scope);
  for (const [lx, lz] of [
    [-3.4, -0.5],
    [3.4, -0.5],
    [0, -3.5],
  ]) {
    const cord = new THREE.Mesh(cordGeo, brassMat);
    cord.position.set(lx, h - 0.65, lz);
    const shade = new THREE.Mesh(shadeGeo, brassMat);
    shade.position.set(lx, h - 1.32, lz);
    const bulb = new THREE.Mesh(bulbGeo, lampGlowMat);
    bulb.position.set(lx, h - 1.44, lz);
    group.add(cord, shade, bulb);
  }

  // Walls + Lower Timber Wainscoting + Daylight Windows
  const makeWall = (ww: number, wh: number, x: number, z: number, ry: number) => {
    const wall = new THREE.Mesh(registry.track(new THREE.BoxGeometry(ww, wh, 0.35), scope), wallMat);
    wall.position.set(x, wh * 0.5, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;

    const wainscot = new THREE.Mesh(registry.track(new THREE.BoxGeometry(ww, 1.05, 0.42), scope), wainscotMat);
    wainscot.position.set(x, 0.525, z);
    wainscot.rotation.y = ry;

    group.add(wall, wainscot);
  };
  makeWall(w, h, 0, -d * 0.5, 0);
  makeWall(w, h, 0, d * 0.5, 0);
  makeWall(d, h, -w * 0.5, 0, Math.PI / 2);
  makeWall(d, h, w * 0.5, 0, Math.PI / 2);

  // Daylight coastal windows on side walls
  const sideWinGeo = registry.track(new THREE.BoxGeometry(0.16, 2.2, 2.6), scope);
  const sideFrameGeo = registry.track(new THREE.BoxGeometry(0.24, 2.4, 2.8), scope);
  for (const sx of [-w * 0.5 + 0.15, w * 0.5 - 0.15]) {
    for (const wz of [-2.4, 2.0]) {
      const frame = new THREE.Mesh(sideFrameGeo, wainscotMat);
      frame.position.set(sx, 2.65, wz);
      const pane = new THREE.Mesh(sideWinGeo, windowDayMat);
      pane.position.set(sx + (sx < 0 ? 0.06 : -0.06), 2.65, wz);
      group.add(frame, pane);
    }
  }

  // Framed coastal wall art + menu board on north wall
  const menuBoard = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(3.8, 1.5, 0.12), scope),
    mats.getStandardMaterial('int-chalkboard', { color: '#1e2730', roughness: 0.85 }, scope),
  );
  menuBoard.position.set(0, 3.0, -d * 0.5 + 0.22);
  const menuFrame = new THREE.Mesh(registry.track(new THREE.BoxGeometry(4.05, 1.72, 0.08), scope), brassMat);
  menuFrame.position.set(0, 3.0, -d * 0.5 + 0.19);
  group.add(menuFrame, menuBoard);

  // Glowing Exit Doorway Frame on south wall
  const exitMat = mats.getStandardMaterial(
    'int-exit-door',
    { color: '#d9a14a', emissive: '#b47d2a', emissiveIntensity: 0.55, roughness: 0.3 },
    scope,
  );
  const exitFrame = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.55, 3.1, 0.3), scope), wainscotMat);
  exitFrame.position.set(interior.exitLocal.x, 1.55, interior.exitLocal.z + 0.62);
  const exitDoor = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.15, 2.85, 0.25), scope), exitMat);
  exitDoor.position.set(interior.exitLocal.x, 1.42, interior.exitLocal.z + 0.6);
  group.add(exitFrame, exitDoor);

  // Detailed Interior Props
  for (const p of interior.props) {
    const pg = new THREE.Group();
    pg.position.set(p.position.x, 0, p.position.z);
    pg.rotation.y = p.yaw;
    const mat = p.color
      ? mats.getStandardMaterial(`iprop:${p.color}`, { color: p.color, roughness: 0.55, metalness: 0.12 }, scope)
      : propMat;

    if (p.kind === 'counter') {
      const base = new THREE.Mesh(registry.track(new THREE.BoxGeometry(4.6, 1.05, 1.25), scope), mat);
      base.position.y = 0.525;
      base.castShadow = true;
      const top = new THREE.Mesh(
        registry.track(new THREE.BoxGeometry(4.8, 0.1, 1.4), scope),
        mats.getStandardMaterial('int-counter-top', { color: '#ded4c3', roughness: 0.35 }, scope),
      );
      top.position.y = 1.1;
      // Espresso machine & ceramic cup stack on counter
      const espresso = new THREE.Mesh(registry.track(new THREE.BoxGeometry(0.95, 0.55, 0.65), scope), brassMat);
      espresso.position.set(-1.3, 1.42, 0);
      const pastryCase = new THREE.Mesh(
        registry.track(new THREE.BoxGeometry(1.1, 0.48, 0.65), scope),
        mats.getGlassMaterial(scope, '#a8d5e5'),
      );
      pastryCase.position.set(1.25, 1.38, 0);
      // 3 Counter bar stools
      const stoolSeatGeo = registry.track(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), scope);
      const stoolLegGeo = registry.track(new THREE.CylinderGeometry(0.05, 0.16, 0.72, 8), scope);
      for (const sx of [-1.4, 0, 1.4]) {
        const seat = new THREE.Mesh(stoolSeatGeo, mat);
        seat.position.set(sx, 0.76, 1.18);
        const leg = new THREE.Mesh(stoolLegGeo, brassMat);
        leg.position.set(sx, 0.36, 1.18);
        pg.add(seat, leg);
      }
      pg.add(base, top, espresso, pastryCase);
    } else if (p.kind === 'table') {
      const top = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.92, 0.92, 0.09, 16), scope), mat);
      top.position.y = 0.78;
      top.castShadow = true;
      const leg = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.09, 0.28, 0.76, 10), scope), brassMat);
      leg.position.y = 0.38;
      // Ceramic coffee mugs on table
      const mugGeo = registry.track(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 8), scope);
      const mugMat = mats.getStandardMaterial('int-mug', { color: '#f3ede0', roughness: 0.2 }, scope);
      const m1 = new THREE.Mesh(mugGeo, mugMat);
      m1.position.set(-0.28, 0.88, 0.15);
      const m2 = new THREE.Mesh(mugGeo, mugMat);
      m2.position.set(0.32, 0.88, -0.18);
      // Paired bistro chairs
      const cSeatGeo = registry.track(new THREE.BoxGeometry(0.46, 0.07, 0.46), scope);
      const cBackGeo = registry.track(new THREE.BoxGeometry(0.46, 0.48, 0.07), scope);
      const cLegGeo = registry.track(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), scope);
      for (const side of [-1, 1]) {
        const cx = side * 1.28;
        const cSeat = new THREE.Mesh(cSeatGeo, mat);
        cSeat.position.set(cx, 0.46, 0);
        const cBack = new THREE.Mesh(cBackGeo, mat);
        cBack.position.set(cx + side * 0.2, 0.72, 0);
        const cLeg = new THREE.Mesh(cLegGeo, brassMat);
        cLeg.position.set(cx, 0.225, 0);
        pg.add(cSeat, cBack, cLeg);
      }
      pg.add(top, leg, m1, m2);
    } else if (p.kind === 'bookshelf') {
      const shelf = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.6, 2.8, 0.65), scope), mat);
      shelf.position.y = 1.4;
      shelf.castShadow = true;
      pg.add(shelf);
    } else if (p.kind === 'display' || p.kind === 'terminal') {
      const base = new THREE.Mesh(registry.track(new THREE.BoxGeometry(1.6, 1.1, 1.1), scope), mat);
      base.position.y = 0.55;
      const screen = new THREE.Mesh(
        registry.track(new THREE.BoxGeometry(1.2, 0.8, 0.12), scope),
        mats.getStandardMaterial(
          'term-glow',
          { color: '#6ee7b7', emissive: '#38b2ac', emissiveIntensity: 0.9, roughness: 0.2 },
          scope,
        ),
      );
      screen.position.set(0, 1.55, 0);
      pg.add(base, screen);
    } else if (p.kind === 'sofa') {
      const seat = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.4, 0.45, 0.95), scope), mat);
      seat.position.y = 0.32;
      seat.castShadow = true;
      const back = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.4, 0.75, 0.25), scope), mat);
      back.position.set(0, 0.72, -0.35);
      const armGeo = registry.track(new THREE.BoxGeometry(0.24, 0.55, 0.95), scope);
      const armL = new THREE.Mesh(armGeo, mat);
      armL.position.set(-1.12, 0.45, 0);
      const armR = new THREE.Mesh(armGeo, mat);
      armR.position.set(1.12, 0.45, 0);
      pg.add(seat, back, armL, armR);
    } else if (p.kind === 'plant') {
      const pot = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.32, 0.24, 0.55, 10), scope), mat);
      pot.position.y = 0.275;
      const leaf = new THREE.Mesh(
        registry.track(new THREE.DodecahedronGeometry(0.55, 0), scope),
        mats.getStandardMaterial('int-leaf', { color: '#3e7348', roughness: 0.75 }, scope),
      );
      leaf.position.y = 0.9;
      pg.add(pot, leaf);
    }
    group.add(pg);
  }

  return group;
}
