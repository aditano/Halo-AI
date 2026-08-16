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
import { HaloCEMenuWorld } from '../ui/HaloCEMenuWorld'
import { applyEnvironmentMap } from '../rendering/EnvironmentMap'

export class Game {
  private running = false
  private last = 0
  private footT = 0
  private readonly renderer
  private readonly sky
  private readonly lighting
  private readonly envRoot: THREE.Group
  private readonly player: PlayerController
  private readonly audio = new AudioManager()
  private readonly damage = new DamageSystem()
  private readonly projectiles: ProjectileManager
  private readonly effects: EffectsManager
  private readonly enemies: EnemyManager
  private readonly weapons: WeaponSystem
  private readonly hud: HUD
  private readonly menu: MainMenu
  private readonly ceMenu: HaloCEMenuWorld
  private statusEl: HTMLElement | null = null
  private readonly lookDir = new THREE.Vector3()
  private menuMusicStarted = false
  private readonly heardProjectiles = new WeakSet<object>()

  constructor(container: HTMLElement) {
    this.renderer = createRenderer(container)
    applyEnvironmentMap(this.renderer.renderer, this.renderer.scene)
    this.sky = createSkyAtmosphere(this.renderer.scene)
    this.lighting = setupLighting(this.renderer.scene)

    const env = buildEnvironment(this.renderer.scene)
    this.envRoot = env.root
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
        if (killed) {
          this.audio.enemyDeathAt(point)
          this.hud.pushKillFeed(head ? 'HEADSHOT' : 'HOSTILE', this.weapons.def.name)
          this.audio.setMusicIntensity(Math.min(1, this.audioIntensity() + 0.15))
        }
      },
    )

    this.ceMenu = new HaloCEMenuWorld(this.renderer.scene)
    this.hud = new HUD({ parent: container })
    this.menu = new MainMenu({
      parent: container,
      title: 'RINGFALL',
      subtitle: 'Infinite Protocols',
      onPlay: () => this.start(),
      requestPointerLockTarget: this.renderer.renderer.domElement,
    })
    this.statusEl = this.menu.root.querySelector('.rf-menu-sub') as HTMLElement | null

    this.enterMenuWorld()

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
      this.audio.setMusicIntensity(Math.min(1, this.audioIntensity() + 0.35))
      this.audio.setMusicMode('combat')
    })

    this.bindInput()
    // Kick Gregorian menu bed on first gesture
    const kickMusic = () => {
      if (this.menuMusicStarted) return
      this.menuMusicStarted = true
      void this.audio.resume().then(() => this.audio.setMusicMode('menu'))
    }
    window.addEventListener('pointerdown', kickMusic, { once: true })
    window.addEventListener('keydown', kickMusic, { once: true })

    this.player.onPointerUnlock(() => {
      if (this.running && this.damage.alive) {
        this.enterMenuWorld()
        this.menu.show()
        this.hud.hide()
        this.audio.setMusicMode('menu')
      }
    })

    this.last = performance.now()
    requestAnimationFrame((t) => this.frame(t))
  }

  private enterMenuWorld() {
    this.ceMenu.show()
    this.envRoot.visible = false
    this.sky.sky.visible = false
    this.lighting.lightShafts.visible = false
    this.weapons.group.visible = false
    this.renderer.setBloom(0.85)
  }

  private enterGameplayWorld() {
    this.ceMenu.hide()
    this.envRoot.visible = true
    this.sky.sky.visible = true
    this.lighting.lightShafts.visible = true
    this.weapons.group.visible = true
    this.renderer.setBloom(0.45)
    this.renderer.camera.fov = 75
    this.renderer.camera.updateProjectionMatrix()
  }

  private audioIntensity(): number {
    const alive = this.enemies.enemies.filter((e) => e.alive)
    if (alive.length === 0) return 0
    let nearest = Infinity
    for (const e of alive) {
      nearest = Math.min(nearest, e.group.position.distanceTo(this.player.position))
    }
    const proximity = THREE.MathUtils.clamp(1 - nearest / 35, 0, 1)
    return THREE.MathUtils.clamp(alive.length / 10 + proximity * 0.5, 0, 1)
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
    this.enterGameplayWorld()
    this.audio.setMusicMode('explore')
    this.audio.setMusicIntensity(0.15)
    this.hud.showBanner(`WAVE ${Math.max(1, this.enemies.waveNumber || 1)}`)
    this.player.lock()
    this.renderer.camera.position.copy(this.player.position)
    this.renderer.camera.rotation.set(0, 0, 0)
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

    this.audio.updateMusic(dt)

    const onMenu = !this.running || !this.player.locked || this.menu.isVisible
    if (onMenu) {
      this.ceMenu.updateCamera(this.renderer.camera, dt)
    } else {
      this.lighting.update(dt)
      this.sky.update(this.renderer.camera)
    }

    if (this.running && this.player.locked && this.damage.alive) {
      this.player.update(dt)
      this.player.getLookDirection(this.lookDir)
      this.audio.setListener(this.player.position, this.lookDir)

      const moving =
        this.player.keys.forward ||
        this.player.keys.back ||
        this.player.keys.left ||
        this.player.keys.right
      this.weapons.update(dt, moving, this.player.grounded)
      this.damage.update(dt)
      this.enemies.update(dt, this.player.position)
      this.projectiles.update(dt)
      this.hearWorldProjectiles()
      this.resolveProjectileHits()
      this.effects.update(dt)
      this.effects.applyShakeToCamera(this.renderer.camera, dt)
      this.hud.update(dt)
      this.syncHud()

      const heat = this.audioIntensity()
      this.audio.setMusicIntensity(heat)
      if (heat > 0.35) this.audio.setMusicMode('combat')
      else if (heat < 0.15) this.audio.setMusicMode('explore')

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
      this.enterMenuWorld()
      this.menu.show()
      this.audio.setMusicMode('menu')
      if (this.statusEl) {
        this.statusEl.textContent = `KIA — ${this.enemies.kills} eliminations. Deploy again.`
      }
    }

    this.renderer.render(dt)
    requestAnimationFrame((t) => this.frame(t))
  }

  private hearWorldProjectiles() {
    for (const p of this.projectiles.projectiles) {
      if (p.fromPlayer || this.heardProjectiles.has(p)) continue
      this.heardProjectiles.add(p)
      this.audio.plasmaFireAt(p.mesh.position)
    }
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
              this.audio.enemyDeathAt(e.group.position)
              this.hud.pushKillFeed('HOSTILE', 'Plasma')
            }
            p.alive = false
            this.effects.spawnPlasmaImpact(p.mesh.position.clone(), new THREE.Vector3(0, 1, 0))
            break
          }
        }
      } else if (p.mesh.position.distanceTo(playerPos) < 1.2) {
        this.damage.applyDamage(p.damage, p.mesh.position.clone())
        this.audio.plasmaFireAt(p.mesh.position)
        p.alive = false
        this.effects.spawnPlasmaImpact(p.mesh.position.clone(), new THREE.Vector3(0, 1, 0))
      }
    }
  }
}
