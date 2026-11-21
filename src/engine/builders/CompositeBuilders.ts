import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BuildingDef, NpcProfile, PropClusterDef, VehicleSpec } from '../../shared/types/world';
import { ResourceRegistry } from '../core/ResourceRegistry';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { buildArchitecturalBuilding } from './ArchitectureBuilder';

export interface ActorRigParts {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
}

export interface VehicleMeshParts {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
}

function normalizeAndColor(
  source: THREE.BufferGeometry,
  hexColor: string | null,
  tx = 0,
  ty = 0,
  tz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  if (rx !== 0) g.rotateX(rx);
  if (ry !== 0) g.rotateY(ry);
  if (rz !== 0) g.rotateZ(rz);
  if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const attr of Object.keys(g.attributes)) {
    if (attr !== 'position' && attr !== 'normal' && attr !== 'uv' && attr !== 'color') {
      g.deleteAttribute(attr);
    }
  }
  if (hexColor) {
    const c = new THREE.Color(hexColor);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return g;
}

function mergeClusterParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? new THREE.BoxGeometry(0.5, 0.5, 0.5);
}

export function createContactShadow(
  mats: MaterialLibrary,
  radius: number,
  registry: ResourceRegistry,
  scope: string,
): THREE.Mesh {
  const geo = registry.track(new THREE.CircleGeometry(radius, 20), scope);
  const mesh = new THREE.Mesh(geo, mats.getContactShadowMaterial());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.018;
  return mesh;
}

export function buildActorRig(
  appearance: NpcProfile['appearance'],
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
  isPlayer = false,
): ActorRigParts {
  const root = new THREE.Group();
  root.scale.setScalar(appearance.heightScale);

  const shadow = createContactShadow(mats, 0.52, registry, scope);
  root.add(shadow);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const coatMat = mats.getStandardMaterial(
    `coat:${appearance.coatColor}`,
    { color: appearance.coatColor, roughness: 0.78, metalness: 0.05 },
    scope,
  );
  const accentMat = mats.getStandardMaterial(
    `accent:${appearance.accentColor}`,
    { color: appearance.accentColor, roughness: 0.45, metalness: 0.22 },
    scope,
  );
  const pantsMat = mats.getStandardMaterial(
    `pants:${appearance.pantsColor}`,
    { color: appearance.pantsColor, roughness: 0.85, metalness: 0.02 },
    scope,
  );
  const skinMat = mats.getStandardMaterial(
    `skin:${appearance.skinTone}`,
    { color: appearance.skinTone, roughness: 0.68, metalness: 0.0 },
    scope,
  );
  const hairMat = mats.getStandardMaterial(
    `hair:${appearance.hairColor}`,
    { color: appearance.hairColor, roughness: 0.75, metalness: 0.04 },
    scope,
  );
  const bootMat = mats.getStandardMaterial(
    'boot-dark',
    { color: '#22262c', roughness: 0.48, metalness: 0.15 },
    scope,
  );

  // Legs (hip pivot at y=0.78)
  const legGeo = registry.track(new THREE.CapsuleGeometry(0.105, 0.52, 4, 8), scope);
  const shoeGeo = registry.track(new THREE.BoxGeometry(0.18, 0.12, 0.28), scope);

  const makeLeg = (xOffset: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.78, 0);
    const legMesh = new THREE.Mesh(legGeo, pantsMat);
    legMesh.position.y = -0.34;
    legMesh.castShadow = true;
    const shoe = new THREE.Mesh(shoeGeo, bootMat);
    shoe.position.set(0, -0.71, 0.04);
    shoe.castShadow = true;
    legPivot.add(legMesh, shoe);
    return legPivot;
  };

  const leftLeg = makeLeg(-0.14);
  const rightLeg = makeLeg(0.14);
  bodyGroup.add(leftLeg, rightLeg);

  // Torso (primary silhouette)
  const torsoGeo = registry.track(new THREE.CylinderGeometry(0.24, 0.21, 0.62, 10), scope);
  const torso = new THREE.Mesh(torsoGeo, coatMat);
  torso.position.y = 1.09;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Collar / scarf or backpack accent
  const collarGeo = registry.track(new THREE.TorusGeometry(0.17, 0.045, 6, 12), scope);
  const collar = new THREE.Mesh(collarGeo, accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.38;
  bodyGroup.add(collar);

  if (isPlayer) {
    const packGeo = registry.track(new THREE.BoxGeometry(0.32, 0.42, 0.16), scope);
    const pack = new THREE.Mesh(packGeo, accentMat);
    pack.position.set(0, 1.12, -0.22);
    pack.castShadow = true;
    bodyGroup.add(pack);
  }

  // Arms (shoulder pivot at y=1.32)
  const armGeo = registry.track(new THREE.CapsuleGeometry(0.075, 0.44, 4, 8), scope);
  const makeArm = (xOffset: number) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 1.32, 0);
    const armMesh = new THREE.Mesh(armGeo, coatMat);
    armMesh.position.y = -0.25;
    armMesh.castShadow = true;
    const handGeo = registry.track(new THREE.SphereGeometry(0.065, 8, 8), scope);
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.52;
    armPivot.add(armMesh, hand);
    return armPivot;
  };
  const leftArm = makeArm(-0.31);
  const rightArm = makeArm(0.31);
  bodyGroup.add(leftArm, rightArm);

  // Head + hair + hat accent
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.48, 0);
  const headGeo = registry.track(new THREE.SphereGeometry(0.175, 12, 12), scope);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.12;
  head.castShadow = true;
  headGroup.add(head);

  const hairGeo = registry.track(new THREE.SphereGeometry(0.184, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), scope);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, 0.14, -0.01);
  hair.rotation.x = -0.15;
  headGroup.add(hair);

  if (appearance.hatStyle === 'sunhat') {
    const brim = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.34, 0.34, 0.025, 16), scope), accentMat);
    brim.position.y = 0.25;
    const crown = new THREE.Mesh(registry.track(new THREE.CylinderGeometry(0.17, 0.19, 0.11, 12), scope), accentMat);
    crown.position.y = 0.31;
    headGroup.add(brim, crown);
  } else if (appearance.hatStyle === 'cap' || appearance.hatStyle === 'visor') {
    const cap = new THREE.Mesh(registry.track(new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), scope), accentMat);
    cap.position.y = 0.16;
    const bill = new THREE.Mesh(registry.track(new THREE.BoxGeometry(0.2, 0.02, 0.16), scope), accentMat);
    bill.position.set(0, 0.2, 0.16);
    headGroup.add(cap, bill);
  } else if (appearance.hatStyle === 'beanie') {
    const beanie = new THREE.Mesh(registry.track(new THREE.SphereGeometry(0.186, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), scope), accentMat);
    beanie.position.y = 0.17;
    headGroup.add(beanie);
  }

  bodyGroup.add(headGroup);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
  };
}

export function buildVehicleMesh(
  kind: VehicleSpec['kind'],
  color: string,
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): VehicleMeshParts {
  const root = new THREE.Group();
  root.add(createContactShadow(mats, 2.35, registry, scope));

  const bodyMat = mats.getStandardMaterial(
    `veh-body:${color}`,
    { color, roughness: 0.28, metalness: 0.65 },
    scope,
  );
  const trimMat = mats.getStandardMaterial(
    'veh-trim',
    { color: '#272c33', roughness: 0.68, metalness: 0.25 },
    scope,
  );
  const glassMat = mats.getGlassMaterial(scope, '#78abc2');
  const tireMat = mats.getStandardMaterial(
    'veh-tire',
    { color: '#1b1f24', roughness: 0.88, metalness: 0.05 },
    scope,
  );
  const rimMat = mats.getStandardMaterial(
    'veh-rim',
    { color: '#cbd5e1', roughness: 0.22, metalness: 0.88 },
    scope,
  );
  const headLightMat = mats.getStandardMaterial(
    'veh-headlight',
    { color: '#fff4cc', emissive: '#ffebb0', emissiveIntensity: 0.8, roughness: 0.15 },
    scope,
  );
  const tailLightMat = mats.getStandardMaterial(
    'veh-taillight',
    { color: '#b91c1c', emissive: '#ef4444', emissiveIntensity: 0.6, roughness: 0.2 },
    scope,
  );

  // 1. Primary sculpted chassis
  const len = kind === 'utility' ? 4.3 : kind === 'pod' ? 3.5 : 4.0;
  const wid = kind === 'pod' ? 1.78 : 1.88;
  const chassisShape = new THREE.Shape();
  chassisShape.moveTo(-len * 0.5, 0.28);
  chassisShape.lineTo(len * 0.5, 0.28);
  chassisShape.lineTo(len * 0.48, 0.82);
  chassisShape.lineTo(len * 0.2, 0.92);
  chassisShape.lineTo(-len * 0.46, 0.88);
  chassisShape.closePath();

  const chassisGeo = registry.track(
    new THREE.ExtrudeGeometry(chassisShape, {
      depth: wid,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      bevelSegments: 2,
    }),
    scope,
  );
  chassisGeo.center();
  chassisGeo.rotateY(Math.PI / 2);
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  chassis.position.y = 0.62;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  root.add(chassis);

  // 2. Cabin / canopy
  const cabinLen = kind === 'utility' ? 1.65 : kind === 'rover' ? 2.2 : 1.95;
  const cabinZ = kind === 'utility' ? 0.55 : -0.15;
  const cabin = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(wid * 0.84, 0.62, cabinLen), scope),
    glassMat,
  );
  cabin.position.set(0, 1.24, cabinZ);
  cabin.castShadow = true;
  root.add(cabin);

  const roof = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(wid * 0.82, 0.08, cabinLen * 0.92), scope),
    bodyMat,
  );
  roof.position.set(0, 1.56, cabinZ);
  root.add(roof);

  if (kind === 'utility') {
    const bed = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(wid * 0.88, 0.42, 1.7), scope),
      trimMat,
    );
    bed.position.set(0, 1.05, -1.15);
    root.add(bed);
  }

  // 3. Bumpers & lights
  const frontBumper = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(wid * 0.96, 0.18, 0.18), scope),
    trimMat,
  );
  frontBumper.position.set(0, 0.36, len * 0.51);
  const rearBumper = frontBumper.clone();
  rearBumper.position.z = -len * 0.51;
  root.add(frontBumper, rearBumper);

  const hlGeo = registry.track(new THREE.BoxGeometry(0.28, 0.12, 0.08), scope);
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(hlGeo, headLightMat);
    hl.position.set(sx, 0.68, len * 0.51);
    const tl = new THREE.Mesh(hlGeo, tailLightMat);
    tl.position.set(sx, 0.68, -len * 0.51);
    root.add(hl, tl);
  }

  // 4. Four articulated wheels
  const wheelGeo = registry.track(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), scope);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = registry.track(new THREE.CylinderGeometry(0.21, 0.21, 0.28, 12), scope);
  rimGeo.rotateZ(Math.PI / 2);

  const wheels: THREE.Mesh[] = [];
  const frontLeftPivot = new THREE.Group();
  const frontRightPivot = new THREE.Group();

  const wheelPositions: Array<{ x: number; z: number; pivot?: THREE.Group }> = [
    { x: -wid * 0.49, z: len * 0.32, pivot: frontLeftPivot },
    { x: wid * 0.49, z: len * 0.32, pivot: frontRightPivot },
    { x: -wid * 0.49, z: -len * 0.32 },
    { x: wid * 0.49, z: -len * 0.32 },
  ];

  for (const wp of wheelPositions) {
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    tire.add(rim);
    tire.castShadow = true;
    wheels.push(tire);

    if (wp.pivot) {
      wp.pivot.position.set(wp.x, 0.36, wp.z);
      wp.pivot.add(tire);
      root.add(wp.pivot);
    } else {
      tire.position.set(wp.x, 0.36, wp.z);
      root.add(tire);
    }
  }

  return { root, wheels, frontLeftPivot, frontRightPivot };
}

export function buildBuildingMesh(
  b: BuildingDef,
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): THREE.Group {
  return buildArchitecturalBuilding(b, mats, registry, scope);
}

export function buildInstancedPropClusters(
  clusters: PropClusterDef[],
  mats: MaterialLibrary,
  registry: ResourceRegistry,
  scope: string,
): THREE.Group {
  const root = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (const cluster of clusters) {
    if (cluster.positions.length === 0) continue;
    const count = cluster.positions.length;

    if (cluster.kind === 'palm' || cluster.kind === 'pine' || cluster.kind === 'oak') {
      const trunkMat = mats.getStandardMaterial(
        `trunk:${cluster.kind}`,
        {
          color: cluster.kind === 'palm' ? '#7a624a' : '#57402e',
          roughness: 0.9,
          metalness: 0.0,
        },
        scope,
      );
      const leafColor =
        cluster.kind === 'palm' ? '#498650' : cluster.kind === 'pine' ? '#2c5439' : '#4b7a48';
      const leafMat = mats.getStandardMaterial(
        `foliage:${cluster.kind}`,
        { color: leafColor, roughness: 0.78, metalness: 0.02 },
        scope,
      );

      let trunkGeo: THREE.BufferGeometry;
      let crownGeo: THREE.BufferGeometry;

      if (cluster.kind === 'palm') {
        // Multi-segment gently curved palm trunk
        const segParts: THREE.BufferGeometry[] = [];
        const segH = 1.15;
        for (let s = 0; s < 5; s++) {
          const rBot = 0.27 - s * 0.025;
          const rTop = 0.24 - s * 0.025;
          const tilt = s * 0.045;
          const ox = Math.sin(s * 0.32) * s * 0.09;
          segParts.push(
            normalizeAndColor(
              new THREE.CylinderGeometry(rTop, rBot, segH, 8),
              null,
              ox,
              0.55 + s * (segH - 0.05),
              0,
              0,
              0,
              -tilt,
            ),
          );
        }
        trunkGeo = registry.track(mergeClusterParts(segParts), scope);

        // Radiating arching palm fronds (9 outer drooping fronds + 5 inner crown fronds)
        const frondParts: THREE.BufferGeometry[] = [];
        const crownX = Math.sin(4 * 0.32) * 4 * 0.09;
        const crownY = 5.45;
        for (let f = 0; f < 9; f++) {
          const ang = (f / 9) * Math.PI * 2;
          const dirX = Math.cos(ang);
          const dirZ = Math.sin(ang);
          // Inner frond segment
          const inner = new THREE.BoxGeometry(0.42, 0.07, 1.55);
          inner.translate(0, 0, 0.78);
          inner.rotateX(-0.22);
          inner.rotateY(ang);
          inner.translate(crownX, crownY + 0.15, 0);
          frondParts.push(normalizeAndColor(inner, null));
          // Outer drooping frond tip
          const outer = new THREE.BoxGeometry(0.32, 0.05, 1.45);
          outer.translate(0, -0.35, 2.05);
          outer.rotateX(0.32);
          outer.rotateY(ang);
          outer.translate(crownX + dirX * 0.1, crownY + 0.18, dirZ * 0.1);
          frondParts.push(normalizeAndColor(outer, null));
        }
        for (let f = 0; f < 5; f++) {
          const ang = (f / 5) * Math.PI * 2 + 0.35;
          const topF = new THREE.BoxGeometry(0.34, 0.06, 1.2);
          topF.translate(0, 0.28, 0.55);
          topF.rotateX(-0.48);
          topF.rotateY(ang);
          topF.translate(crownX, crownY + 0.35, 0);
          frondParts.push(normalizeAndColor(topF, null));
        }
        crownGeo = registry.track(mergeClusterParts(frondParts), scope);
      } else if (cluster.kind === 'pine') {
        trunkGeo = registry.track(
          normalizeAndColor(new THREE.CylinderGeometry(0.2, 0.34, 3.6, 8), null, 0, 1.8, 0),
          scope,
        );
        crownGeo = registry.track(
          mergeClusterParts([
            normalizeAndColor(new THREE.ConeGeometry(2.2, 2.6, 8), null, 0, 3.6, 0),
            normalizeAndColor(new THREE.ConeGeometry(1.75, 2.4, 8), null, 0, 4.9, 0),
            normalizeAndColor(new THREE.ConeGeometry(1.2, 2.1, 8), null, 0, 6.2, 0),
          ]),
          scope,
        );
      } else {
        trunkGeo = registry.track(
          mergeClusterParts([
            normalizeAndColor(new THREE.CylinderGeometry(0.22, 0.36, 3.3, 8), null, 0, 1.65, 0),
            normalizeAndColor(new THREE.CylinderGeometry(0.11, 0.16, 1.4, 6), null, 0.45, 3.1, 0, 0, 0, -0.55),
            normalizeAndColor(new THREE.CylinderGeometry(0.11, 0.16, 1.3, 6), null, -0.45, 3.0, 0.2, 0.2, 0, 0.55),
          ]),
          scope,
        );
        crownGeo = registry.track(
          mergeClusterParts([
            normalizeAndColor(new THREE.DodecahedronGeometry(1.85, 1), null, 0, 4.6, 0),
            normalizeAndColor(new THREE.DodecahedronGeometry(1.35, 1), null, 1.05, 4.2, 0.45),
            normalizeAndColor(new THREE.DodecahedronGeometry(1.3, 1), null, -0.95, 4.25, -0.4),
            normalizeAndColor(new THREE.DodecahedronGeometry(1.15, 1), null, 0.15, 5.4, -0.2),
          ]),
          scope,
        );
      }

      const trunkMesh = registry.track(new THREE.InstancedMesh(trunkGeo, trunkMat, count), scope);
      const crownMesh = registry.track(new THREE.InstancedMesh(crownGeo, leafMat, count), scope);
      trunkMesh.castShadow = true;
      crownMesh.castShadow = true;

      for (let i = 0; i < count; i++) {
        const p = cluster.positions[i];
        const s = 0.88 + ((i * 37) % 28) / 100;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, ((i * 73) % 628) / 100, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(i, dummy.matrix);
        crownMesh.setMatrixAt(i, dummy.matrix);
        color.set(leafColor).offsetHSL(0, 0, (((i * 19) % 16) - 8) / 160);
        crownMesh.setColorAt(i, color);
      }
      trunkMesh.instanceMatrix.needsUpdate = true;
      crownMesh.instanceMatrix.needsUpdate = true;
      if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
      trunkMesh.computeBoundingSphere();
      crownMesh.computeBoundingSphere();
      root.add(trunkMesh, crownMesh);
    } else if (cluster.kind === 'lamp') {
      // Multi-part cast-iron heritage lantern post + glowing lantern core
      const poleGeo = registry.track(
        mergeClusterParts([
          normalizeAndColor(new THREE.CylinderGeometry(0.2, 0.28, 0.45, 8), null, 0, 0.225, 0), // pedestal base
          normalizeAndColor(new THREE.CylinderGeometry(0.085, 0.13, 3.85, 8), null, 0, 2.35, 0), // fluted column
          normalizeAndColor(new THREE.CylinderGeometry(0.24, 0.12, 0.14, 8), null, 0, 4.3, 0), // lantern collar
          normalizeAndColor(new THREE.ConeGeometry(0.36, 0.28, 6), null, 0, 4.92, 0), // hexagonal lantern roof
          normalizeAndColor(new THREE.SphereGeometry(0.07, 6, 6), null, 0, 5.1, 0), // brass finial
        ]),
        scope,
      );
      const globeGeo = registry.track(
        normalizeAndColor(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 6), null, 0, 4.58, 0),
        scope,
      );

      const poleMat = mats.getStandardMaterial(
        'lamp-pole',
        { color: '#28313b', roughness: 0.38, metalness: 0.72 },
        scope,
      );
      const globeMat = mats.getStandardMaterial(
        'lamp-globe',
        { color: '#fff3d1', emissive: '#ffcf75', emissiveIntensity: 1.05, roughness: 0.2 },
        scope,
      );

      const poles = registry.track(new THREE.InstancedMesh(poleGeo, poleMat, count), scope);
      const globes = registry.track(new THREE.InstancedMesh(globeGeo, globeMat, count), scope);
      poles.castShadow = true;
      for (let i = 0; i < count; i++) {
        const p = cluster.positions[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        globes.setMatrixAt(i, dummy.matrix);
      }
      poles.instanceMatrix.needsUpdate = true;
      globes.instanceMatrix.needsUpdate = true;
      poles.computeBoundingSphere();
      globes.computeBoundingSphere();
      root.add(poles, globes);
    } else if (cluster.kind === 'bench') {
      // Grounded cast-iron legs + armrests + slatted cedar seat & angled backrest (1 InstancedMesh)
      const iron = '#27303b';
      const cedar = '#855c3c';
      const benchGeo = registry.track(
        mergeClusterParts([
          // Front & rear grounded iron legs (left & right)
          normalizeAndColor(new THREE.BoxGeometry(0.08, 0.48, 0.08), iron, -0.88, 0.24, 0.24),
          normalizeAndColor(new THREE.BoxGeometry(0.08, 0.48, 0.08), iron, 0.88, 0.24, 0.24),
          normalizeAndColor(new THREE.BoxGeometry(0.08, 0.88, 0.08), iron, -0.88, 0.44, -0.26),
          normalizeAndColor(new THREE.BoxGeometry(0.08, 0.88, 0.08), iron, 0.88, 0.44, -0.26),
          // Side stretchers & armrests
          normalizeAndColor(new THREE.BoxGeometry(0.08, 0.08, 0.58), iron, -0.88, 0.46, 0),
          normalizeAndColor(new THREE.BoxGeometry(0.08, 0.08, 0.58), iron, 0.88, 0.46, 0),
          normalizeAndColor(new THREE.BoxGeometry(0.09, 0.06, 0.56), iron, -0.88, 0.66, 0.0),
          normalizeAndColor(new THREE.BoxGeometry(0.09, 0.06, 0.56), iron, 0.88, 0.66, 0.0),
          // 3 Cedar seat planks
          normalizeAndColor(new THREE.BoxGeometry(1.94, 0.06, 0.16), cedar, 0, 0.51, 0.18),
          normalizeAndColor(new THREE.BoxGeometry(1.94, 0.06, 0.16), cedar, 0, 0.51, 0.0),
          normalizeAndColor(new THREE.BoxGeometry(1.94, 0.06, 0.16), cedar, 0, 0.51, -0.18),
          // 2 Angled cedar backrest slats
          normalizeAndColor(new THREE.BoxGeometry(1.94, 0.14, 0.06), cedar, 0, 0.72, -0.26, -0.14, 0, 0),
          normalizeAndColor(new THREE.BoxGeometry(1.94, 0.14, 0.06), cedar, 0, 0.9, -0.29, -0.14, 0, 0),
        ]),
        scope,
      );
      const benchMat = mats.getStandardMaterial(
        'bench-wood',
        { color: '#ffffff', vertexColors: true, roughness: 0.74, metalness: 0.15 },
        scope,
      );
      const benches = registry.track(new THREE.InstancedMesh(benchGeo, benchMat, count), scope);
      benches.castShadow = true;
      benches.receiveShadow = true;
      for (let i = 0; i < count; i++) {
        const p = cluster.positions[i];
        dummy.position.set(p.x, p.y, p.z);
        // Orient promenade benches facing north toward ocean; plaza benches facing inward
        const yaw = p.z <= -28 ? Math.PI : p.x < 0 ? Math.PI / 2 : -Math.PI / 2;
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        benches.setMatrixAt(i, dummy.matrix);
      }
      benches.instanceMatrix.needsUpdate = true;
      benches.computeBoundingSphere();
      root.add(benches);
    } else if (cluster.kind === 'bollard' || cluster.kind === 'rock' || cluster.kind === 'umbrella') {
      let geo: THREE.BufferGeometry;
      let mat: THREE.MeshStandardMaterial;

      if (cluster.kind === 'bollard') {
        geo = registry.track(
          mergeClusterParts([
            normalizeAndColor(new THREE.CylinderGeometry(0.16, 0.19, 0.14, 10), '#334155', 0, 0.07, 0),
            normalizeAndColor(new THREE.CylinderGeometry(0.11, 0.13, 0.8, 10), '#3d4a5c', 0, 0.52, 0),
            normalizeAndColor(new THREE.CylinderGeometry(0.125, 0.125, 0.07, 10), '#d9a14a', 0, 0.91, 0),
            normalizeAndColor(new THREE.SphereGeometry(0.11, 8, 6), '#334155', 0, 0.96, 0),
          ]),
          scope,
        );
        mat = mats.getStandardMaterial(
          'prop:bollard',
          { color: '#ffffff', vertexColors: true, roughness: 0.36, metalness: 0.62 },
          scope,
        );
      } else if (cluster.kind === 'rock') {
        geo = registry.track(
          mergeClusterParts([
            normalizeAndColor(new THREE.DodecahedronGeometry(1.35, 0), '#7a7d80', 0, 0.58, 0, 0.15, 0.3, 0),
            normalizeAndColor(new THREE.DodecahedronGeometry(0.9, 0), '#686b6e', 0.85, 0.36, 0.45, 0.4, 1.1, 0.2),
          ]),
          scope,
        );
        mat = mats.getStandardMaterial(
          'prop:rock',
          { color: '#ffffff', vertexColors: true, roughness: 0.9, metalness: 0.02 },
          scope,
        );
      } else {
        // Grounded Coastal Umbrella (stone base + wooden mast + scalloped striped canvas canopy)
        const mast = '#785638';
        const stone = '#9da3a8';
        const coral = '#d26b42';
        const cream = '#f1e7d4';
        const canopyParts: THREE.BufferGeometry[] = [
          normalizeAndColor(new THREE.CylinderGeometry(0.32, 0.36, 0.14, 10), stone, 0, 0.07, 0),
          normalizeAndColor(new THREE.CylinderGeometry(0.045, 0.055, 2.55, 8), mast, 0, 1.32, 0),
          normalizeAndColor(new THREE.CylinderGeometry(0.07, 0.04, 0.12, 8), mast, 0, 2.72, 0),
        ];
        // 8 scalloped wedge panels alternating terracotta coral and cream linen
        for (let seg = 0; seg < 8; seg++) {
          const panel = new THREE.ConeGeometry(1.75, 0.62, 3, 1, false, (seg / 8) * Math.PI * 2, Math.PI * 2 / 8);
          canopyParts.push(
            normalizeAndColor(panel, seg % 2 === 0 ? coral : cream, 0, 2.42, 0),
          );
        }
        geo = registry.track(mergeClusterParts(canopyParts), scope);
        mat = mats.getStandardMaterial(
          'prop:umbrella',
          { color: '#ffffff', vertexColors: true, roughness: 0.78, metalness: 0.04 },
          scope,
        );
      }

      const inst = registry.track(new THREE.InstancedMesh(geo, mat, count), scope);
      inst.castShadow = true;
      inst.receiveShadow = true;
      for (let i = 0; i < count; i++) {
        const p = cluster.positions[i];
        const s = cluster.kind === 'rock' ? 0.8 + ((i * 29) % 40) / 100 : 1;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, (i * 1.1) % (Math.PI * 2), 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      root.add(inst);
    }
  }

  return root;
}
