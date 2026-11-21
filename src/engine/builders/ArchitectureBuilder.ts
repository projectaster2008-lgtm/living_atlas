import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BuildingDef } from '../../shared/types/world';
import { ResourceRegistry } from '../core/ResourceRegistry';
import { MaterialLibrary } from '../materials/MaterialLibrary';

/**
 * Helper to normalize any BufferGeometry (convert to non-indexed, ensure uv & normal)
 * and push into a material bucket before merging into a single draw call.
 */
function pushGeom(
  bucket: THREE.BufferGeometry[],
  source: THREE.BufferGeometry,
  tx = 0,
  ty = 0,
  tz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): void {
  const g = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();

  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (rx !== 0) g.rotateX(rx);
  if (ry !== 0) g.rotateY(ry);
  if (rz !== 0) g.rotateZ(rz);
  if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);

  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  // Delete extra attributes like tangent/color if mismatched across parts
  for (const attr of Object.keys(g.attributes)) {
    if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') {
      g.deleteAttribute(attr);
    }
  }
  bucket.push(g);
}

function finalizeBucket(
  bucket: THREE.BufferGeometry[],
  mat: THREE.Material,
  registry: ResourceRegistry,
  scope: string,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh | null {
  if (bucket.length === 0) return null;
  const merged = mergeGeometries(bucket, false);
  for (const b of bucket) b.dispose();
  if (!merged) return null;
  registry.track(merged, scope);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/**
 * Procedural Architectural Building Pipeline:
 * 1. Plan & Massing (stepped stone plinth, textured walls, corner pilasters, stringcourse belt)
 * 2. Exposed-Surface Openings (per-bay framed recessed windows with sills, mullions & shutters)
 * 3. Style-Aware Roofs (aspect-matched overhanging pitched terracotta/timber roofs + chimneys, or stepped urban parapets)
 * 4. Grounded Storefront / Entrance Assembly (threshold step, pilaster portal, awning + diagonal brackets, illuminated doorway)
 * 5. Merged BufferGeometry per material slot (~5-6 draw calls per building)
 */
export function buildArchitecturalBuilding(
  b: BuildingDef,
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(b.position.x, b.position.y, b.position.z);
  group.rotation.y = b.yaw;

  const isTimber = b.style === 'timber-cabin' || b.style === 'alpine-lodge';
  const isPitchedRoof =
    b.style === 'coastal-villa' ||
    b.style === 'coastal-cafe' ||
    b.style === 'boathouse' ||
    b.style === 'timber-cabin' ||
    b.style === 'alpine-lodge';
  const isCoastal =
    b.style === 'coastal-villa' || b.style === 'coastal-cafe' || b.style === 'boathouse';

  const wallTex = isTimber
    ? mats.getTimberAlbedoTexture(scope, b.primaryColor, 2, 2)
    : mats.getStuccoAlbedoTexture(scope, b.primaryColor);
  const wallBump = mats.getGrainBumpTexture(isTimber ? 'wood' : 'stone', 3);

  const wallMat = mats.getStandardMaterial(
    `b-wall:${b.primaryColor}:${b.style}`,
    {
      color: '#ffffff',
      map: wallTex,
      roughness: isTimber ? 0.8 : 0.88,
      metalness: 0.02,
      envMapIntensity: 0.36,
      bumpMap: wallBump,
      bumpScale: 0.04,
    },
    scope,
  );

  const trimMat = mats.getStandardMaterial(
    `b-trim:${b.trimColor}`,
    {
      color: b.trimColor,
      roughness: 0.56,
      metalness: 0.16,
      envMapIntensity: 0.55,
    },
    scope,
  );

  const stoneTrimMat = mats.getStandardMaterial(
    `b-stone-trim:${b.style}`,
    {
      color: '#d4cab8',
      roughness: 0.8,
      metalness: 0.03,
      envMapIntensity: 0.38,
      bumpMap: mats.getGrainBumpTexture('stone', 4),
      bumpScale: 0.035,
    },
    scope,
  );

  const roofTex = mats.getRoofTileAlbedoTexture(scope, b.roofColor);
  const roofBump = mats.getGrainBumpTexture('roof', 3);
  const roofMat = mats.getStandardMaterial(
    `b-roof:${b.roofColor}`,
    {
      color: '#ffffff',
      map: roofTex,
      roughness: 0.74,
      metalness: 0.05,
      envMapIntensity: 0.45,
      bumpMap: roofBump,
      bumpScale: 0.055,
    },
    scope,
  );

  const windowMat = mats.getStandardMaterial(
    `b-win:${b.style}:${Boolean(b.interiorId)}`,
    {
      color: b.style.includes('urban') || b.style.includes('aether') ? '#4f7a96' : '#355166',
      roughness: 0.12,
      metalness: 0.42,
      emissive: b.interiorId ? '#ffd285' : '#2a475c',
      emissiveIntensity: b.interiorId ? 0.36 : 0.14,
    },
    scope,
  );

  const doorMat = b.interiorId
    ? mats.getStandardMaterial(
        'door-active',
        { color: '#2b3a4a', emissive: '#e0a952', emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.15 },
        scope,
      )
    : mats.getStandardMaterial(
        `door-wood:${b.roofColor}`,
        { color: '#4a3527', roughness: 0.65, metalness: 0.08 },
        scope,
      );

  const wallParts: THREE.BufferGeometry[] = [];
  const trimParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const roofParts: THREE.BufferGeometry[] = [];
  const glassParts: THREE.BufferGeometry[] = [];

  const { x: w, y: h, z: d } = b.size;

  // Determine which face holds the primary doorway
  const doorOffset = b.doorLocalOffset ?? { x: 0, y: 0, z: d * 0.5 + 0.1 };
  const doorFaceZ = Math.abs(doorOffset.z) >= Math.abs(doorOffset.x);
  const doorSide: 'front' | 'back' | 'left' | 'right' = doorFaceZ
    ? doorOffset.z >= 0
      ? 'front'
      : 'back'
    : doorOffset.x >= 0
      ? 'right'
      : 'left';

  // 1. Stone Watertable Plinth + Chamfered Sill Cap
  pushGeom(stoneParts, new THREE.BoxGeometry(w + 0.42, 0.56, d + 0.42), 0, 0.28, 0);
  pushGeom(stoneParts, new THREE.BoxGeometry(w + 0.52, 0.12, d + 0.52), 0, 0.58, 0);

  // 2. Primary Wall Volume
  const wallBottom = 0.58;
  const wallH = Math.max(2.5, h - wallBottom);
  pushGeom(wallParts, new THREE.BoxGeometry(w, wallH, d), 0, wallBottom + wallH * 0.5, 0);

  // Corner architectural pilasters framing each corner cleanly
  const pilW = 0.46;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushGeom(
        stoneParts,
        new THREE.BoxGeometry(pilW, wallH + 0.12, pilW),
        sx * (w * 0.5 - pilW * 0.25),
        wallBottom + wallH * 0.5,
        sz * (d * 0.5 - pilW * 0.25),
      );
    }
  }

  // Mid-floor belt course on taller multi-story buildings
  if (h >= 8.2) {
    pushGeom(stoneParts, new THREE.BoxGeometry(w + 0.28, 0.22, d + 0.28), 0, 4.4, 0);
  }

  // Eave Cornice Crown
  pushGeom(stoneParts, new THREE.BoxGeometry(w + 0.56, 0.34, d + 0.56), 0, h - 0.08, 0);

  // 3. Recessed Window Bays across all 4 exterior faces
  const floors = Math.max(1, Math.floor((h - 0.8) / 3.6));
  const addWindowBay = (
    cx: number,
    cy: number,
    cz: number,
    ry: number,
    winW: number,
    winH: number,
  ) => {
    // Back glass pane proud of wall by 0.04, frame & sill projecting out to 0.18
    const addLocal = (
      bucket: THREE.BufferGeometry[],
      geo: THREE.BufferGeometry,
      lx: number,
      ly: number,
      lz: number,
    ) => {
      geo.translate(lx, ly, lz);
      pushGeom(bucket, geo, cx, cy, cz, 0, ry, 0);
    };

    // Glass glazing
    addLocal(glassParts, new THREE.BoxGeometry(winW, winH, 0.06), 0, 0, 0.03);
    // Vertical center mullion + horizontal transom
    addLocal(stoneParts, new THREE.BoxGeometry(0.08, winH, 0.1), 0, 0, 0.06);
    addLocal(stoneParts, new THREE.BoxGeometry(winW, 0.07, 0.1), 0, winH * 0.14, 0.06);
    // Left / right casing jambs
    addLocal(stoneParts, new THREE.BoxGeometry(0.12, winH + 0.12, 0.13), -winW * 0.5 - 0.05, 0, 0.05);
    addLocal(stoneParts, new THREE.BoxGeometry(0.12, winH + 0.12, 0.13), winW * 0.5 + 0.05, 0, 0.05);
    // Projecting stone sill + lintel
    addLocal(stoneParts, new THREE.BoxGeometry(winW + 0.42, 0.14, 0.24), 0, -winH * 0.5 - 0.07, 0.09);
    addLocal(stoneParts, new THREE.BoxGeometry(winW + 0.38, 0.18, 0.2), 0, winH * 0.5 + 0.09, 0.08);

    // Coastal louvered shutters flanking windows
    if (isCoastal) {
      const shW = Math.min(0.46, winW * 0.34);
      addLocal(trimParts, new THREE.BoxGeometry(shW, winH, 0.07), -winW * 0.5 - 0.14 - shW * 0.5, 0, 0.05);
      addLocal(trimParts, new THREE.BoxGeometry(shW, winH, 0.07), winW * 0.5 + 0.14 + shW * 0.5, 0, 0.05);
    }
  };

  const populateFaceWindows = (
    side: 'front' | 'back' | 'left' | 'right',
    faceSpan: number,
    halfNormal: number,
    ry: number,
  ) => {
    const bays = Math.max(1, Math.min(4, Math.floor((faceSpan - 2.2) / 3.2)));
    const spacing = (faceSpan - 2.4) / bays;
    const winW = Math.min(1.45, spacing * 0.52);
    const winH = 1.48;

    for (let f = 0; f < floors; f++) {
      const wy = 2.45 + f * 3.55;
      if (wy + winH * 0.5 > h - 0.65) break;

      for (let i = 0; i < bays; i++) {
        const u = (i - (bays - 1) * 0.5) * spacing;
        // Skip center bay on ground floor where entrance portal sits
        if (f === 0 && side === doorSide && Math.abs(u) < 1.9) continue;

        const nx = side === 'right' ? halfNormal : side === 'left' ? -halfNormal : u;
        const nz = side === 'front' ? halfNormal : side === 'back' ? -halfNormal : -u;
        addWindowBay(nx, wy, nz, ry, winW, winH);
      }
    }
  };

  populateFaceWindows('front', w, d * 0.5, 0);
  populateFaceWindows('back', w, d * 0.5, Math.PI);
  populateFaceWindows('right', d, w * 0.5, Math.PI / 2);
  populateFaceWindows('left', d, w * 0.5, -Math.PI / 2);

  // 4. Aspect-Ratio-Matched Roof Silhouettes
  if (isPitchedRoof) {
    const roofH = isTimber ? Math.min(3.6, Math.min(w, d) * 0.34) : Math.min(2.75, Math.min(w, d) * 0.25);
    // 4-sided cone rotated PI/4 has half-width = radius / SQRT2; scale to match w & d + eave overhang
    const hipGeo = new THREE.ConeGeometry(1, roofH, 4);
    hipGeo.rotateY(Math.PI / 4);
    pushGeom(
      roofParts,
      hipGeo,
      0,
      h + roofH * 0.5 - 0.04,
      0,
      0,
      0,
      0,
      (w + 1.05) / Math.SQRT2,
      1,
      (d + 1.05) / Math.SQRT2,
    );

    // Ridge beam cap
    const ridgeLen = Math.max(0.8, Math.abs(w - d) * 0.55);
    pushGeom(
      stoneParts,
      new THREE.BoxGeometry(w >= d ? ridgeLen : 0.32, 0.24, d > w ? ridgeLen : 0.32),
      0,
      h + roofH - 0.06,
      0,
    );

    // Coastal masonry chimney on roof slope
    pushGeom(
      stoneParts,
      new THREE.BoxGeometry(0.9, roofH * 0.85 + 0.9, 0.9),
      w * 0.24,
      h + roofH * 0.45,
      -d * 0.18,
    );
    pushGeom(
      roofParts,
      new THREE.BoxGeometry(1.08, 0.16, 1.08),
      w * 0.24,
      h + roofH * 0.88 + 0.48,
      -d * 0.18,
    );
  } else {
    // Urban / Aether stepped architectural parapet & rooftop penthouse/skylight
    pushGeom(roofParts, new THREE.BoxGeometry(w + 0.42, 0.55, d + 0.42), 0, h + 0.22, 0);
    pushGeom(stoneParts, new THREE.BoxGeometry(w + 0.52, 0.16, d + 0.52), 0, h + 0.52, 0);
    pushGeom(wallParts, new THREE.BoxGeometry(w * 0.48, 1.15, d * 0.44), 0, h + 0.95, 0);
    pushGeom(glassParts, new THREE.BoxGeometry(w * 0.4, 0.65, d * 0.46), 0, h + 0.98, 0);
    pushGeom(trimParts, new THREE.BoxGeometry(w * 0.52, 0.18, d * 0.48), 0, h + 1.56, 0);
  }

  // 5. Grounded Storefront Portal & Supported Awning Assembly
  const portalGroup = new THREE.Group();
  if (doorFaceZ) {
    portalGroup.position.set(0, 0, Math.sign(doorOffset.z || 1) * (d * 0.5));
    if (doorOffset.z < 0) portalGroup.rotation.y = Math.PI;
  } else {
    portalGroup.position.set(Math.sign(doorOffset.x) * (w * 0.5), 0, 0);
    portalGroup.rotation.y = doorOffset.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  const pStep = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.9, 0.18, 0.95), scope), stoneTrimMat);
  pStep.position.set(0, 0.09, 0.42);
  pStep.receiveShadow = true;

  const jambGeo = registry.track(new THREE.BoxGeometry(0.32, 3.25, 0.38), scope);
  const pJambL = new THREE.Mesh(jambGeo, stoneTrimMat);
  pJambL.position.set(-1.24, 1.62, 0.14);
  pJambL.castShadow = true;
  const pJambR = new THREE.Mesh(jambGeo, stoneTrimMat);
  pJambR.position.set(1.24, 1.62, 0.14);
  pJambR.castShadow = true;

  const pLintel = new THREE.Mesh(registry.track(new THREE.BoxGeometry(3.15, 0.38, 0.46), scope), stoneTrimMat);
  pLintel.position.set(0, 3.38, 0.18);

  const pDoor = new THREE.Mesh(registry.track(new THREE.BoxGeometry(2.16, 3.05, 0.16), scope), doorMat);
  pDoor.position.set(0, 1.56, 0.05);

  // Sloped timber/canvas awning + two diagonal iron brackets
  const awningW = b.interiorId ? 3.8 : 3.1;
  const pAwning = new THREE.Mesh(registry.track(new THREE.BoxGeometry(awningW, 0.14, 1.65), scope), trimMat);
  pAwning.position.set(0, 3.45, 0.85);
  pAwning.rotation.x = 0.22;
  pAwning.castShadow = true;

  const bracketGeo = registry.track(new THREE.BoxGeometry(0.08, 0.08, 1.25), scope);
  for (const bx of [-awningW * 0.38, awningW * 0.38]) {
    const br = new THREE.Mesh(bracketGeo, stoneTrimMat);
    br.position.set(bx, 3.05, 0.56);
    br.rotation.x = -0.52;
    portalGroup.add(br);
  }

  // Shopfront signboard above awning for enterable buildings
  if (b.interiorId) {
    const signBoard = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(3.2, 0.55, 0.16), scope),
      roofMat,
    );
    signBoard.position.set(0, 4.02, 0.16);
    const lantern = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(0.22, 0.34, 0.22), scope),
      mats.getStandardMaterial(
        'portal-lantern',
        { color: '#fff3d1', emissive: '#ffcf75', emissiveIntensity: 1.15, roughness: 0.2 },
        scope,
      ),
    );
    lantern.position.set(1.62, 2.75, 0.24);
    portalGroup.add(signBoard, lantern);
  }

  portalGroup.add(pStep, pJambL, pJambR, pLintel, pDoor, pAwning);
  group.add(portalGroup);

  const wallMesh = finalizeBucket(wallParts, wallMat, registry, scope, true, true);
  const stoneMesh = finalizeBucket(stoneParts, stoneTrimMat, registry, scope, true, true);
  const trimMesh = finalizeBucket(trimParts, trimMat, registry, scope, true, true);
  const roofMesh = finalizeBucket(roofParts, roofMat, registry, scope, true, true);
  const glassMesh = finalizeBucket(glassParts, windowMat, registry, scope, false, true);

  if (wallMesh) group.add(wallMesh);
  if (stoneMesh) group.add(stoneMesh);
  if (trimMesh) group.add(trimMesh);
  if (roofMesh) group.add(roofMesh);
  if (glassMesh) group.add(glassMesh);

  return group;
}
