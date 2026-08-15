import * as THREE from 'three'
import { enemyArmor, energyGlass, forerunnerMetal } from '../rendering/Materials'
import type { SpawnPoint } from '../world/Environment'
import type { EffectsManager } from '../vfx/EffectsManager'
import type { ProjectileManager } from '../weapons/Projectile'

/** AI behavioural states for Covenant units. */
export const EnemyState = {
  Idle: 'idle',
  Patrol: 'patrol',
  Alert: 'alert',
  Chase: 'chase',
  Shoot: 'shoot',
  Cover: 'cover',
  HitReact: 'hit_react',
  Dying: 'dying',
  Dead: 'dead',
} as const

export type EnemyStateId = (typeof EnemyState)[keyof typeof EnemyState]

export type EnemyKind = 'grunt' | 'elite'

export interface EnemyDamageResult {
  shieldDamage: number
  healthDamage: number
  killed: boolean
  wasHeadshot: boolean
}

const _tmpV = new THREE.Vector3()
const _tmpV2 = new THREE.Vector3()
const _tmpQ = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)

/**
 * Procedural Covenant-inspired combatant — angular armor, colored energy shields,
 * personal shields + health, and a lightweight state-machine AI.
 */
export class Enemy {
  readonly id: string
  readonly kind: EnemyKind
  readonly archetype: EnemyKind
  readonly group = new THREE.Group()
  readonly root: THREE.Group
  readonly meshes: THREE.Object3D[] = []

  health: number
  shield: number
  maxHealth: number
  maxShield: number
  state: EnemyStateId = EnemyState.Patrol
  alive = true

  private readonly speed: number
  private readonly turnSpeed: number
  private readonly attackRange: number
  private readonly attackCooldown: number
  private readonly projectileSpeed: number
  private readonly projectileDamage: number
  private readonly headshotMultiplier: number
  private readonly coverChance: number
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly accentMat: THREE.MeshStandardMaterial
  private shieldMesh!: THREE.Mesh
  private readonly shieldMat: THREE.MeshPhysicalMaterial
  private weaponMuzzle!: THREE.Object3D
  private readonly home: THREE.Vector3
  private readonly patrolPoints: THREE.Vector3[] = []
  private readonly velocity = new THREE.Vector3()
  private readonly coverPoint = new THREE.Vector3()

  private patrolIndex = 0
  private fireCd = 0
  private stateTimer = 0
  private hitReactTimer = 0
  private deathT = 0
  private coverTimer = 0
  private shieldCooldown = 0
  private deathSpin = 0
  private readonly baseScale: number

  constructor(kind: EnemyKind, spawn: SpawnPoint, id: string) {
    this.id = id
    this.kind = kind
    this.archetype = kind
    this.root = this.group
    this.home = spawn.position.clone()
    this.group.position.copy(spawn.position)
    this.group.name = id

    const isElite = kind === 'elite'
    this.baseScale = isElite ? 1.15 : 0.85

    if (isElite) {
      this.maxHealth = 140
      this.maxShield = 120
      this.health = this.maxHealth
      this.shield = this.maxShield
      this.speed = 5.4
      this.turnSpeed = 4.6
      this.attackRange = 28
      this.attackCooldown = 0.55
      this.projectileSpeed = 48
      this.projectileDamage = 18
      this.headshotMultiplier = 2.5
      this.coverChance = 0.55
      this.bodyMat = enemyArmor('blue')
      this.accentMat = enemyArmor('blue').clone()
      this.accentMat.emissive = new THREE.Color(0x33ffaa)
      this.accentMat.emissiveIntensity = 0.55
    } else {
      this.maxHealth = 80
      this.maxShield = 40
      this.health = this.maxHealth
      this.shield = this.maxShield
      this.speed = 4.0
      this.turnSpeed = 3.8
      this.attackRange = 20
      this.attackCooldown = 0.9
      this.projectileSpeed = 38
      this.projectileDamage = 12
      this.headshotMultiplier = 2.2
      this.coverChance = 0.35
      this.bodyMat = enemyArmor('red')
      this.accentMat = enemyArmor('red').clone()
      this.accentMat.emissive = new THREE.Color(0xff8a2b)
      this.accentMat.emissiveIntensity = 0.55
    }

    this.shieldMat = energyGlass().clone()
    this.shieldMat.color.setHex(isElite ? 0x33ffaa : 0xffaa44)
    this.shieldMat.emissive = new THREE.Color(isElite ? 0x33ffaa : 0xffaa44)
    this.shieldMat.emissiveIntensity = 0.45
    this.shieldMat.opacity = 0.28

    this.buildMesh(isElite)
    this.seedPatrol(spawn.position)
    if (spawn.yaw !== undefined) {
      this.group.rotation.y = spawn.yaw
    }
  }

  isHeadObject(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj
    while (cur && cur !== this.group) {
      if (cur.userData.isHead) return true
      cur = cur.parent
    }
    return false
  }

  takeDamage(
    amount: number,
    point: THREE.Vector3,
    effects: EffectsManager,
    headshot = false,
  ): boolean {
    return this.applyDamage(amount, point, effects, headshot).killed
  }

  applyDamage(
    amount: number,
    point: THREE.Vector3,
    effects: EffectsManager,
    headshot = false,
  ): EnemyDamageResult {
    if (!this.alive || this.state === EnemyState.Dying || this.state === EnemyState.Dead) {
      return { shieldDamage: 0, healthDamage: 0, killed: false, wasHeadshot: headshot }
    }

    let remaining = amount
    let shieldDamage = 0
    let healthDamage = 0
    const hadShield = this.shield > 0

    if (this.shield > 0) {
      effects.spawnShieldRipple(
        this.group.position.clone().setY(this.group.position.y + 1.1),
        this.kind === 'elite' ? 0x66ffcc : 0xffaa44,
      )
      shieldDamage = Math.min(this.shield, remaining)
      this.shield -= shieldDamage
      remaining -= shieldDamage
      this.shieldCooldown = this.kind === 'elite' ? 1.8 : 2.4
      if (hadShield && this.shield <= 0) {
        this.shieldMat.opacity = 0.7
        this.shieldMat.emissiveIntensity = 2
      }
    }

    if (remaining > 0) {
      const mult = headshot ? this.headshotMultiplier : 1
      healthDamage = remaining * mult
      this.health = Math.max(0, this.health - healthDamage)
      effects.spawnImpact(point, new THREE.Vector3(0, 1, 0), 'bullet')
    }

    this.triggerHitReact(point)

    if (this.health <= 0) {
      this.beginDeath(effects)
      return { shieldDamage, healthDamage, killed: true, wasHeadshot: headshot }
    }

    if (this.state === EnemyState.Idle || this.state === EnemyState.Patrol) {
      this.enterState(EnemyState.Alert)
    }
    return { shieldDamage, healthDamage, killed: false, wasHeadshot: headshot }
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    projectiles: ProjectileManager,
    _canSeePlayer: boolean,
  ): void {
    if (this.state === EnemyState.Dead) return

    this.fireCd = Math.max(0, this.fireCd - dt)
    this.stateTimer += dt
    this.updateShields(dt)
    this.updateShieldVisual()

    if (this.state === EnemyState.Dying) {
      this.updateDeath(dt)
      return
    }

    if (this.state === EnemyState.HitReact) {
      this.hitReactTimer -= dt
      this.group.position.addScaledVector(this.velocity, dt)
      this.velocity.multiplyScalar(0.85)
      if (this.hitReactTimer <= 0) {
        this.enterState(EnemyState.Chase)
        this.bodyMat.emissiveIntensity = 0.12
      }
      return
    }

    const dist = this.group.position.distanceTo(playerPos)

    if (dist < 36) {
      if (this.state === EnemyState.Idle || this.state === EnemyState.Patrol) {
        this.enterState(EnemyState.Alert)
      }
    } else if (dist > 52 && (this.state === EnemyState.Chase || this.state === EnemyState.Shoot)) {
      this.enterState(EnemyState.Patrol)
    }

    switch (this.state) {
      case EnemyState.Idle:
        this.velocity.set(0, 0, 0)
        if (this.stateTimer > 1.4) this.enterState(EnemyState.Patrol)
        break
      case EnemyState.Patrol:
        this.updatePatrol()
        break
      case EnemyState.Alert:
        this.faceToward(playerPos, dt * this.turnSpeed)
        this.velocity.multiplyScalar(0.85)
        if (this.stateTimer > 0.4) this.enterState(EnemyState.Chase)
        break
      case EnemyState.Chase:
        this.updateChase(dt, playerPos, dist)
        break
      case EnemyState.Shoot:
        this.updateShoot(dt, playerPos, dist, projectiles)
        break
      case EnemyState.Cover:
        this.updateCover(dt, playerPos)
        break
      default:
        break
    }

    this.applyLocomotion(dt)
  }

  dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry?.dispose()
      }
    })
    this.group.removeFromParent()
  }

  private buildMesh(isElite: boolean): void {
    const scale = this.baseScale
    const tag = (obj: THREE.Object3D, head = false) => {
      obj.userData.enemyId = this.id
      if (head) obj.userData.isHead = true
      this.meshes.push(obj)
    }

    const torsoH = isElite ? 0.95 : 0.7
    const torsoW = isElite ? 0.7 : 0.55
    const torsoD = isElite ? 0.4 : 0.32

    const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), this.bodyMat)
    torso.name = 'torso'
    torso.position.y = isElite ? 1.15 : 0.95
    torso.castShadow = true
    tag(torso)
    this.group.add(torso)

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW * 1.15, torsoH * 0.45, torsoD * 0.35),
      this.accentMat,
    )
    plate.position.set(0, torso.position.y + 0.12, torsoD * 0.45)
    plate.rotation.x = -0.18
    tag(plate)
    this.group.add(plate)

    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.35), this.bodyMat)
      pauldron.position.set(side * (torsoW * 0.55), torso.position.y + torsoH * 0.28, 0)
      pauldron.rotation.z = side * -0.35
      tag(pauldron)
      this.group.add(pauldron)
    }

    const headSize = isElite ? 0.32 : 0.26
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(headSize, headSize * 1.1, headSize * 1.05),
      forerunnerMetal(0.25),
    )
    head.name = 'head'
    head.position.y = torso.position.y + torsoH * 0.55 + headSize * 0.55
    head.castShadow = true
    tag(head, true)
    this.group.add(head)

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.85, headSize * 0.28, 0.06),
      new THREE.MeshStandardMaterial({
        color: isElite ? 0x66ffcc : 0xffaa33,
        emissive: isElite ? 0x33ffaa : 0xff8800,
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.3,
      }),
    )
    visor.position.set(0, head.position.y + 0.02, headSize * 0.52)
    tag(visor, true)
    this.group.add(visor)

    if (isElite) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), this.accentMat)
      crest.position.set(0, head.position.y + 0.28, -0.05)
      crest.rotation.x = 0.4
      tag(crest)
      this.group.add(crest)
    } else {
      const tank = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), this.accentMat)
      tank.position.set(0, torso.position.y + 0.05, -0.28)
      tag(tank)
      this.group.add(tank)
    }

    for (const side of [-1, 1]) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), this.bodyMat)
      upper.position.set(side * (torsoW * 0.62), torso.position.y + 0.05, 0)
      upper.rotation.z = side * 0.15
      tag(upper)
      this.group.add(upper)

      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), this.bodyMat)
      lower.position.set(side * (torsoW * 0.68), torso.position.y - 0.35, 0.08)
      tag(lower)
      this.group.add(lower)

      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.2), this.bodyMat)
      thigh.position.set(side * 0.16, 0.55, 0)
      tag(thigh)
      this.group.add(thigh)

      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.18), this.bodyMat)
      shin.position.set(side * 0.16, 0.2, 0.02)
      tag(shin)
      this.group.add(shin)
    }

    const weapon = new THREE.Group()
    weapon.position.set(torsoW * 0.55, torso.position.y - 0.05, 0.35)
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.45),
      forerunnerMetal(0.8),
    )
    weapon.add(receiver)
    const muzzle = new THREE.Object3D()
    muzzle.name = 'muzzle'
    muzzle.position.set(0, 0, 0.28)
    weapon.add(muzzle)
    this.group.add(weapon)
    this.weaponMuzzle = muzzle

    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(isElite ? 1.15 : 0.95, 16, 12),
      this.shieldMat,
    )
    this.shieldMesh.name = 'energyShield'
    this.shieldMesh.position.y = isElite ? 1.05 : 0.9
    this.shieldMesh.scale.set(1, 1.15, 1)
    this.group.add(this.shieldMesh)

    void scale
  }

  private seedPatrol(origin: THREE.Vector3): void {
    const radius = this.kind === 'elite' ? 8 : 5
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.4
      this.patrolPoints.push(
        new THREE.Vector3(origin.x + Math.cos(a) * radius, origin.y, origin.z + Math.sin(a) * radius),
      )
    }
  }

  private enterState(next: EnemyStateId): void {
    this.state = next
    this.stateTimer = 0
    if (next === EnemyState.Cover) {
      this.pickCoverPoint()
      this.coverTimer = 1.2 + Math.random() * 1.4
    }
  }

  private updatePatrol(): void {
    if (this.patrolPoints.length === 0) {
      this.enterState(EnemyState.Idle)
      return
    }
    const target = this.patrolPoints[this.patrolIndex]!
    this.moveToward(target, this.speed * 0.55)
    this.faceToward(target, 0.08)
    if (this.group.position.distanceTo(target) < 0.6) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length
      if (Math.random() < 0.25) this.enterState(EnemyState.Idle)
    }
  }

  private updateChase(dt: number, playerPos: THREE.Vector3, dist: number): void {
    this.faceToward(playerPos, dt * this.turnSpeed)
    if (dist <= this.attackRange * 0.85) {
      this.enterState(EnemyState.Shoot)
      return
    }
    this.moveToward(playerPos, this.speed)
    _tmpV.copy(playerPos).sub(this.group.position).setY(0).normalize()
    _tmpV2.set(-_tmpV.z, 0, _tmpV.x).multiplyScalar(Math.sin(this.stateTimer * 2.2) * 1.2)
    this.velocity.add(_tmpV2)
  }

  private updateShoot(
    dt: number,
    playerPos: THREE.Vector3,
    dist: number,
    projectiles: ProjectileManager,
  ): void {
    this.faceToward(playerPos, dt * this.turnSpeed * 1.2)
    this.velocity.multiplyScalar(0.7)

    _tmpV.copy(playerPos).sub(this.group.position).setY(0).normalize()
    _tmpV2.set(-_tmpV.z, 0, _tmpV.x).multiplyScalar(Math.sin(this.stateTimer * 3) * 1.6)
    this.velocity.addScaledVector(_tmpV2, dt * 8)

    if (dist > this.attackRange * 1.15) {
      this.enterState(EnemyState.Chase)
      return
    }

    if (this.fireCd <= 0) {
      this.firePlasma(playerPos, projectiles)
      this.fireCd = this.attackCooldown * (0.85 + Math.random() * 0.3)
      if (Math.random() < this.coverChance && this.health < this.maxHealth * 0.5) {
        this.enterState(EnemyState.Cover)
      }
    }
  }

  private updateCover(dt: number, playerPos: THREE.Vector3): void {
    this.coverTimer -= dt
    this.moveToward(this.coverPoint, this.speed * 1.1)
    this.faceToward(playerPos, dt * this.turnSpeed)
    if (this.group.position.distanceTo(this.coverPoint) < 0.7) this.velocity.multiplyScalar(0.5)
    if (this.coverTimer <= 0) this.enterState(EnemyState.Shoot)
  }

  private pickCoverPoint(): void {
    const away = _tmpV.copy(this.group.position).sub(this.home).setY(0)
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5)
    away.normalize()
    const lateral = _tmpV2.set(-away.z, 0, away.x).multiplyScalar((Math.random() - 0.5) * 4)
    this.coverPoint
      .copy(this.group.position)
      .addScaledVector(away, 3 + Math.random() * 3)
      .add(lateral)
    this.coverPoint.y = this.home.y
  }

  private firePlasma(playerPos: THREE.Vector3, projectiles: ProjectileManager): void {
    const origin = this.weaponMuzzle.getWorldPosition(_tmpV)
    const dir = _tmpV2.copy(playerPos).add(new THREE.Vector3(0, 1.2, 0)).sub(origin).normalize()
    const spread = this.kind === 'elite' ? 0.02 : 0.045
    dir.x += (Math.random() - 0.5) * spread
    dir.y += (Math.random() - 0.5) * spread * 0.6
    dir.z += (Math.random() - 0.5) * spread
    dir.normalize()

    projectiles.spawn(origin.clone(), dir, this.projectileSpeed, {
      damage: this.projectileDamage,
      fromPlayer: false,
      color: this.kind === 'elite' ? 0x44ffaa : 0xc44dff,
    })
  }

  private moveToward(target: THREE.Vector3, speed: number): void {
    _tmpV.copy(target).sub(this.group.position)
    _tmpV.y = 0
    const len = _tmpV.length()
    if (len < 0.05) {
      this.velocity.set(0, 0, 0)
      return
    }
    _tmpV.multiplyScalar(speed / len)
    this.velocity.lerp(_tmpV, 0.18)
  }

  private faceToward(target: THREE.Vector3, amount: number): void {
    _tmpV.copy(target).sub(this.group.position)
    _tmpV.y = 0
    if (_tmpV.lengthSq() < 0.0001) return
    _tmpV.normalize()
    const yaw = Math.atan2(_tmpV.x, _tmpV.z)
    _tmpQ.setFromAxisAngle(_up, yaw)
    this.group.quaternion.slerp(_tmpQ, Math.min(1, amount))
  }

  private applyLocomotion(dt: number): void {
    this.group.position.addScaledVector(this.velocity, dt)
    this.group.position.y = this.home.y
    const speed = this.velocity.length()
    if (speed > 0.2) {
      this.group.position.y = this.home.y + Math.abs(Math.sin(this.stateTimer * 10)) * 0.03
    }
  }

  private updateShields(dt: number): void {
    if (this.shield >= this.maxShield) return
    if (this.shieldCooldown > 0) {
      this.shieldCooldown -= dt
      return
    }
    const rate = this.kind === 'elite' ? 32 : 18
    this.shield = Math.min(this.maxShield, this.shield + rate * dt)
  }

  private updateShieldVisual(): void {
    const ratio = this.maxShield > 0 ? this.shield / this.maxShield : 0
    this.shieldMesh.visible = ratio > 0.01
    this.shieldMat.opacity = 0.12 + ratio * 0.28
    this.shieldMat.emissiveIntensity = 0.25 + ratio * 0.55
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.03 * ratio
    this.shieldMesh.scale.set(pulse, pulse * 1.15, pulse)
  }

  private triggerHitReact(point: THREE.Vector3): void {
    this.hitReactTimer = 0.18
    this.enterState(EnemyState.HitReact)
    _tmpV.copy(this.group.position).sub(point).setY(0).normalize()
    this.velocity.copy(_tmpV).multiplyScalar(2.5)
    this.bodyMat.emissiveIntensity = 0.8
  }

  private beginDeath(effects: EffectsManager): void {
    this.alive = false
    this.health = 0
    this.shield = 0
    this.shieldMesh.visible = false
    this.enterState(EnemyState.Dying)
    this.deathT = 0
    this.deathSpin = (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random())
    this.velocity.set((Math.random() - 0.5) * 3, 2.5, (Math.random() - 0.5) * 3)
    effects.spawnExplosion(
      this.group.position.clone().add(new THREE.Vector3(0, 1, 0)),
      this.kind === 'elite' ? 0x44ffaa : 0xff6622,
      this.kind === 'elite' ? 1.15 : 0.85,
    )
  }

  private updateDeath(dt: number): void {
    this.deathT += dt
    this.group.position.addScaledVector(this.velocity, dt)
    this.velocity.y -= 14 * dt
    this.velocity.x *= 0.98
    this.velocity.z *= 0.98
    this.group.rotation.x += this.deathSpin * dt
    this.group.rotation.z += this.deathSpin * 0.6 * dt
    const t = Math.min(1, this.deathT / 1.1)
    this.group.scale.setScalar(Math.max(0.01, 1 - t * 0.35))

    if (this.group.position.y < this.home.y - 0.2) {
      this.group.position.y = this.home.y - 0.2
      this.velocity.y *= -0.2
    }

    if (this.deathT > 1.4) {
      this.state = EnemyState.Dead
      this.group.visible = false
    }
  }
}
