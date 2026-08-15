import * as THREE from 'three';

export interface LightingSystem {
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  lightShafts: THREE.Group;
  /** Advance optional drifting light-shaft planes. */
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

export interface LightingOptions {
  /** Include translucent god-ray planes that drift slowly. Default true. */
  lightShafts?: boolean;
  /** Arena radius used to size shafts / shadow camera. Default 80. */
  arenaRadius?: number;
}

/**
 * Cinematic outdoor lighting: warm key sun, cool fill, hemisphere sky bounce,
 * soft contact ambient — bright Halo Infinite daytime, not cyberpunk gloom.
 */
export function setupLighting(
  scene: THREE.Scene,
  options: LightingOptions = {},
): LightingSystem {
  const arenaRadius = options.arenaRadius ?? 80;
  const enableShafts = options.lightShafts !== false;

  // Bright Infinite-style key — slightly cooler white-gold.
  const sun = new THREE.DirectionalLight(0xffe8cc, 2.15);
  sun.position.set(42, 85, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4.5;
  const extent = arenaRadius * 1.15;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = extent * 3;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);

  // Cool teal fill from opposite sky.
  const fill = new THREE.DirectionalLight(0xa8dff0, 0.7);
  fill.position.set(-36, 28, -42);
  fill.castShadow = false;
  scene.add(fill);

  // Sky / ground bounce.
  const hemi = new THREE.HemisphereLight(0x8ed4e8, 0x5a6a48, 0.85);
  scene.add(hemi);

  // Soft contact-ish ambient so shadowed cover stays readable for FPS play.
  const ambient = new THREE.AmbientLight(0xc8e4f0, 0.32);
  scene.add(ambient);

  const lightShafts = new THREE.Group();
  lightShafts.name = 'LightShafts';
  scene.add(lightShafts);

  const shaftMeshes: THREE.Mesh[] = [];
  if (enableShafts) {
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xffe6b8,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < 8; i++) {
      const w = 3 + (i % 4) * 2.8;
      const h = 50 + (i % 3) * 16;
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, shaftMat.clone());
      const angle = (i / 8) * Math.PI * 2 + 0.35;
      const dist = 10 + i * 5.5;
      mesh.position.set(Math.cos(angle) * dist, h * 0.35, Math.sin(angle) * dist);
      mesh.rotation.y = -angle + Math.PI * 0.5;
      mesh.rotation.z = THREE.MathUtils.degToRad(10 + i * 2.5);
      mesh.userData.driftSpeed = 0.035 + i * 0.008;
      mesh.userData.baseY = mesh.position.y;
      mesh.renderOrder = 1;
      lightShafts.add(mesh);
      shaftMeshes.push(mesh);
    }
  }

  let elapsed = 0;

  return {
    sun,
    fill,
    hemi,
    ambient,
    lightShafts,
    update(deltaSeconds: number) {
      elapsed += deltaSeconds;
      for (const mesh of shaftMeshes) {
        const speed = mesh.userData.driftSpeed as number;
        mesh.position.y = (mesh.userData.baseY as number) + Math.sin(elapsed * speed) * 1.2;
        mesh.rotation.z += deltaSeconds * speed * 0.15;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.028 + Math.sin(elapsed * speed * 1.5) * 0.012;
      }
    },
    dispose() {
      scene.remove(sun);
      scene.remove(sun.target);
      scene.remove(fill);
      scene.remove(hemi);
      scene.remove(ambient);
      scene.remove(lightShafts);
      for (const mesh of shaftMeshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      sun.dispose();
      fill.dispose();
      hemi.dispose();
      ambient.dispose();
    },
  };
}
