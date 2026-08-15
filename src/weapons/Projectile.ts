import * as THREE from 'three'
import { plasmaMaterial } from '../rendering/Materials'

/**
 * Plasma / hardlight bolt with glow trail. Used by WeaponSystem and EnemyManager.
 */
export class Projectile {
  readonly mesh: THREE.Group
  readonly core: THREE.Mesh
  readonly velocity = new THREE.Vector3()
  life = 2.5
  damage = 18
  radius = 0.15
  fromPlayer = true
  alive = true
  splashRadius = 0

  private readonly glow: THREE.Mesh
  private readonly trail: THREE.Line
  private readonly trailPos: Float32Array
  private readonly light: THREE.PointLight
  private age = 0

  constructor(position: THREE.Vector3, direction: THREE.Vector3, speed: number, color?: number) {
    const col = color ?? 0xc44dff
    this.mesh = new THREE.Group()
    this.mesh.position.copy(position)
    this.velocity.copy(direction).normalize().multiplyScalar(speed)

    const mat = plasmaMaterial()
    mat.color.setHex(col)
    mat.emissive.setHex(col)
    mat.emissiveIntensity = 1.4

    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat)
    this.core.scale.set(1, 1, 2.2)
    this.mesh.add(this.core)

    const glowMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      toneMapped: false,
    })
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glowMat)
    this.glow.scale.set(1.1, 1.1, 2.4)
    this.mesh.add(this.glow)

    this.light = new THREE.PointLight(col, 1.6, 7)
    this.mesh.add(this.light)

    const len = 8
    this.trailPos = new Float32Array(len * 3)
    for (let i = 0; i < len; i++) {
      this.trailPos[i * 3] = position.x
      this.trailPos[i * 3 + 1] = position.y
      this.trailPos[i * 3 + 2] = position.z
    }
    const trailGeo = new THREE.BufferGeometry()
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3))
    this.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.mesh.add(this.trail)
  }

  update(dt: number): void {
    this.age += dt
    this.mesh.position.addScaledVector(this.velocity, dt)
    this.life -= dt
    if (this.life <= 0) this.alive = false

    if (this.velocity.lengthSq() > 1e-6) {
      this.mesh.lookAt(
        this.mesh.position.x + this.velocity.x,
        this.mesh.position.y + this.velocity.y,
        this.mesh.position.z + this.velocity.z,
      )
    }

    const pulse = 0.85 + Math.sin(this.age * 30) * 0.15
    this.glow.scale.set(1.1 * pulse, 1.1 * pulse, 2.4 * pulse)
    this.light.intensity = 1.2 + pulse * 0.6
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity = 0.22 + pulse * 0.18
    this.pushTrail()
  }

  private pushTrail(): void {
    const n = this.trailPos.length / 3
    for (let i = n - 1; i > 0; i--) {
      this.trailPos[i * 3] = this.trailPos[(i - 1) * 3]!
      this.trailPos[i * 3 + 1] = this.trailPos[(i - 1) * 3 + 1]!
      this.trailPos[i * 3 + 2] = this.trailPos[(i - 1) * 3 + 2]!
    }
    this.trailPos[0] = this.mesh.position.x
    this.trailPos[1] = this.mesh.position.y
    this.trailPos[2] = this.mesh.position.z
    ;(this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.core.geometry.dispose()
    ;(this.core.material as THREE.Material).dispose()
    this.glow.geometry.dispose()
    ;(this.glow.material as THREE.Material).dispose()
    this.trail.geometry.dispose()
    ;(this.trail.material as THREE.Material).dispose()
  }
}

export type ProjectileSpawnOpts = {
  damage?: number
  fromPlayer?: boolean
  color?: number
  life?: number
  splashRadius?: number
}

export class ProjectileManager {
  readonly projectiles: Projectile[] = []
  private readonly scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  spawn(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    opts?: ProjectileSpawnOpts,
  ): Projectile {
    const p = new Projectile(position, direction, speed, opts?.color)
    if (opts?.damage != null) p.damage = opts.damage
    if (opts?.fromPlayer != null) p.fromPlayer = opts.fromPlayer
    if (opts?.life != null) p.life = opts.life
    if (opts?.splashRadius != null) p.splashRadius = opts.splashRadius
    this.projectiles.push(p)
    this.scene.add(p.mesh)
    return p
  }

  update(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.update(dt)
      if (!p.alive || p.mesh.position.y < -5) {
        this.scene.remove(p.mesh)
        p.dispose()
        this.projectiles.splice(i, 1)
      }
    }
  }

  clear(): void {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh)
      p.dispose()
    }
    this.projectiles.length = 0
  }
}
