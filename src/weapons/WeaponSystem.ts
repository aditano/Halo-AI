import * as THREE from 'three'
import { forerunnerGold, forerunnerMetal, unscMatte } from '../rendering/Materials'
import type { AudioManager } from '../audio/AudioManager'
import type { ProjectileManager } from './Projectile'
import type { EffectsManager } from '../vfx/EffectsManager'

export type WeaponId = 'br' | 'ar' | 'plasma'

export type WeaponDef = {
  id: WeaponId
  name: string
  magSize: number
  reserve: number
  fireRate: number
  damage: number
  bloomPerShot: number
  bloomDecay: number
  maxBloom: number
  recoil: number
  reloadTime: number
  burst?: number
  burstGap?: number
  hitscan: boolean
  projectileSpeed?: number
  adsFov: number
}

const DEFS: Record<WeaponId, WeaponDef> = {
  br: {
    id: 'br',
    name: 'BR-75',
    magSize: 36,
    reserve: 144,
    fireRate: 6.5,
    damage: 22,
    bloomPerShot: 0.012,
    bloomDecay: 4.5,
    maxBloom: 0.08,
    recoil: 0.018,
    reloadTime: 1.7,
    burst: 3,
    burstGap: 0.055,
    hitscan: true,
    adsFov: 52,
  },
  ar: {
    id: 'ar',
    name: 'MA40',
    magSize: 36,
    reserve: 216,
    fireRate: 11,
    damage: 12,
    bloomPerShot: 0.018,
    bloomDecay: 5,
    maxBloom: 0.12,
    recoil: 0.012,
    reloadTime: 2.0,
    hitscan: true,
    adsFov: 58,
  },
  plasma: {
    id: 'plasma',
    name: 'Plasma Pistol',
    magSize: 100,
    reserve: 0,
    fireRate: 4.5,
    damage: 20,
    bloomPerShot: 0.01,
    bloomDecay: 3,
    maxBloom: 0.06,
    recoil: 0.01,
    reloadTime: 1.4,
    hitscan: false,
    projectileSpeed: 55,
    adsFov: 60,
  },
}

export class WeaponSystem {
  current: WeaponId = 'br'
  ammo: Record<WeaponId, { mag: number; reserve: number }> = {
    br: { mag: 36, reserve: 144 },
    ar: { mag: 36, reserve: 216 },
    plasma: { mag: 100, reserve: 0 },
  }

  ads = false
  bloom = 0
  private fireCooldown = 0
  private reloading = false
  private reloadT = 0
  private burstLeft = 0
  private burstTimer = 0
  private muzzleFlash = 0
  private swayT = 0
  private recoilPitch = 0
  private firing = false

  readonly group = new THREE.Group()
  private models: Record<WeaponId, THREE.Group>
  private muzzleLight: THREE.PointLight
  private readonly raycaster = new THREE.Raycaster()
  private readonly aim = new THREE.Vector3()
  private readonly spreadDir = new THREE.Vector3()

  private camera: THREE.PerspectiveCamera
  private audio: AudioManager
  private projectiles: ProjectileManager
  private effects: EffectsManager
  private getEnemyMeshes: () => THREE.Object3D[]
  private onHitEnemy: (id: string, damage: number, point: THREE.Vector3, headshot: boolean) => void

  constructor(
    camera: THREE.PerspectiveCamera,
    audio: AudioManager,
    projectiles: ProjectileManager,
    effects: EffectsManager,
    getEnemyMeshes: () => THREE.Object3D[],
    onHitEnemy: (id: string, damage: number, point: THREE.Vector3, headshot: boolean) => void,
  ) {
    this.camera = camera
    this.audio = audio
    this.projectiles = projectiles
    this.effects = effects
    this.getEnemyMeshes = getEnemyMeshes
    this.onHitEnemy = onHitEnemy

    this.models = {
      br: this.buildBR(),
      ar: this.buildAR(),
      plasma: this.buildPlasma(),
    }
    for (const m of Object.values(this.models)) {
      m.visible = false
      this.group.add(m)
    }
    this.models.br.visible = true
    this.muzzleLight = new THREE.PointLight(0xffcc88, 0, 8)
    this.muzzleLight.position.set(0.15, -0.05, -0.9)
    this.group.add(this.muzzleLight)
    camera.add(this.group)
    this.group.position.set(0.28, -0.28, -0.45)
  }

  get def(): WeaponDef {
    return DEFS[this.current]
  }

  get ammoState() {
    return this.ammo[this.current]
  }

  switchWeapon(id: WeaponId) {
    if (this.reloading) return
    this.current = id
    this.burstLeft = 0
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id
    this.audio.weaponSwap()
  }

  cycleWeapon(dir: 1 | -1) {
    const order: WeaponId[] = ['br', 'ar', 'plasma']
    const i = order.indexOf(this.current)
    this.switchWeapon(order[(i + dir + order.length) % order.length])
  }

  startReload() {
    const a = this.ammo[this.current]
    const def = this.def
    if (this.reloading || a.mag >= def.magSize) return
    if (this.current !== 'plasma' && a.reserve <= 0) return
    this.reloading = true
    this.reloadT = def.reloadTime
    this.burstLeft = 0
    this.audio.reload()
  }

  setFiring(down: boolean) {
    if (down && this.def.burst && this.fireCooldown <= 0 && !this.reloading) {
      this.burstLeft = this.def.burst
      this.burstTimer = 0
    }
    this.firing = down
  }

  setAds(down: boolean) {
    this.ads = down
  }

  update(dt: number, moving: boolean, grounded: boolean) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    this.bloom = Math.max(0, this.bloom - this.def.bloomDecay * dt * Math.max(this.bloom, 0.001))
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 12)
    this.muzzleLight.intensity = this.muzzleFlash * 4
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 10, dt)

    if (this.reloading) {
      this.reloadT -= dt
      if (this.reloadT <= 0) this.finishReload()
    }

    if (!this.reloading) {
      if (this.def.burst) {
        if (this.burstLeft > 0) {
          this.burstTimer -= dt
          if (this.burstTimer <= 0) {
            this.fireOnce()
            this.burstLeft--
            this.burstTimer = this.def.burstGap ?? 0.05
            if (this.burstLeft === 0) this.fireCooldown = 1 / this.def.fireRate
          }
        }
      } else if (this.firing && this.fireCooldown <= 0) {
        this.fireOnce()
        this.fireCooldown = 1 / this.def.fireRate
      }
    }

    const targetFov = this.ads ? this.def.adsFov : 75
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt)
    this.camera.updateProjectionMatrix()

    this.swayT += dt * (moving ? (grounded ? 9 : 4) : 1.5)
    const bobAmp = moving && grounded ? 0.02 : 0.006
    const adsMul = this.ads ? 0.35 : 1
    const baseX = this.ads ? 0.05 : 0.28
    const baseY = this.ads ? -0.18 : -0.28
    const baseZ = this.ads ? -0.35 : -0.45
    this.group.position.set(
      baseX + Math.sin(this.swayT * 0.7) * 0.004 * adsMul,
      baseY + Math.sin(this.swayT) * bobAmp * adsMul + this.recoilPitch * 0.5,
      baseZ + this.recoilPitch * -0.4,
    )
    this.group.rotation.x = this.recoilPitch
    this.group.rotation.y = Math.sin(this.swayT * 0.5) * 0.01 * adsMul
    this.group.rotation.z = Math.sin(this.swayT * 0.5) * 0.01 * adsMul

    if (this.current === 'plasma' && !this.firing) {
      this.ammo.plasma.mag = Math.min(100, this.ammo.plasma.mag + 25 * dt)
    }
  }

  private finishReload() {
    const def = this.def
    const a = this.ammo[this.current]
    this.reloading = false
    if (this.current === 'plasma') {
      a.mag = def.magSize
      return
    }
    const need = def.magSize - a.mag
    const take = Math.min(need, a.reserve)
    a.mag += take
    a.reserve -= take
  }

  private fireOnce() {
    const a = this.ammo[this.current]
    if (a.mag <= 0) {
      this.audio.empty()
      this.startReload()
      return
    }
    a.mag--
    this.audio.playWeaponFire(this.current)
    this.muzzleFlash = 1
    this.bloom = Math.min(this.def.maxBloom, this.bloom + this.def.bloomPerShot * (this.ads ? 0.45 : 1))
    this.recoilPitch += this.def.recoil * (this.ads ? 0.6 : 1)
    this.effects.addTrauma(0.04)

    this.camera.getWorldDirection(this.aim)
    const spreadAmt = this.bloom * (this.ads ? 0.4 : 1)
    this.spreadDir
      .set(
        this.aim.x + (Math.random() - 0.5) * spreadAmt,
        this.aim.y + (Math.random() - 0.5) * spreadAmt,
        this.aim.z + (Math.random() - 0.5) * spreadAmt,
      )
      .normalize()

    const origin = this.camera.getWorldPosition(new THREE.Vector3())
    const muzzle = origin.clone().addScaledVector(this.spreadDir, 0.8)
    this.effects.spawnMuzzleSparks(muzzle, this.spreadDir)

    if (this.def.hitscan) {
      this.raycaster.set(origin, this.spreadDir)
      this.raycaster.far = 200
      const hits = this.raycaster.intersectObjects(this.getEnemyMeshes(), true)
      let end = origin.clone().addScaledVector(this.spreadDir, 120)
      if (hits.length) {
        const h = hits[0]
        end = h.point.clone()
        let obj: THREE.Object3D | null = h.object
        let enemyId: string | undefined
        let headshot = false
        while (obj) {
          if (obj.userData.enemyId) {
            enemyId = obj.userData.enemyId as string
            headshot = !!obj.userData.isHead
            break
          }
          obj = obj.parent
        }
        if (enemyId) {
          this.onHitEnemy(enemyId, this.def.damage * (headshot ? 1.5 : 1), h.point, headshot)
          this.effects.spawnPlasmaImpact(h.point, h.face?.normal ?? new THREE.Vector3(0, 1, 0), 0xffaa55)
        }
      }
      this.effects.spawnTracer({
        origin: muzzle,
        end,
        color: this.current === 'br' ? 0xffe0a0 : 0xffd080,
      })
    } else {
      this.projectiles.spawn(muzzle, this.spreadDir, this.def.projectileSpeed ?? 50, {
        damage: this.def.damage,
        fromPlayer: true,
        color: 0x66aaff,
      })
    }
  }

  private buildBR(): THREE.Group {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55), unscMatte('#3a4550')).translateZ(-0.15))
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), forerunnerMetal(0.2))
    barrel.position.set(0, 0.02, -0.5)
    g.add(barrel)
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), forerunnerGold())
    scope.position.set(0, 0.12, -0.1)
    g.add(scope)
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), unscMatte('#2a3038'))
    mag.position.set(0, -0.12, -0.05)
    g.add(mag)
    return g
  }

  private buildAR(): THREE.Group {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.5), unscMatte('#404850')))
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.45, 8), forerunnerMetal(0.15))
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.02, -0.45)
    g.add(barrel)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), unscMatte('#2c333c'))
    stock.position.set(0, -0.02, 0.28)
    g.add(stock)
    return g
  }

  private buildPlasma(): THREE.Group {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), forerunnerMetal(0.5))
    body.scale.set(1, 0.7, 1.3)
    g.add(body)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), forerunnerGold())
    core.position.z = -0.12
    g.add(core)
    return g
  }
}
