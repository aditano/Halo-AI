import * as THREE from 'three'
import { enemyArmor, energyGlass, forerunnerMetal } from '../rendering/Materials'
import type { SpawnPoint } from '../world/Environment'
import type { ProjectileManager } from '../weapons/Projectile'
import type { EffectsManager } from '../vfx/EffectsManager'
import type { AudioManager } from '../audio/AudioManager'

export type EnemyKind = 'grunt' | 'elite'
type AIState = 'patrol' | 'chase' | 'attack' | 'dead'

export class Enemy {
  readonly id: string
  readonly kind: EnemyKind
  readonly group = new THREE.Group()
  readonly meshes: THREE.Object3D[] = []
  health = 50
  shield = 30
  maxShield = 30
  state: AIState = 'patrol'
  alive = true
  private patrolAngle = 0
  private fireCd = 0
  private hitFlash = 0
  private deathT = 0
  private readonly home: THREE.Vector3
  private readonly speed: number
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly shieldMesh: THREE.Mesh

  constructor(kind: EnemyKind, spawn: SpawnPoint, id: string) {
    this.id = id
    this.kind = kind
    this.home = spawn.position.clone()
    this.group.position.copy(spawn.position)

    if (kind === 'elite') {
      this.health = 120
      this.shield = 100
      this.maxShield = 100
      this.speed = 4.2
      this.bodyMat = enemyArmor('blue')
    } else {
      this.health = 50
      this.shield = 30
      this.maxShield = 30
      this.speed = 3.2
      this.bodyMat = enemyArmor('red')
    }

    const scale = kind === 'elite' ? 1.15 : 0.85
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35 * scale, 0.55 * scale, 4, 8),
      this.bodyMat,
    )
    torso.position.y = 1.0 * scale
    torso.castShadow = true
    torso.userData.enemyId = id
    this.group.add(torso)
    this.meshes.push(torso)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 8, 8), forerunnerMetal(0.3))
    head.position.y = 1.65 * scale
    head.castShadow = true
    head.userData.enemyId = id
    head.userData.isHead = true
    this.group.add(head)
    this.meshes.push(head)

    if (kind === 'elite') {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 4), enemyArmor('blue'))
      crest.position.y = 1.95 * scale
      crest.userData.enemyId = id
      this.group.add(crest)
      this.meshes.push(crest)
    }

    const arms = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 * scale, 0.18 * scale, 0.18 * scale),
      this.bodyMat,
    )
    arms.position.y = 1.15 * scale
    arms.userData.enemyId = id
    this.group.add(arms)
    this.meshes.push(arms)

    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.75 * scale, 16, 12), energyGlass())
    this.shieldMesh.position.y = 1.1 * scale
    this.shieldMesh.scale.set(1, 1.3, 1)
    ;(this.shieldMesh.material as THREE.MeshPhysicalMaterial).opacity = 0.2
    this.group.add(this.shieldMesh)
    this.patrolAngle = Math.random() * Math.PI * 2
  }

  takeDamage(amount: number, point: THREE.Vector3, effects: EffectsManager): boolean {
    if (!this.alive) return false
    this.hitFlash = 0.12
    let left = amount
    if (this.shield > 0) {
      effects.spawnShieldRipple(this.group.position.clone().setY(this.group.position.y + 1))
      const abs = Math.min(this.shield, left)
      this.shield -= abs
      left -= abs
    }
    if (left > 0) {
      this.health -= left
      effects.spawnPlasmaImpact(point, new THREE.Vector3(0, 1, 0), 0xffaa55)
    }
    if (this.health <= 0) {
      this.alive = false
      this.state = 'dead'
      this.deathT = 0
      this.shieldMesh.visible = false
      effects.spawnExplosion(this.group.position.clone().add(new THREE.Vector3(0, 1, 0)))
      return true
    }
    this.state = 'chase'
    return false
  }

  update(dt: number, playerPos: THREE.Vector3, projectiles: ProjectileManager) {
    if (this.state === 'dead') {
      this.deathT += dt
      this.group.rotation.x = Math.min(Math.PI / 2, this.deathT * 3)
      this.group.position.y = Math.max(0.2, this.home.y - this.deathT * 0.5)
      this.group.scale.setScalar(Math.max(0.01, 1 - this.deathT * 0.35))
      return
    }

    this.fireCd = Math.max(0, this.fireCd - dt)
    this.hitFlash = Math.max(0, this.hitFlash - dt)
    this.bodyMat.emissiveIntensity = this.hitFlash > 0 ? 0.8 : 0.12
    this.shieldMesh.visible = this.shield > 0
    ;(this.shieldMesh.material as THREE.MeshPhysicalMaterial).opacity =
      0.12 + (this.shield / this.maxShield) * 0.18

    const dist = playerPos.distanceTo(this.group.position)
    if (dist < 45) this.state = dist < 18 ? 'attack' : 'chase'
    else this.state = 'patrol'

    if (this.state === 'patrol') {
      this.patrolAngle += dt * 0.6
      const target = this.home
        .clone()
        .add(new THREE.Vector3(Math.cos(this.patrolAngle) * 4, 0, Math.sin(this.patrolAngle) * 4))
      this.stepToward(target, dt, this.speed * 0.5)
    } else if (this.state === 'chase') {
      this.stepToward(playerPos, dt, this.speed)
      this.lookAt(playerPos)
    } else if (this.state === 'attack') {
      this.lookAt(playerPos)
      if (dist > 14) this.stepToward(playerPos, dt, this.speed * 0.7)
      else if (dist < 8) this.stepToward(playerPos, dt, -this.speed * 0.5)
      if (this.fireCd <= 0) {
        this.fireCd = this.kind === 'elite' ? 0.7 : 1.1
        const origin = this.group.position.clone().add(new THREE.Vector3(0, 1.3, 0))
        const dir = playerPos.clone().sub(origin).normalize()
        dir.x += (Math.random() - 0.5) * 0.08
        dir.y += (Math.random() - 0.5) * 0.05
        dir.z += (Math.random() - 0.5) * 0.08
        projectiles.spawn(origin, dir.normalize(), 28, {
          damage: this.kind === 'elite' ? 16 : 10,
          fromPlayer: false,
          color: 0xc44dff,
        })
      }
    }
  }

  private stepToward(target: THREE.Vector3, dt: number, speed: number) {
    const dir = target.clone().sub(this.group.position)
    dir.y = 0
    if (dir.lengthSq() < 0.01) return
    dir.normalize()
    this.group.position.addScaledVector(dir, speed * dt)
    this.lookAt(target)
  }

  private lookAt(target: THREE.Vector3) {
    const p = target.clone()
    p.y = this.group.position.y
    this.group.lookAt(p)
  }
}

export class EnemyManager {
  enemies: Enemy[] = []
  private seq = 0
  private wave = 0
  kills = 0
  private scene: THREE.Scene
  private spawns: SpawnPoint[]
  private projectiles: ProjectileManager
  private effects: EffectsManager
  private audio: AudioManager

  constructor(
    scene: THREE.Scene,
    spawns: SpawnPoint[],
    projectiles: ProjectileManager,
    effects: EffectsManager,
    audio: AudioManager,
  ) {
    this.scene = scene
    this.spawns = spawns
    this.projectiles = projectiles
    this.effects = effects
    this.audio = audio
  }

  getMeshes(): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    for (const e of this.enemies) {
      if (e.alive) out.push(...e.meshes)
    }
    return out
  }

  get waveNumber() {
    return this.wave
  }

  startWave(n = 6) {
    this.wave++
    for (let i = 0; i < n; i++) {
      const spawn = this.spawns[i % this.spawns.length]
      const kind: EnemyKind = i % 4 === 0 ? 'elite' : 'grunt'
      const e = new Enemy(kind, spawn, `e${this.seq++}`)
      e.group.position.x += (Math.random() - 0.5) * 2
      e.group.position.z += (Math.random() - 0.5) * 2
      this.enemies.push(e)
      this.scene.add(e.group)
    }
  }

  damageEnemy(id: string, damage: number, point: THREE.Vector3, _headshot: boolean): boolean {
    const e = this.enemies.find((x) => x.id === id)
    if (!e) return false
    const killed = e.takeDamage(damage, point, this.effects)
    if (killed) {
      this.kills++
      this.audio.enemyDeath()
    }
    return killed
  }

  update(dt: number, playerPos: THREE.Vector3) {
    let alive = 0
    for (const e of this.enemies) {
      e.update(dt, playerPos, this.projectiles)
      if (e.alive) alive++
      else if (e.group.scale.x < 0.05 && e.group.parent) {
        this.scene.remove(e.group)
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.group.parent)
    if (alive === 0) this.startWave(Math.min(14, 5 + this.wave * 2))
  }
}
