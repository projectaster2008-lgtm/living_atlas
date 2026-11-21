import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp } from '../../shared/math/prng';
import { QualityTier, RegionManifest, Vec3 } from '../../shared/types/world';
import { SunState } from '../../simulation/clock/WorldClock';
import { WeatherAtmosphereValues } from '../../simulation/weather/WeatherSystem';

const _sunDir = new THREE.Vector3();
const _dayFog = new THREE.Color();
const _nightFog = new THREE.Color();
const _goldenFog = new THREE.Color(0xe6ac74);
const _curFog = new THREE.Color();
const _overcastFog = new THREE.Color(0x6d7d8e);
const _stormFog = new THREE.Color(0x4d5c6c);
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
  private readonly rainCount = 460;
  private rainOffsets: Float32Array;
  private isSoftwareGl: boolean;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    this.isSoftwareGl = isSoftwareGl;

    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    scene.add(this.sky);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['turbidity'].value = 3.2;
    skyUniforms['rayleigh'].value = 2.2;
    skyUniforms['mieCoefficient'].value = 0.0025;
    skyUniforms['mieDirectionalG'].value = 0.8;

    this.hemiLight = new THREE.HemisphereLight(0xbbe0ff, 0x4c463c, 0.56);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 1.72);
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

    // Pooled InstancedMesh rain particles with visible cool slate streak contrast
    const rainGeo = new THREE.BoxGeometry(0.052, 1.32, 0.052);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xa4c3da,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, this.rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    this.rainOffsets = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainOffsets[i * 3] = (Math.random() - 0.5) * 58;
      this.rainOffsets[i * 3 + 1] = Math.random() * 24;
      this.rainOffsets[i * 3 + 2] = (Math.random() - 0.5) * 58;
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

    const isGoldenWindow =
      !isInterior &&
      (sun.phaseLabel === 'Golden Hour' ||
        sun.phaseLabel === 'Dawn' ||
        (sun.daylightFactor >= 0.16 && sun.daylightFactor <= 0.74 && (sun.hour < 8.5 || sun.hour >= 16.3)));
    const goldenWeight = isGoldenWindow
      ? clamp(1 - Math.abs(sun.elevationDeg - 16) / 22, 0.45, 1.0)
      : 0;

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['sunPosition'].value.copy(_sunDir);
    skyUniforms['turbidity'].value = lerp(lerp(2.8, 7.2, goldenWeight), 12.0, weather.cloudCover);
    skyUniforms['rayleigh'].value = lerp(lerp(2.35, 3.15, goldenWeight), 0.6, weather.cloudCover);
    skyUniforms['mieCoefficient'].value = lerp(lerp(0.0022, 0.012, goldenWeight), 0.014, weather.cloudCover);
    skyUniforms['mieDirectionalG'].value = lerp(0.8, 0.88, goldenWeight);

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

    const weatherDim = 1 - weather.cloudCover * 0.52;
    if (isInterior) {
      this.sunLight.intensity = 1.05;
      this.hemiLight.intensity = 0.88;
      this.hemiLight.color.setHex(0xffe7c7);
      this.hemiLight.groundColor.setHex(0x4b3b2c);
      this.sunLight.color.setHex(0xffeacc);
      this.sky.visible = false;
      this.fog.density = 0.002;
      this.fog.color.setHex(0x1b212c);
    } else {
      // Hide sunlit clear Sky shader dome when heavy overcast/rain/storm takes over so cloudy slate horizon reads cleanly
      this.sky.visible = weather.cloudCover < 0.65;

      this.sunLight.intensity = lerp(0.28, 1.72, sun.daylightFactor) * weatherDim;
      if (sun.daylightFactor < 0.22) {
        this.sunLight.color.setHex(0x88a7d8);
      } else if (goldenWeight > 0) {
        this.sunLight.color.setHex(0xff9c4a);
      } else {
        this.sunLight.color.setHex(0xfff0d4);
      }

      // Crisp cool sky ambient vs warm directional key
      this.hemiLight.intensity = lerp(0.32, 0.58, sun.daylightFactor) * lerp(1.0, 0.84, goldenWeight * 0.5);
      this.hemiLight.color.setHex(
        sun.daylightFactor > 0.22 ? (goldenWeight > 0 ? 0x99b3d6 : 0xaad5f7) : 0x3b4f73,
      );
      this.hemiLight.groundColor.setHex(goldenWeight > 0 ? 0x6b4b32 : 0x4c463c);

      _dayFog.set(manifest.palette.fogDay);
      _nightFog.set(manifest.palette.fogNight);
      _curFog.copy(_nightFog).lerp(_dayFog, sun.daylightFactor);
      if (goldenWeight > 0) {
        _curFog.lerp(_goldenFog, goldenWeight * 0.62);
      }
      if (weather.cloudCover > 0.25) {
        const cloudTint = weather.rainIntensity > 0.3 ? _stormFog : _overcastFog;
        _curFog.lerp(cloudTint, clamp(weather.cloudCover * 0.78, 0, 0.88) * Math.max(0.35, sun.daylightFactor));
      }
      this.fog.color.copy(_curFog);
      const baseFog = quality === 'low' ? 0.0044 : 0.0028;
      this.fog.density = clamp(baseFog * weather.fogDensityMultiplier, 0.0022, 0.024);
    }

    // Update pooled rain particles around active camera/player area
    const showRain = !isInterior && weather.rainIntensity > 0.1;
    this.rainMesh.visible = showRain;
    if (showRain) {
      const activeCount = Math.floor(this.rainCount * weather.rainIntensity);
      this.rainMesh.count = activeCount;
      for (let i = 0; i < activeCount; i++) {
        const idx = i * 3;
        this.rainOffsets[idx + 1] -= dt * (23 + weather.rainIntensity * 8);
        this.rainOffsets[idx] += dt * weather.windStrength * 3.8;
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
    this.rainMesh.dispose();
    this.rainMesh.geometry.dispose();
    (this.rainMesh.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
