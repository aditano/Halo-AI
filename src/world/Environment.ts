import * as THREE from 'three';
import {
  createForerunnerMetal,
  createForerunnerAccent,
  createEnergyBridge,
  createEnergyGlass,
  createTerrainVertexColored,
  createTerrainGrass,
  createTerrainDirt,
  createCrateMetal,
  createRock,
  createUnscMatte,
  HaloPalette,
} from '../rendering/Materials';

/** Axis-aligned collider for simple FPS collision. */
export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface SpawnPoint {
  position: THREE.Vector3;
  yaw: number;
}

export interface EnvironmentBuild {
  root: THREE.Group;
  colliders: AABB[];
  spawnPoints: SpawnPoint[];
  enemySpawns: SpawnPoint[];
  arenaRadius: number;
  dispose: () => void;
}

export interface EnvironmentOptions {
  /** Ground disc radius. Default 72. */
  radius?: number;
  /** Seed for deterministic scatter. Default 42. */
  seed?: number;
}

/**
 * Zeta Halo outdoor arena — curved Forerunner metal + grassy patches,
 * angular pillars / hex platforms / arches / cyan energy bridges,
 * cover rocks & crates for FPS play.
 */
export function buildEnvironment(
  scene: THREE.Scene,
  options: EnvironmentOptions = {},
): EnvironmentBuild {
  const radius = options.radius ?? 72;
  const rng = mulberry32(options.seed ?? 42);

  const root = new THREE.Group();
  root.name = 'ZetaHaloArena';
  scene.add(root);

  const colliders: AABB[] = [];
  const disposables: Array<{ geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }> = [];

  // --- Ground ----------------------------------------------------------------
  const ground = createArenaGround(radius, rng);
  ground.mesh.receiveShadow = true;
  root.add(ground.mesh);
  disposables.push(ground);

  // Invisible outer rim wall so players / AI stay in the arena.
  addRimBarrier(root, radius, colliders, disposables);

  // --- Landmark Forerunner structures ----------------------------------------
  placeCentralHexPlatform(root, colliders, disposables);
  placePillars(root, radius, colliders, disposables, rng);
  placeArches(root, radius, colliders, disposables);
  placeEnergyBridges(root, colliders, disposables);
  placeSidePlatforms(root, radius, colliders, disposables);
  placeAccentBeacons(root, radius, disposables);

  // --- Gameplay cover --------------------------------------------------------
  scatterCover(root, radius, colliders, disposables, rng);
  placeFoliageClumps(root, radius, disposables, rng);

  // Player spawns — open sightlines, not inside geometry.
  const spawnPoints: SpawnPoint[] = [
    { position: new THREE.Vector3(0, 0.1, 22), yaw: Math.PI },
    { position: new THREE.Vector3(-18, 0.1, -8), yaw: Math.PI * 0.25 },
    { position: new THREE.Vector3(20, 0.1, 4), yaw: -Math.PI * 0.6 },
    { position: new THREE.Vector3(-6, 0.1, -24), yaw: 0.2 },
  ];

  // Enemy spawns — flanks + high ground approaches.
  const enemySpawns: SpawnPoint[] = [
    { position: new THREE.Vector3(28, 0.1, -12), yaw: Math.PI * 0.8 },
    { position: new THREE.Vector3(-30, 0.1, 10), yaw: -0.4 },
    { position: new THREE.Vector3(8, 3.6, -18), yaw: Math.PI * 0.5 },
    { position: new THREE.Vector3(-12, 0.1, 30), yaw: Math.PI },
    { position: new THREE.Vector3(0, 6.2, 0), yaw: Math.PI },
    { position: new THREE.Vector3(36, 0.1, 18), yaw: -Math.PI * 0.75 },
  ];

  return {
    root,
    colliders,
    spawnPoints,
    enemySpawns,
    arenaRadius: radius,
    dispose() {
      scene.remove(root);
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        // Shared materials from the factory are not disposed here.
      });
      for (const d of disposables) {
        d.geometry?.dispose();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

function createArenaGround(
  radius: number,
  rng: () => number,
): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
  const segments = 96;
  const geo = new THREE.CircleGeometry(radius, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(HaloPalette.terrainGrass);
  const dirt = new THREE.Color(HaloPalette.terrainDirt);
  const metal = new THREE.Color(HaloPalette.terrainMetal);
  const accent = new THREE.Color(HaloPalette.forerunnerAccent).multiplyScalar(0.55);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z);
    const n = fbm2(x * 0.045, z * 0.045, rng);

    // Subtle radial + noise height variation.
    let y = Math.sin(dist * 0.08) * 0.15 + n * 0.55;
    y += Math.sin(x * 0.12) * Math.cos(z * 0.1) * 0.12;
    // Flatten center for the hex platform.
    if (dist < 10) y *= dist / 10;
    pos.setY(i, y);

    // Vertex colors: metal rings, grass patches, dirt — high contrast for readable detail.
    const ring = Math.abs(Math.sin(dist * 0.35));
    let c: THREE.Color;
    if (ring > 0.82 && dist > 8) {
      c = metal.clone().offsetHSL(0, 0, 0.08);
    } else if (n > 0.25) {
      c = grass.clone().offsetHSL(0, 0.05, 0.06 + n * 0.08);
    } else if (n < -0.1) {
      c = dirt.clone().offsetHSL(0, 0, -0.05);
    } else {
      c = grass.clone().lerp(dirt, 0.45 + n * 0.25);
    }
    // Warm accent near mid-radius Forerunner inlays.
    if (dist > 20 && dist < 28 && ring > 0.7) {
      c = c.clone().lerp(accent, 0.55);
    }
    // Micro variation so the surface doesn't read as flat paint.
    c.offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.07);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, createTerrainVertexColored());
  mesh.name = 'ArenaGround';
  mesh.receiveShadow = true;

  // Concentric Forerunner metal ring inlays (separate meshes for emissive read).
  return { mesh, geometry: geo };
}

function addRimBarrier(
  root: THREE.Group,
  radius: number,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
): void {
  const wallH = 4;
  const wallT = 2.5;
  const segments = 24;
  const mat = createForerunnerMetal({ emissiveIntensity: 0.08 });

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const mid = (a0 + a1) * 0.5;
    const chord = 2 * radius * Math.sin((a1 - a0) * 0.5);
    const geo = new THREE.BoxGeometry(chord * 1.05, wallH, wallT);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      Math.cos(mid) * (radius + wallT * 0.35),
      wallH * 0.5 - 0.2,
      Math.sin(mid) * (radius + wallT * 0.35),
    );
    mesh.rotation.y = -mid + Math.PI * 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `RimWall_${i}`;
    root.add(mesh);
    disposables.push({ geometry: geo });
    colliders.push(aabbFromMesh(mesh));
  }
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

function placeCentralHexPlatform(
  root: THREE.Group,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
): void {
  const metal = createForerunnerMetal({ emissiveIntensity: 0.22 });
  const accent = createForerunnerAccent();

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 1.2, 6), metal);
  deck.position.set(0, 0.55, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  deck.name = 'CentralHexDeck';
  root.add(deck);
  disposables.push({ geometry: deck.geometry });
  colliders.push(aabbFromObject(deck, 0.2));

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6, 0.6, 6), accent);
  upper.position.set(0, 1.4, 0);
  upper.castShadow = true;
  upper.receiveShadow = true;
  upper.name = 'CentralHexUpper';
  root.add(upper);
  disposables.push({ geometry: upper.geometry });
  colliders.push(aabbFromObject(upper, 0.1));

  // Raised command plinth (enemy high ground).
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.5, 3.2), metal);
  plinth.position.set(0, 3.5, 0);
  plinth.rotation.y = Math.PI / 6;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  plinth.name = 'CentralPlinth';
  root.add(plinth);
  disposables.push({ geometry: plinth.geometry });
  colliders.push(aabbFromObject(plinth));

  // Energy glass canopy ring.
  const canopy = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.18, 8, 6),
    createEnergyGlass({ opacity: 0.45, emissiveIntensity: 0.9 }),
  );
  canopy.rotation.x = Math.PI / 2;
  canopy.position.y = 2.2;
  canopy.name = 'CentralCanopy';
  root.add(canopy);
  disposables.push({ geometry: canopy.geometry });
}

function placePillars(
  root: THREE.Group,
  radius: number,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
  rng: () => number,
): void {
  const metal = createForerunnerMetal({ emissiveIntensity: 0.28 });
  const accent = createForerunnerAccent({ emissiveIntensity: 0.12 });
  const count = 8;
  const ringR = radius * 0.55;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.2;
    const h = 14 + rng() * 10;
    const x = Math.cos(angle) * ringR;
    const z = Math.sin(angle) * ringR;

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.8), metal);
    shaft.position.set(x, h * 0.5, z);
    shaft.rotation.y = angle + Math.PI / 4;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    shaft.name = `Pillar_${i}`;
    root.add(shaft);
    disposables.push({ geometry: shaft.geometry });
    colliders.push(aabbFromObject(shaft));

    // Greeble plates + tech nodes for silhouette detail.
    for (let g = 0; g < 3; g++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.95, 0.35 + rng() * 0.4, 0.22),
        accent,
      );
      plate.position.set(x, 2 + g * (h * 0.22), z);
      plate.rotation.y = angle + Math.PI / 4;
      plate.castShadow = true;
      root.add(plate);
      disposables.push({ geometry: plate.geometry });
    }
    const node = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      createEnergyBridge({ emissiveIntensity: 1.2 }),
    );
    node.position.set(x + Math.cos(angle) * 1.2, 1.1, z + Math.sin(angle) * 1.2);
    root.add(node);
    disposables.push({ geometry: node.geometry });

    // Cap fin.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.7), accent);
    cap.position.set(x, h + 0.1, z);
    cap.rotation.y = angle;
    cap.castShadow = true;
    root.add(cap);
    disposables.push({ geometry: cap.geometry });

    // Cyan energy stripe.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, h * 0.85, 0.15),
      createEnergyBridge({ emissiveIntensity: 1.6 }),
    );
    stripe.position.set(x, h * 0.45, z);
    stripe.rotation.y = angle + Math.PI / 4;
    root.add(stripe);
    disposables.push({ geometry: stripe.geometry });
  }
}

function placeArches(
  root: THREE.Group,
  radius: number,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
): void {
  const metal = createForerunnerMetal({ emissiveIntensity: 0.15 });
  const placements = [
    { x: radius * 0.32, z: radius * 0.32, yaw: Math.PI * 0.25 },
    { x: -radius * 0.35, z: radius * 0.28, yaw: -Math.PI * 0.2 },
    { x: radius * 0.1, z: -radius * 0.4, yaw: Math.PI * 0.05 },
  ];

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.rotation.y = p.yaw;
    group.name = `Arch_${i}`;

    const legGeo = new THREE.BoxGeometry(1.4, 9, 1.4);
    const left = new THREE.Mesh(legGeo, metal);
    left.position.set(-4, 4.5, 0);
    left.castShadow = true;
    left.receiveShadow = true;
    group.add(left);

    const right = new THREE.Mesh(legGeo.clone(), metal);
    right.position.set(4, 4.5, 0);
    right.castShadow = true;
    right.receiveShadow = true;
    group.add(right);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 1.6), metal);
    beam.position.set(0, 9.2, 0);
    beam.castShadow = true;
    group.add(beam);

    // Angular keystone fin.
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.8, 0.5),
      createForerunnerAccent(),
    );
    fin.position.set(0, 10.5, 0);
    fin.castShadow = true;
    group.add(fin);

    const energy = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.25, 0.25),
      createEnergyBridge({ emissiveIntensity: 1.8 }),
    );
    energy.position.set(0, 8.4, 0);
    group.add(energy);

    root.add(group);
    disposables.push({ geometry: legGeo }, { geometry: beam.geometry }, { geometry: fin.geometry }, { geometry: energy.geometry });
    colliders.push(aabbFromObject(left), aabbFromObject(right), aabbFromObject(beam));
  }
}

function placeEnergyBridges(
  root: THREE.Group,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
): void {
  const bridges: Array<{
    x: number;
    y: number;
    z: number;
    yaw: number;
    len: number;
    w: number;
  }> = [
    { x: 0, y: 3.4, z: -14, yaw: 0, len: 18, w: 3.2 },
    { x: 16, y: 2.2, z: 6, yaw: Math.PI * 0.4, len: 14, w: 2.6 },
    { x: -14, y: 2.0, z: -4, yaw: -Math.PI * 0.35, len: 12, w: 2.4 },
  ];

  const mat = createEnergyBridge();
  const railMat = createForerunnerMetal({ emissiveIntensity: 0.35 });

  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i]!;
    const group = new THREE.Group();
    group.position.set(b.x, b.y, b.z);
    group.rotation.y = b.yaw;
    group.name = `EnergyBridge_${i}`;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.18, b.len), mat);
    deck.receiveShadow = true;
    group.add(deck);

    // Thin rails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, b.len), railMat);
      rail.position.set(side * (b.w * 0.5 - 0.05), 0.3, 0);
      group.add(rail);
      disposables.push({ geometry: rail.geometry });
    }

    // End pylons
    for (const end of [-1, 1]) {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 2.2, 0.8),
        railMat,
      );
      pylon.position.set(0, -0.8, end * (b.len * 0.5));
      pylon.castShadow = true;
      group.add(pylon);
      disposables.push({ geometry: pylon.geometry });
      colliders.push(aabbFromObject(pylon));
    }

    root.add(group);
    disposables.push({ geometry: deck.geometry });
    // Walkable bridge collider (slightly thicker for gameplay).
    colliders.push(aabbFromObject(deck, 0.15));
  }
}

function placeSidePlatforms(
  root: THREE.Group,
  radius: number,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
): void {
  const metal = createForerunnerMetal({ emissiveIntensity: 0.12 });
  const spots = [
    { x: radius * 0.42, z: -radius * 0.15, s: 6 },
    { x: -radius * 0.4, z: -radius * 0.22, s: 5.5 },
    { x: -radius * 0.2, z: radius * 0.45, s: 5 },
  ];

  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]!;
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(s.s * 0.5, s.s * 0.55, 0.8, 6),
      metal,
    );
    deck.position.set(s.x, 1.8, s.z);
    deck.castShadow = true;
    deck.receiveShadow = true;
    deck.name = `SideHex_${i}`;
    root.add(deck);
    disposables.push({ geometry: deck.geometry });
    colliders.push(aabbFromObject(deck, 0.15));

    // Support column
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.2), metal);
    col.position.set(s.x, 0.9, s.z);
    col.castShadow = true;
    root.add(col);
    disposables.push({ geometry: col.geometry });
    colliders.push(aabbFromObject(col));

    // Ramp toward center
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 5.5), metal);
    const toward = new THREE.Vector3(-s.x, 0, -s.z).normalize();
    ramp.position.set(
      s.x + toward.x * 4,
      1.0,
      s.z + toward.z * 4,
    );
    ramp.lookAt(s.x, 1.0, s.z);
    ramp.rotateX(-0.28);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    root.add(ramp);
    disposables.push({ geometry: ramp.geometry });
    colliders.push(aabbFromObject(ramp, 0.2));
  }
}

function placeAccentBeacons(
  root: THREE.Group,
  radius: number,
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
): void {
  const mat = createEnergyBridge({ emissiveIntensity: 2.2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.2, 6), mat);
    mesh.position.set(Math.cos(a) * radius * 0.78, 0.6, Math.sin(a) * radius * 0.78);
    mesh.name = `Beacon_${i}`;
    root.add(mesh);
    disposables.push({ geometry: mesh.geometry });
  }
}

// ---------------------------------------------------------------------------
// Cover scatter
// ---------------------------------------------------------------------------

function scatterCover(
  root: THREE.Group,
  radius: number,
  colliders: AABB[],
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
  rng: () => number,
): void {
  const rockMat = createRock();
  const crateMat = createCrateMetal();
  const unsc = createUnscMatte();

  // Rocks
  for (let i = 0; i < 28; i++) {
    const p = randomAnnulus(rng, 10, radius * 0.88);
    const sx = 1.2 + rng() * 2.4;
    const sy = 0.8 + rng() * 1.8;
    const sz = 1.0 + rng() * 2.2;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mesh = new THREE.Mesh(geo, rockMat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(p.x, sy * 0.45, p.z);
    mesh.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.4);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Rock_${i}`;
    root.add(mesh);
    disposables.push({ geometry: geo });
    colliders.push(aabbFromObject(mesh, 0.05));
  }

  // Metal crates — stacked cover
  for (let i = 0; i < 18; i++) {
    const p = randomAnnulus(rng, 12, radius * 0.75);
    const stack = 1 + Math.floor(rng() * 3);
    for (let s = 0; s < stack; s++) {
      const w = 1.1 + rng() * 0.5;
      const h = 0.9 + rng() * 0.35;
      const d = 1.1 + rng() * 0.5;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, rng() > 0.35 ? crateMat : unsc);
      mesh.position.set(p.x + (rng() - 0.5) * 0.3, h * 0.5 + s * 0.95, p.z + (rng() - 0.5) * 0.3);
      mesh.rotation.y = rng() * Math.PI;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `Crate_${i}_${s}`;
      root.add(mesh);
      disposables.push({ geometry: geo });
      colliders.push(aabbFromObject(mesh));
    }
  }

  // Low Forerunner barricades
  const barricadeMat = createForerunnerMetal({ emissiveIntensity: 0.1 });
  for (let i = 0; i < 10; i++) {
    const p = randomAnnulus(rng, 14, radius * 0.65);
    const geo = new THREE.BoxGeometry(3.5, 1.35, 0.55);
    const mesh = new THREE.Mesh(geo, barricadeMat);
    mesh.position.set(p.x, 0.68, p.z);
    mesh.rotation.y = Math.atan2(-p.x, -p.z) + (rng() - 0.5) * 0.8;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Barricade_${i}`;
    root.add(mesh);
    disposables.push({ geometry: geo });
    colliders.push(aabbFromObject(mesh));
  }
}

// ---------------------------------------------------------------------------
function placeFoliageClumps(
  root: THREE.Group,
  radius: number,
  disposables: Array<{ geometry?: THREE.BufferGeometry }>,
  rng: () => number,
): void {
  const leaf = createTerrainGrass({ color: 0x4a8a3a });
  const trunk = createTerrainDirt({ color: 0x5a4a32 });
  for (let i = 0; i < 36; i++) {
    const { x, z } = randomAnnulus(rng, radius * 0.42, radius * 0.88);
    // Keep clear of central plaza
    if (Math.hypot(x, z) < 16) continue;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 5), trunk);
    stem.position.y = 0.45;
    stem.castShadow = true;
    g.add(stem);
    disposables.push({ geometry: stem.geometry });
    for (let j = 0; j < 3; j++) {
      const canopy = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.55 + rng() * 0.35, 0),
        leaf,
      );
      canopy.position.set((rng() - 0.5) * 0.4, 1.1 + j * 0.35, (rng() - 0.5) * 0.4);
      canopy.scale.set(1.2, 0.75, 1.1);
      canopy.castShadow = true;
      g.add(canopy);
      disposables.push({ geometry: canopy.geometry });
    }
    root.add(g);
  }
}

// Math / helpers
// ---------------------------------------------------------------------------

function aabbFromMesh(mesh: THREE.Mesh, pad = 0): AABB {
  return aabbFromObject(mesh, pad);
}

function aabbFromObject(obj: THREE.Object3D, pad = 0): AABB {
  const box = new THREE.Box3().setFromObject(obj);
  if (pad !== 0) {
    box.min.addScalar(-pad);
    box.max.addScalar(pad);
  }
  return { min: box.min.clone(), max: box.max.clone() };
}

function randomAnnulus(rng: () => number, inner: number, outer: number): { x: number; z: number } {
  const t = rng();
  const r = Math.sqrt(inner * inner + t * (outer * outer - inner * inner));
  const a = rng() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap value-noise FBM (seedless trig hash — stable across runs). */
function fbm2(x: number, z: number, _rng: () => number): number {
  let v = 0;
  let amp = 0.5;
  let fx = x;
  let fz = z;
  for (let i = 0; i < 4; i++) {
    v += amp * Math.sin(fx * 1.7 + fz * 0.9) * Math.cos(fz * 1.3 - fx * 0.6);
    fx *= 2.05;
    fz *= 2.05;
    amp *= 0.5;
  }
  return v;
}

/** Test whether a world point is inside any collider AABB. */
export function pointInColliders(
  point: THREE.Vector3,
  colliders: AABB[],
): boolean {
  for (const c of colliders) {
    if (
      point.x >= c.min.x &&
      point.x <= c.max.x &&
      point.y >= c.min.y &&
      point.y <= c.max.y &&
      point.z >= c.min.z &&
      point.z <= c.max.z
    ) {
      return true;
    }
  }
  return false;
}

/** Expand AABB by a margin (for character capsule proxies). */
export function expandAABB(box: AABB, margin: number): AABB {
  return {
    min: box.min.clone().addScalar(-margin),
    max: box.max.clone().addScalar(margin),
  };
}
