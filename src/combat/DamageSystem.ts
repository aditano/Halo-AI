import * as THREE from 'three'
import type { DamageEvent as SharedDamageEvent } from '../types'

export type DamageEvent = SharedDamageEvent & {
  toShield: number
  toHealth: number
  shieldBroken: boolean
}

export interface DamageSystemOptions {
  maxHealth?: number
  maxShield?: number
  /** Seconds after last hit before shields begin recharging. */
  shieldRechargeDelay?: number
  /** Shield points restored per second once recharging. */
  shieldRechargeRate?: number
}

export interface DamageDirectionSample {
  /** World-space unit vector from victim toward damage source. */
  direction: THREE.Vector3
  intensity: number
  age: number
}

const DEFAULTS = {
  maxHealth: 100,
  maxShield: 100,
  shieldRechargeDelay: 5,
  shieldRechargeRate: 42,
} as const

/**
 * Classic Halo Spartan defenses: energy shields first, then health.
 * Shields recharge after a combat delay; exposes damage directions for HUD.
 */
export class DamageSystem {
  maxHealth: number
  maxShield: number
  health: number
  shield: number
  alive = true

  private readonly rechargeDelay: number
  private readonly rechargeRate: number
  private timeSinceDamage = Infinity
  private wasRecharging = false
  private readonly directions: DamageDirectionSample[] = []
  private readonly damageListeners = new Set<(e: DamageEvent) => void>()
  private readonly shieldPopListeners = new Set<(source: THREE.Vector3) => void>()
  private readonly deathListeners = new Set<() => void>()
  private readonly tmp = new THREE.Vector3()

  constructor(options: DamageSystemOptions = {}) {
    this.maxHealth = options.maxHealth ?? DEFAULTS.maxHealth
    this.maxShield = options.maxShield ?? DEFAULTS.maxShield
    this.rechargeDelay = options.shieldRechargeDelay ?? DEFAULTS.shieldRechargeDelay
    this.rechargeRate = options.shieldRechargeRate ?? DEFAULTS.shieldRechargeRate
    this.health = this.maxHealth
    this.shield = this.maxShield
  }

  getDamageDirections(): readonly DamageDirectionSample[] {
    return this.directions
  }

  isRecharging(): boolean {
    return this.alive && this.shield < this.maxShield && this.timeSinceDamage >= this.rechargeDelay
  }

  onDamage(cb: (e: DamageEvent) => void): () => void {
    this.damageListeners.add(cb)
    return () => this.damageListeners.delete(cb)
  }

  /** Hook for shield-break VFX / audio. */
  onShieldPop(cb: (source: THREE.Vector3) => void): () => void {
    this.shieldPopListeners.add(cb)
    return () => this.shieldPopListeners.delete(cb)
  }

  onDeath(cb: () => void): () => void {
    this.deathListeners.add(cb)
    return () => this.deathListeners.delete(cb)
  }

  /**
   * Apply damage. `source` is the world position of the attacker / projectile
   * (used for HUD damage indicators).
   */
  applyDamage(amount: number, source?: THREE.Vector3): DamageEvent {
    const src = source?.clone() ?? new THREE.Vector3(0, 0, 0)
    if (!this.alive || amount <= 0) {
      return {
        amount: 0,
        source: src,
        isShield: this.shield > 0,
        isFatal: false,
        toShield: 0,
        toHealth: 0,
        shieldBroken: false,
      }
    }

    this.timeSinceDamage = 0
    this.wasRecharging = false

    const dir = this.tmp.copy(src).sub(new THREE.Vector3(0, 0, 0))
    // Direction stored relative later by HUD via source position; keep a world dir sample.
    if (dir.lengthSq() > 1e-6) this.pushDirection(dir.normalize(), Math.min(1, amount / 35))
    else this.pushDirection(new THREE.Vector3(0, 0, -1), Math.min(1, amount / 35))

    let remaining = amount
    let toShield = 0
    let toHealth = 0
    const hadShield = this.shield > 0.5
    const absorbedByShield = hadShield

    if (this.shield > 0) {
      toShield = Math.min(this.shield, remaining)
      this.shield -= toShield
      remaining -= toShield
    }

    if (remaining > 0) {
      toHealth = Math.min(this.health, remaining)
      this.health -= toHealth
    }

    const shieldBroken = hadShield && this.shield <= 0.5
    if (shieldBroken) {
      this.shield = 0
      for (const cb of this.shieldPopListeners) cb(src.clone())
    }

    let isFatal = false
    if (this.health <= 0) {
      this.health = 0
      this.alive = false
      isFatal = true
      for (const cb of this.deathListeners) cb()
    }

    const event: DamageEvent = {
      amount,
      source: src,
      isShield: absorbedByShield && toHealth === 0,
      isFatal,
      toShield,
      toHealth,
      shieldBroken,
    }
    for (const cb of this.damageListeners) cb(event)
    return event
  }

  heal(amount: number): void {
    if (!this.alive || amount <= 0) return
    this.health = Math.min(this.maxHealth, this.health + amount)
  }

  restoreShield(amount: number): void {
    if (!this.alive || amount <= 0) return
    this.shield = Math.min(this.maxShield, this.shield + amount)
  }

  reset(): void {
    this.alive = true
    this.health = this.maxHealth
    this.shield = this.maxShield
    this.timeSinceDamage = Infinity
    this.wasRecharging = false
    this.directions.length = 0
  }

  update(dt: number): void {
    const clamped = Math.min(dt, 0.1)
    this.timeSinceDamage += clamped

    for (let i = this.directions.length - 1; i >= 0; i--) {
      const d = this.directions[i]!
      d.age += clamped
      d.intensity = Math.max(0, d.intensity - clamped * 0.85)
      if (d.intensity <= 0.02 || d.age > 2.5) this.directions.splice(i, 1)
    }

    if (!this.alive) return

    if (this.shield < this.maxShield && this.timeSinceDamage >= this.rechargeDelay) {
      this.wasRecharging = true
      this.shield = Math.min(this.maxShield, this.shield + this.rechargeRate * clamped)
    } else if (this.wasRecharging && this.shield >= this.maxShield) {
      this.wasRecharging = false
    }
  }

  /**
   * Angles relative to facing for HUD wedges (degrees, -180..180).
   */
  getHudAngles(_playerPos: THREE.Vector3, facing: THREE.Vector3): { angle: number; intensity: number }[] {
    const forward = facing.clone()
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    else forward.normalize()

    return this.directions.map((d) => {
      const flat = d.direction.clone()
      flat.y = 0
      if (flat.lengthSq() < 1e-6) return { angle: 0, intensity: d.intensity }
      flat.normalize()
      const angle = THREE.MathUtils.radToDeg(
        Math.atan2(flat.x, flat.z) - Math.atan2(forward.x, forward.z),
      )
      return { angle, intensity: d.intensity }
    })
  }

  private pushDirection(dir: THREE.Vector3, intensity: number): void {
    for (const d of this.directions) {
      if (d.direction.dot(dir) > 0.85) {
        d.direction.lerp(dir, 0.35).normalize()
        d.intensity = Math.min(1, d.intensity + intensity)
        d.age = 0
        return
      }
    }
    this.directions.push({ direction: dir.clone(), intensity, age: 0 })
    if (this.directions.length > 8) this.directions.shift()
  }
}
