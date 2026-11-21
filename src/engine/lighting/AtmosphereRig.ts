import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp } from '../../shared/math/prng';
import { QualityTier, RegionManifest, Vec3 } from '../../shared/types/world';
import { SunState } from '../../simulation/clock/WorldClock';
import { WeatherAtmosphereValues } from '../../simulation/weather/WeatherSystem';

const _sunDir = new THREE.Vector3();
const _dayFog = new THREE.Color();
const _nightFog = new THREE.Color();
const _curFog = new THREE.Color();
const _overcastFog = new THREE.Color(0x8e9aa6);
const _rainMat = new THREE.Matrix4();
const _rainPos = new THREE.Vector3();
const _rainQuat = new THREE.Quaternion();
const _rainScale = new THREE.Vector3(1, 1, 1);

export class AtmosphereRig {
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  private sky: Sky;
  private fog: THREE.FogExp2;
  private rainMesh: THREE.InstancedMesh;
  private readonly rainCount = 360;
  private rainOffsets: Float32Array;
  private isSoftwareGl: boolean;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    this.isSoftwareGl = isSoftwareGl;

    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    scene.add(this.sky);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['turbidity'].value = 6.5;
    skyUniforms['rayleigh'].value = 1.8;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.82;

    this.hemiLight = new THREE.HemisphereLight(0xbbe0ff, 0x4c463c, 0.72);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sunLight.position.set(45, 70, 35);
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 48;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 190;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.fog = new THREE.FogExp2(0xb9d9ea, 0.0045);
    scene.fog = this.fog;
    scene.background = this.fog.color;

    // Pooled InstancedMesh rain particles
    const rainGeo = new THREE.BoxGeometry(0.03, 0.9, 0.03);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbe4f5,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, this.rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    this.rainOffsets = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainOffsets[i * 3] = (Math.random() - 0.5) * 60;
      this.rainOffsets[i * 3 + 1] = Math.random() * 24;
      this.rainOffsets[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
  }

  update(
    dt: number,
    playerPos: Vec3,
    sun: SunState,
    weather: WeatherAtmosphereValues,
    manifest: RegionManifest,
    quality: QualityTier,
    isInterior: boolean,
  ): void {
    const phi = THREE.MathUtils.degToRad(90 - Math.max(-6, sun.elevationDeg));
    const theta = THREE.MathUtils.degToRad(sun.azimuthDeg);
    _sunDir.setFromSphericalCoords(1, phi, theta);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['sunPosition'].value.copy(_sunDir);
    skyUniforms['turbidity'].value = lerp(4.5, 13.0, weather.cloudCover);
    skyUniforms['rayleigh'].value = lerp(1.9, 0.65, weather.cloudCover);

    // Light rig follows player with tight shadow frustum
    this.sunLight.position.set(
      playerPos.x + _sunDir.x * 78,
      Math.max(12, _sunDir.y * 85),
      playerPos.z + _sunDir.z * 78,
    );
    this.sunLight.target.position.set(playerPos.x, 0, playerPos.z);
    this.sunLight.target.updateMatrixWorld();

    const castShadows = !this.isSoftwareGl && quality !== 'low' && !isInterior && sun.daylightFactor > 0.08;
    this.sunLight.castShadow = castShadows;

    const weatherDim = 1 - weather.cloudCover * 0.45;
    if (isInterior) {
      this.sunLight.intensity = 0.85;
      this.hemiLight.intensity = 1.05;
      this.sunLight.color.setHex(0xfff4e0);
      this.sky.visible = false;
      this.fog.density = 0.002;
      this.fog.color.setHex(0x1e2430);
    } else {
      this.sky.visible = true;
      this.sunLight.intensity = lerp(0.32, 2.35, sun.daylightFactor) * weatherDim;
      // Warm golden hour vs crisp midday vs cool moonlight
      if (sun.daylightFactor < 0.25) {
        this.sunLight.color.setHex(0x8aa8d6);
      } else if (sun.daylightFactor < 0.52) {
        this.sunLight.color.setHex(0xffbe7b);
      } else {
        this.sunLight.color.setHex(0xfff2db);
      }

      this.hemiLight.intensity = lerp(0.38, 0.82, sun.daylightFactor);
      this.hemiLight.color.setHex(sun.daylightFactor > 0.25 ? 0xbbe0ff : 0x3b4f73);

      _dayFog.set(manifest.palette.fogDay);
      _nightFog.set(manifest.palette.fogNight);
      _curFog.copy(_nightFog).lerp(_dayFog, sun.daylightFactor);
      if (weather.cloudCover > 0.3) {
        _curFog.lerp(_overcastFog, weather.cloudCover * 0.45 * sun.daylightFactor);
      }
      this.fog.color.copy(_curFog);
      const baseFog = quality === 'low' ? 0.0044 : 0.0027;
      this.fog.density = clamp(baseFog * weather.fogDensityMultiplier, 0.0022, 0.020);
    }

    // Update pooled rain particles around player
    const showRain = !isInterior && weather.rainIntensity > 0.12;
    this.rainMesh.visible = showRain;
    if (showRain) {
      const activeCount = Math.floor(this.rainCount * weather.rainIntensity);
      this.rainMesh.count = activeCount;
      for (let i = 0; i < activeCount; i++) {
        const idx = i * 3;
        this.rainOffsets[idx + 1] -= dt * (22 + weather.rainIntensity * 8);
        this.rainOffsets[idx] += dt * weather.windStrength * 3.5;
        if (this.rainOffsets[idx + 1] < 0) {
          this.rainOffsets[idx + 1] = 22 + (i % 5);
          this.rainOffsets[idx] = ((i * 37) % 56) - 28;
          this.rainOffsets[idx + 2] = ((i * 73) % 56) - 28;
        }
        _rainPos.set(
          playerPos.x + this.rainOffsets[idx],
          this.rainOffsets[idx + 1],
          playerPos.z + this.rainOffsets[idx + 2],
        );
        _rainMat.compose(_rainPos, _rainQuat, _rainScale);
        this.rainMesh.setMatrixAt(i, _rainMat);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.rainMesh.geometry.dispose();
    (this.rainMesh.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
