import * as THREE from 'three';
import { BuildingDef, NpcProfile, PropClusterDef, VehicleSpec } from '../../shared/types/world';
import { ResourceRegistry } from '../core/ResourceRegistry';
import { MaterialLibrary } from '../materials/MaterialLibrary';

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
  // Rotate so length is along +Z
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

  // Roof cap
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
  const group = new THREE.Group();
  group.position.set(b.position.x, b.position.y, b.position.z);
  group.rotation.y = b.yaw;

  const bump = mats.getGrainBumpTexture(
    b.style === 'timber-cabin' || b.style === 'alpine-lodge' ? 'wood' : 'stone',
    4,
  );
  const wallMat = mats.getStandardMaterial(
    `b-wall:${b.primaryColor}:${b.style}`,
    { color: b.primaryColor, roughness: 0.78, metalness: 0.04, bumpMap: bump, bumpScale: 0.04 },
    scope,
  );
  const trimMat = mats.getStandardMaterial(
    `b-trim:${b.trimColor}`,
    { color: b.trimColor, roughness: 0.45, metalness: 0.25 },
    scope,
  );
  const roofMat = mats.getStandardMaterial(
    `b-roof:${b.roofColor}`,
    { color: b.roofColor, roughness: 0.65, metalness: 0.12 },
    scope,
  );
  const windowMat = mats.getStandardMaterial(
    `b-win:${b.style}`,
    {
      color: b.style.includes('urban') || b.style.includes('aether') ? '#709cb8' : '#eed8a8',
      roughness: 0.14,
      metalness: 0.45,
      emissive: '#ffd58c',
      emissiveIntensity: b.interiorId ? 0.28 : 0.1,
    },
    scope,
  );

  const { x: w, y: h, z: d } = b.size;

  // 1. Stone/concrete foundation plinth
  const plinth = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(w + 0.5, 0.55, d + 0.5), scope),
    trimMat,
  );
  plinth.position.y = 0.275;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Primary massing
  const body = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(w, h - 0.5, d), scope),
    wallMat,
  );
  body.position.y = 0.5 + (h - 0.5) * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 3. Cornice / roof crown
  if (b.style === 'coastal-villa' || b.style === 'timber-cabin' || b.style === 'alpine-lodge') {
    const roofH = Math.min(3.2, w * 0.25);
    const roof = new THREE.Mesh(
      registry.track(new THREE.ConeGeometry(Math.max(w, d) * 0.74, roofH, 4), scope),
      roofMat,
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + roofH * 0.5 - 0.1;
    roof.castShadow = true;
    group.add(roof);
  } else {
    const cornice = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), scope),
      roofMat,
    );
    cornice.position.y = h + 0.15;
    group.add(cornice);

    // Rooftop mechanical / skylight crown
    const skylight = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(w * 0.45, 0.9, d * 0.45), scope),
      trimMat,
    );
    skylight.position.y = h + 0.8;
    group.add(skylight);
  }

  // 4. Horizontal window ribbons per floor
  const floors = Math.max(1, Math.floor(h / 4));
  for (let f = 0; f < floors; f++) {
    const wy = 2.4 + f * 3.6;
    if (wy > h - 1.2) break;
    const ribbon = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(w + 0.08, 1.35, d * 0.78), scope),
      windowMat,
    );
    ribbon.position.y = wy;
    const ribbonZ = new THREE.Mesh(
      registry.track(new THREE.BoxGeometry(w * 0.78, 1.35, d + 0.08), scope),
      windowMat,
    );
    ribbonZ.position.y = wy;
    group.add(ribbon, ribbonZ);
  }

  // 5. Doorway frame with jambs & welcoming canopy (always on +Z local front unless specified)
  const doorOffset = b.doorLocalOffset ?? { x: 0, y: 0, z: d * 0.5 + 0.1 };
  const doorFaceZ = Math.abs(doorOffset.z) >= Math.abs(doorOffset.x);
  const doorGroup = new THREE.Group();
  if (doorFaceZ) {
    doorGroup.position.set(0, 0, Math.sign(doorOffset.z || 1) * (d * 0.5 + 0.06));
    if (doorOffset.z < 0) doorGroup.rotation.y = Math.PI;
  } else {
    doorGroup.position.set(Math.sign(doorOffset.x) * (w * 0.5 + 0.06), 0, 0);
    doorGroup.rotation.y = doorOffset.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  const doorJambL = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(0.28, 3.1, 0.35), scope),
    trimMat,
  );
  doorJambL.position.set(-1.15, 1.55, 0);
  const doorJambR = doorJambL.clone();
  doorJambR.position.x = 1.15;

  const doorPanel = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(2.0, 2.9, 0.18), scope),
    b.interiorId
      ? mats.getStandardMaterial(
          'door-active',
          { color: '#2b3a4a', emissive: '#e0a952', emissiveIntensity: 0.45, roughness: 0.25 },
          scope,
        )
      : roofMat,
  );
  doorPanel.position.set(0, 1.45, -0.05);

  const awning = new THREE.Mesh(
    registry.track(new THREE.BoxGeometry(3.4, 0.22, 1.5), scope),
    trimMat,
  );
  awning.position.set(0, 3.25, 0.65);
  awning.rotation.x = 0.12;
  awning.castShadow = true;

  doorGroup.add(doorJambL, doorJambR, doorPanel, awning);
  group.add(doorGroup);

  return group;
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
          color: cluster.kind === 'palm' ? '#7a634c' : '#594230',
          roughness: 0.9,
          metalness: 0.0,
        },
        scope,
      );
      const leafColor =
        cluster.kind === 'palm' ? '#4a8552' : cluster.kind === 'pine' ? '#2c5439' : '#4a7a48';
      const leafMat = mats.getStandardMaterial(
        `foliage:${cluster.kind}`,
        { color: leafColor, roughness: 0.78, metalness: 0.02 },
        scope,
      );

      const trunkGeo = registry.track(
        cluster.kind === 'palm'
          ? new THREE.CylinderGeometry(0.16, 0.28, 5.2, 8)
          : new THREE.CylinderGeometry(0.22, 0.34, 3.6, 8),
        scope,
      );
      trunkGeo.translate(0, cluster.kind === 'palm' ? 2.6 : 1.8, 0);

      const crownGeo = registry.track(
        cluster.kind === 'palm'
          ? new THREE.ConeGeometry(2.3, 1.4, 7)
          : cluster.kind === 'pine'
            ? new THREE.ConeGeometry(2.1, 5.6, 8)
            : new THREE.DodecahedronGeometry(2.1, 1),
        scope,
      );
      crownGeo.translate(0, cluster.kind === 'palm' ? 5.2 : cluster.kind === 'pine' ? 5.2 : 4.6, 0);

      const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const crownMesh = new THREE.InstancedMesh(crownGeo, leafMat, count);
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
      const poleGeo = registry.track(new THREE.CylinderGeometry(0.08, 0.13, 4.4, 8), scope);
      poleGeo.translate(0, 2.2, 0);
      const globeGeo = registry.track(new THREE.SphereGeometry(0.28, 10, 8), scope);
      globeGeo.translate(0, 4.55, 0);

      const poleMat = mats.getStandardMaterial(
        'lamp-pole',
        { color: '#2b333d', roughness: 0.35, metalness: 0.78 },
        scope,
      );
      const globeMat = mats.getStandardMaterial(
        'lamp-globe',
        { color: '#fff3d1', emissive: '#ffcf75', emissiveIntensity: 0.95, roughness: 0.2 },
        scope,
      );

      const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
      const globes = new THREE.InstancedMesh(globeGeo, globeMat, count);
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
      const seatGeo = registry.track(new THREE.BoxGeometry(2.1, 0.14, 0.65), scope);
      seatGeo.translate(0, 0.52, 0);
      const benchMat = mats.getStandardMaterial(
        'bench-wood',
        { color: '#7a563b', roughness: 0.72, metalness: 0.08 },
        scope,
      );
      const benches = new THREE.InstancedMesh(seatGeo, benchMat, count);
      benches.castShadow = true;
      for (let i = 0; i < count; i++) {
        const p = cluster.positions[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.x < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        benches.setMatrixAt(i, dummy.matrix);
      }
      benches.instanceMatrix.needsUpdate = true;
      benches.computeBoundingSphere();
      root.add(benches);
    } else if (cluster.kind === 'bollard' || cluster.kind === 'rock' || cluster.kind === 'umbrella') {
      const geo = registry.track(
        cluster.kind === 'bollard'
          ? new THREE.CylinderGeometry(0.12, 0.14, 0.95, 8)
          : cluster.kind === 'rock'
            ? new THREE.DodecahedronGeometry(1.4, 0)
            : new THREE.ConeGeometry(1.75, 0.7, 8),
        scope,
      );
      geo.translate(
        0,
        cluster.kind === 'bollard' ? 0.48 : cluster.kind === 'rock' ? 0.75 : 2.55,
        0,
      );
      const mat = mats.getStandardMaterial(
        `prop:${cluster.kind}`,
        {
          color:
            cluster.kind === 'bollard'
              ? '#4b5563'
              : cluster.kind === 'rock'
                ? '#787d82'
                : '#d97746',
          roughness: cluster.kind === 'bollard' ? 0.35 : 0.85,
          metalness: cluster.kind === 'bollard' ? 0.65 : 0.04,
        },
        scope,
      );
      const inst = new THREE.InstancedMesh(geo, mat, count);
      inst.castShadow = true;
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
