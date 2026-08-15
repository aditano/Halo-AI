import * as THREE from 'three'
import { createRenderer } from '../rendering/RendererSetup'
import { createSkyAtmosphere } from '../world/SkyAtmosphere'
import { setupLighting } from '../world/Lighting'
import { buildEnvironment } from '../world/Environment'
import { PlayerController } from '../player/PlayerController'
import { AudioManager } from '../audio/AudioManager'
import { DamageSystem } from '../combat/DamageSystem'
import { ProjectileManager } from '../weapons/Projectile'
import { WeaponSystem } from '../weapons/WeaponSystem'
import { EffectsManager } from '../vfx/EffectsManager'
import { EnemyManager } from '../enemies/EnemyManager'
import { HUD } from '../ui/HUD'
import { MainMenu } from '../ui/MainMenu'

export class Game {
  private running = false
  private last = 0
  private footT = 0
  private readonly renderer
  private readonly sky
  private readonly lighting
  private readonly player: PlayerController
  private readonly audio = new AudioManager()
  private readonly damage = new DamageSystem()
  private readonly projectiles: ProjectileManager
  private readonly effects: EffectsManager
  private readonly enemies: EnemyManager
  private readonly weapons: WeaponSystem
  private readonly hud: HUD
  private readonly menu: MainMenu
  private statusEl: HTMLElement | null = null

  constructor(container: HTMLElement) {
    this.renderer = createRenderer(container)
    this.sky = createSkyAtmosphere(this.renderer.scene)
    this.lighting = setupLighting(this.renderer.scene)

    const env = buildEnvironment(this.renderer.scene)
    this.player = new PlayerController(this.renderer.camera, this.renderer.renderer.domElement)
    this.player.setColliders(env.colliders)
    if (env.spawnPoints[0]) {
      this.player.position.copy(env.spawnPoints[0].position)
      this.player.position.y = Math.max(this.player.position.y, 1.7)
    }

    this.projectiles = new ProjectileManager(this.renderer.scene)
    this.effects = new EffectsManager(this.renderer.scene)
    this.enemies = new EnemyManager(
      this.renderer.scene,
      env.enemySpawns,
      this.projectiles,
      this.effects,
      this.audio,
    )

    this.weapons = new WeaponSystem(
      this.renderer.camera,
      this.audio,
      this.projectiles,
      this.effects,
      () => this.enemies.getMeshes(),
      (id, dmg, point, head) => {
        const killed = this.enemies.damageEnemy(id, dmg, point, head)
        this.audio.hitmarker()
        this.hud.flashHitmarker(head)
        if (killed) this.hud.pushKillFeed(head ? 'HEADSHOT' : 'HOSTILE', this.weapons.def.name)
      },
    )

    this.hud = new HUD({ parent: container })
    this.menu = new MainMenu({
      parent: container,
      onPlay: () => this.start(),
      requestPointerLockTarget: this.renderer.renderer.domElement,
    })
    this.statusEl = this.menu.root.querySelector('.rf-menu-sub') as HTMLElement | null

    this.damage.onDamage((e) => {
      if (e.toShield > 0) this.audio.shieldHit()
      if (e.shieldBroken) this.audio.shieldBreak()
      if (e.toHealth > 0) this.audio.shieldHit()
      const to = e.source.clone().sub(this.player.position)
      const angle = Math.atan2(to.x, to.z)
      this.hud.showDamageDirection(angle)
      this.effects.addTrauma(0.1)
      if (e.shieldBroken) {
        this.effects.spawnShieldRipple(this.player.position.clone())
      }
    })

    this.bindInput()
    this.player.onPointerUnlock(() => {
      if (this.running && this.damage.alive) {
        this.menu.show()
        this.hud.hide()
      }
    })

    this.last = performance.now()
    requestAnimationFrame((t) => this.frame(t))
  }

  private bindInput() {
    const el = this.renderer.renderer.domElement
    el.addEventListener('mousedown', (e) => {
      if (!this.player.locked) return
      if (e.button === 0) this.weapons.setFiring(true)
      if (e.button === 2) this.weapons.setAds(true)
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.weapons.setFiring(false)
      if (e.button === 2) this.weapons.setAds(false)
    })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', (e) => {
      if (!this.running) return
      if (e.code === 'KeyR') this.weapons.startReload()
      if (e.code === 'Digit1') this.weapons.switchWeapon('br')
      if (e.code === 'Digit2') this.weapons.switchWeapon('ar')
      if (e.code === 'Digit3') this.weapons.switchWeapon('plasma')
      if (e.code === 'KeyQ') this.weapons.cycleWeapon(-1)
    })
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.player.locked) return
        this.weapons.cycleWeapon(e.deltaY > 0 ? 1 : -1)
      },
      { passive: true },
    )
  }

  start() {
    void this.audio.resume()
    this.audio.ui()
    this.running = true
    this.damage.reset()
    this.menu.hide()
    this.hud.show()
    this.hud.showBanner(`WAVE ${Math.max(1, this.enemies.waveNumber || 1)}`)
    this.player.lock()
    if (this.enemies.enemies.filter((e) => e.alive).length === 0) {
      this.enemies.startWave(6)
    }
  }

  private syncHud() {
    this.hud.setVitals({
      health: this.damage.health,
      maxHealth: this.damage.maxHealth,
      shields: this.damage.shield,
      maxShields: this.damage.maxShield,
    })
    const a = this.weapons.ammoState
    this.hud.setWeapon({
      name: this.weapons.def.name,
      ammo: Math.floor(a.mag),
      reserve: a.reserve,
      isEnergy: this.weapons.current === 'plasma',
      heat: this.weapons.current === 'plasma' ? a.mag / 100 : undefined,
    })
    this.hud.setADS(this.weapons.ads)
    this.hud.setHeat(this.weapons.bloom / Math.max(this.weapons.def.maxBloom, 0.001))
  }

  private frame(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now

    this.lighting.update(dt)
    this.sky.update(this.renderer.camera)

    if (this.running && this.player.locked && this.damage.alive) {
      this.player.update(dt)
      const moving =
        this.player.keys.forward ||
        this.player.keys.back ||
        this.player.keys.left ||
        this.player.keys.right
      this.weapons.update(dt, moving, this.player.grounded)
      this.damage.update(dt)
      this.enemies.update(dt, this.player.position)
      this.projectiles.update(dt)
      this.resolveProjectileHits()
      this.effects.update(dt)
      this.effects.applyShakeToCamera(this.renderer.camera, dt)
      this.hud.update(dt)
      this.syncHud()

      if (moving && this.player.grounded) {
        this.footT += dt * (this.player.keys.sprint ? 2.2 : 1.6)
        if (this.footT > 1) {
          this.footT = 0
          this.audio.footstep(this.player.keys.sprint)
        }
      }
    } else {
      this.effects.update(dt)
    }

    if (!this.damage.alive && this.running) {
      this.running = false
      this.hud.hide()
      this.menu.show()
      if (this.statusEl) {
        this.statusEl.textContent = `KIA — ${this.enemies.kills} eliminations. Deploy again.`
      }
    }

    this.renderer.render(dt)
    requestAnimationFrame((t) => this.frame(t))
  }

  private resolveProjectileHits() {
    const playerPos = this.player.position
    for (const p of this.projectiles.projectiles) {
      if (!p.alive) continue
      if (p.fromPlayer) {
        for (const e of this.enemies.enemies) {
          if (!e.alive) continue
          const center = e.group.position.clone().setY(e.group.position.y + 1)
          if (p.mesh.position.distanceTo(center) < 1.1) {
            const killed = e.takeDamage(p.damage, p.mesh.position.clone(), this.effects)
            this.audio.hitmarker()
            this.hud.flashHitmarker(false)
            if (killed) {
              this.enemies.kills++
              this.audio.enemyDeath()
              this.hud.pushKillFeed('HOSTILE', 'Plasma')
            }
            p.alive = false
            this.effects.spawnPlasmaImpact(p.mesh.position.clone(), new THREE.Vector3(0, 1, 0))
            break
          }
        }
      } else if (p.mesh.position.distanceTo(playerPos) < 1.2) {
        this.damage.applyDamage(p.damage, p.mesh.position.clone())
        p.alive = false
        this.effects.spawnPlasmaImpact(p.mesh.position.clone(), new THREE.Vector3(0, 1, 0))
      }
    }
  }
}
