import * as THREE from 'three';
import { InteriorDef, RegionManifest } from '../../shared/types/world';
import { ResourceRegistry } from '../core/ResourceRegistry';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { buildBuildingMesh, buildInstancedPropClusters } from './CompositeBuilders';

export interface BuiltRegionScene {
  group: THREE.Group;
  waterMaterial: THREE.MeshStandardMaterial | null;
  animatedParts: Array<{ object: THREE.Object3D; speed: number; axis: 'y' | 'z' }>;
  collectibleMeshes: Map<string, THREE.Object3D>;
  signalLights: Map<string, THREE.MeshStandardMaterial>;
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

  // 1. Extended outer horizon terrain (avoids floating box void)
  const groundBump = mats.getGrainBumpTexture('grass', 28);
  const groundTex = mats.getTerrainAlbedoTexture(scope, manifest.palette.ground);
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

  // Outer perimeter ridge/hills beyond playable bounds
  const ridgeGeo = registry.track(new THREE.RingGeometry(manifest.boundsRadius + 6, 360, 40, 2), scope);
  ridgeGeo.rotateX(-Math.PI / 2);
  const ridgePos = ridgeGeo.attributes.position;
  for (let i = 0; i < ridgePos.count; i++) {
    const x = ridgePos.getX(i);
    const z = ridgePos.getZ(i);
    const dist = Math.hypot(x, z);
    if (dist > manifest.boundsRadius + 14) {
      const wave = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 7 + (dist - manifest.boundsRadius) * 0.07;
      // Keep north coast open when coastal ocean is present
      if (manifest.hasCoastalOcean && z < -45) {
        ridgePos.setY(i, -2.5);
      } else {
        ridgePos.setY(i, Math.max(0, wave));
      }
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

  // 2. Central plaza cobblestone/paver disk + raised stone rim & centerpiece
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

  // Central Plaza Focal Landmark (fountain / monument)
  if (manifest.id !== 'gateway') {
    const basinMat = mats.getStandardMaterial(
      `fountain-stone:${manifest.id}`,
      { color: '#c8c2b6', roughness: 0.68, metalness: 0.08 },
      scope,
    );
    const poolMat = mats.getStandardMaterial(
      `fountain-water:${manifest.id}`,
      { color: manifest.palette.water, roughness: 0.14, metalness: 0.25 },
      scope,
    );
    const basin = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(3.2, 3.6, 0.75, 20), scope), basinMat);
    basin.position.y = 0.42;
    basin.castShadow = true;
    const pool = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(2.75, 2.75, 0.12, 20), scope), poolMat);
    pool.position.y = 0.76;
    const spire = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.45, 0.75, 2.4, 12), scope), basinMat);
    spire.position.y = 1.65;
    const finial = new THREE.Mesh(registry.track(new THREE.OctahedronGeometry(0.62, 0), scope), rimMat);
    finial.position.y = 3.25;
    animatedParts.push({ object: finial, speed: 0.65, axis: 'y' });
    group.add(basin, pool, spire, finial);
  }

  // 3. Road ring & avenues (polygonOffset prevents intersection shimmer)
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

  // 4. Water (Coastal ocean / Alpine lake / Waterfall) with PBR onBeforeCompile ripples
  if (manifest.hasCoastalOcean || manifest.hasAlpineLake) {
    waterMaterial = new THREE.MeshStandardMaterial({
      color: manifest.palette.water,
      roughness: 0.14,
      metalness: 0.25,
      envMapIntensity: 1.4,
    });
    waterMaterial.userData.uTime = { value: 0 };
    waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterMaterial!.userData.uTime;
      shader.vertexShader =
        `uniform float uTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.y += sin(transformed.x * 0.22 + uTime * 1.5) * 0.14 + cos(transformed.z * 0.18 + uTime * 1.2) * 0.11;`,
        );
    };
    registry.track(waterMaterial, scope);

    if (manifest.hasCoastalOcean) {
      const seaGeo = registry.track(new THREE.PlaneGeometry(520, 260, 40, 24), scope);
      seaGeo.rotateX(-Math.PI / 2);
      const sea = new THREE.Mesh(seaGeo, waterMaterial);
      sea.position.set(0, -0.35, -200);
      group.add(sea);

      // Wooden Marina Pier
      const pierMat = mats.getStandardMaterial(
        'sb-pier-wood',
        { color: '#7a5a3d', roughness: 0.82, metalness: 0.04, bumpMap: mats.getGrainBumpTexture('wood', 6) },
        scope,
      );
      const pier = new THREE.Mesh(registry.track(new THREE.BoxGeometry(7, 0.45, 28), scope), pierMat);
      pier.position.set(28, 0.35, -58);
      pier.castShadow = true;
      pier.receiveShadow = true;
      group.add(pier);
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

  // 5. Buildings
  for (const b of manifest.buildings) {
    group.add(buildBuildingMesh(b, mats, registry, scope));
  }

  // 6. Signature Hero Landmarks (multi-part composite silhouettes)
  const brassMat = mats.getStandardMaterial(
    'hero-brass',
    { color: '#e0a952', roughness: 0.25, metalness: 0.82 },
    scope,
  );
  const stoneHeroMat = mats.getStandardMaterial(
    'hero-stone',
    { color: '#e5dfd5', roughness: 0.65, metalness: 0.06 },
    scope,
  );
  const beaconMat = mats.getStandardMaterial(
    'hero-beacon',
    { color: '#fff3c4', emissive: '#ffcf6e', emissiveIntensity: 1.4, roughness: 0.1 },
    scope,
  );

  if (manifest.id === 'solara-bay') {
    const lh = new THREE.Group();
    lh.position.set(0, 0, -68);
    const base = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(3.2, 3.8, 2.2, 12), scope), stoneHeroMat);
    base.position.y = 1.1;
    const tower = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(1.7, 2.7, 15, 14), scope), stoneHeroMat);
    tower.position.y = 9.5;
    tower.castShadow = true;
    const stripe = new THREE.Mesh(
      registry.track(new THREE.CylinderGeometry(2.05, 2.25, 3.6, 14), scope),
      mats.getStandardMaterial('lh-stripe', { color: '#c4513b', roughness: 0.5 }, scope),
    );
    stripe.position.y = 9.5;
    const lantern = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 12), scope), beaconMat);
    lantern.position.y = 18.0;
    const cap = new THREE.Mesh(registry.track(new THREE.ConeGeometry(1.9, 1.8, 12), scope), brassMat);
    cap.position.y = 20.0;
    lh.add(base, tower, stripe, lantern, cap);
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

  // 8. Instanced foliage, streetlights, benches, bollards, rocks
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

  const floorMat = mats.getStandardMaterial(
    `int-floor:${interior.id}`,
    {
      color: interior.floorColor,
      roughness: 0.62,
      metalness: 0.05,
      bumpMap: mats.getGrainBumpTexture('wood', 5),
      bumpScale: 0.04,
    },
    scope,
  );
  const wallMat = mats.getStandardMaterial(
    `int-wall:${interior.id}`,
    { color: interior.wallColor, roughness: 0.8, metalness: 0.02 },
    scope,
  );
  const propMat = mats.getStandardMaterial(
    'int-prop-wood',
    { color: '#5c4330', roughness: 0.65, metalness: 0.08 },
    scope,
  );

  // Floor
  const floor = new THREE.Mesh(registry.track(new THREE.PlaneGeometry(w, d), scope), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(registry.track(new THREE.PlaneGeometry(w, d), scope), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  group.add(ceiling);

  // Walls (north, south, east, west)
  const makeWall = (ww: number, wh: number, x: number, z: number, ry: number) => {
    const wall = new THREE.Mesh(registry.track(new THREE.BoxGeometry(ww, wh, 0.35), scope), wallMat);
    wall.position.set(x, wh * 0.5, z);
    wall.rotation.y = ry;
    group.add(wall);
  };
  makeWall(w, h, 0, -d * 0.5, 0);
  makeWall(w, h, 0, d * 0.5, 0);
  makeWall(d, h, -w * 0.5, 0, Math.PI / 2);
  makeWall(d, h, w * 0.5, 0, Math.PI / 2);

  // Glowing Exit Doorway Frame on south wall
  const exitMat = mats.getStandardMaterial(
    'int-exit-door',
    { color: '#e0a952', emissive: '#b47d2a', emissiveIntensity: 0.6, roughness: 0.3 },
    scope,
  );
  const exitDoor = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.2, 2.8, 0.25), scope), exitMat);
  exitDoor.position.set(interior.exitLocal.x, 1.4, interior.exitLocal.z + 0.6);
  group.add(exitDoor);

  // Interior furniture props
  for (const p of interior.props) {
    const pg = new THREE.Group();
    pg.position.set(p.position.x, 0, p.position.z);
    pg.rotation.y = p.yaw;
    const mat = p.color
      ? mats.getStandardMaterial(`iprop:${p.color}`, { color: p.color, roughness: 0.55, metalness: 0.12 }, scope)
      : propMat;

    if (p.kind === 'counter') {
      const m = new THREE.Mesh(registry.track(new THREE.BoxGeometry(4.4, 1.1, 1.2), scope), mat);
      m.position.y = 0.55;
      pg.add(m);
    } else if (p.kind === 'table') {
      const top = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 14), scope), mat);
      top.position.y = 0.78;
      const leg = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.1, 0.25, 0.78, 10), scope), mat);
      leg.position.y = 0.39;
      pg.add(top, leg);
    } else if (p.kind === 'bookshelf') {
      const shelf = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.6, 2.8, 0.65), scope), mat);
      shelf.position.y = 1.4;
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
      const back = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.4, 0.75, 0.25), scope), mat);
      back.position.set(0, 0.72, -0.35);
      pg.add(seat, back);
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
