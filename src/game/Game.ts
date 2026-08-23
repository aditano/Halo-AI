import * as THREE from 'three'
import { createRenderer } from '../rendering/RendererSetup'
import type { PerformanceSettings } from '../rendering/PerformanceProfile'
import { createSkyAtmosphere } from '../world/SkyAtmosphere'
import { setupLighting } from '../world/Lighting'
import { buildEnvironment, sampleGroundHeight } from '../world/Environment'
import { PlayerController } from '../player/PlayerController'
import { AudioManager } from '../audio/AudioManager'
import { DamageSystem } from '../combat/DamageSystem'
import { ProjectileManager } from '../weapons/Projectile'
import { WeaponSystem } from '../weapons/WeaponSystem'
import { EffectsManager } from '../vfx/EffectsManager'
import { EnemyManager } from '../enemies/EnemyManager'
import { HUD } from '../ui/HUD'
import { MainMenu } from '../ui/MainMenu'
import { FpsCounter } from '../ui/FpsCounter'
import { HaloCEMenuWorld } from '../ui/HaloCEMenuWorld'
import { applyEnvironmentMap } from '../rendering/EnvironmentMap'
import { GameSettings, type UserSettings } from '../settings/GameSettings'

const DEFAULT_SUBTITLE = 'Infinite Protocols'

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
  private readonly rightDir = new THREE.Vector3()
  private readonly damageDir = new THREE.Vector3()
  private readonly spawnPos = new THREE.Vector3(0, 1.7, 22)
  private readonly projCenter = new THREE.Vector3()
  private readonly projHitPoint = new THREE.Vector3()
  private readonly upVec = new THREE.Vector3(0, 1, 0)
  private spawnYaw = Math.PI
  private menuMusicStarted = false
  private readonly heardProjectiles = new WeakSet<object>()
  private readonly aimRay = new THREE.Raycaster()
  private betweenWaveBanner = false
  private crosshairTick = 0
  private hudSyncT = 0
  private perf: PerformanceSettings
  private readonly settings = new GameSettings()
  private readonly fpsCounter: FpsCounter

  constructor(container: HTMLElement) {
    this.perf = this.settings.toPerformanceSettings()
    this.renderer = createRenderer(container, {
      performance: this.perf,
      autoDowngrade: this.settings.get().autoOptimize,
    })
    if (this.perf.environmentMap) {
      applyEnvironmentMap(this.renderer.renderer, this.renderer.scene)
    }
    this.sky = createSkyAtmosphere(this.renderer.scene)
    this.lighting = setupLighting(this.renderer.scene, {
      lightShafts: this.perf.lightShafts,
      shadowMapSize: this.perf.shadowMapSize,
    })

    const env = buildEnvironment(this.renderer.scene)
    this.envRoot = env.root
    this.player = new PlayerController(this.renderer.camera, this.renderer.renderer.domElement)
    this.player.setColliders(env.colliders)
    this.player.setGroundSampler(sampleGroundHeight)
    if (env.spawnPoints[0]) {
      this.spawnPos.copy(env.spawnPoints[0].position)
      this.spawnYaw = env.spawnPoints[0].yaw
      const ground = sampleGroundHeight(this.spawnPos.x, this.spawnPos.z)
      this.spawnPos.y = ground + 1.7
      this.player.resetTo(this.spawnPos, this.spawnYaw)
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

    this.enemies.onWaveStarted = (wave) => {
      this.betweenWaveBanner = false
      this.hud.setWave(wave)
      this.hud.showBanner(`WAVE ${wave}`)
    }
    this.enemies.onWaveCleared = (wave) => {
      if (!this.running || !this.damage.alive) return
      this.betweenWaveBanner = true
      this.hud.showBanner(`WAVE ${wave} CLEARED`)
      this.audio.setMusicIntensity(0.12)
      this.audio.setMusicMode('explore')
    }

    this.ceMenu = new HaloCEMenuWorld(this.renderer.scene)
    this.hud = new HUD({ parent: container })
    this.fpsCounter = new FpsCounter(container)
    this.menu = new MainMenu({
      parent: container,
      title: 'RINGFALL',
      subtitle: DEFAULT_SUBTITLE,
      settings: this.settings,
      onPlay: () => this.start(),
      onSettingsApply: () => this.applySettings(),
      requestPointerLockTarget: this.renderer.renderer.domElement,
    })
    this.statusEl = this.menu.root.querySelector('.rf-menu-sub') as HTMLElement | null

    this.applySettings()
    this.enterMenuWorld()

    this.damage.onDamage((e) => {
      if (e.toShield > 0) this.audio.shieldHit()
      if (e.shieldBroken) this.audio.shieldBreak()
      if (e.toHealth > 0) this.audio.shieldHit()
      this.damageDir.copy(e.source).sub(this.player.position)
      this.damageDir.y = 0
      if (this.damageDir.lengthSq() > 1e-6) {
        this.damageDir.normalize()
        this.player.getLookDirection(this.lookDir)
        this.lookDir.y = 0
        if (this.lookDir.lengthSq() < 1e-6) this.lookDir.set(0, 0, -1)
        else this.lookDir.normalize()
        this.rightDir.crossVectors(this.lookDir, this.upVec).normalize()
        const angle = Math.atan2(this.damageDir.dot(this.rightDir), this.damageDir.dot(this.lookDir))
        this.hud.showDamageDirection(angle)
      }
      this.effects.addTrauma(0.1)
      if (e.shieldBroken) {
        this.effects.spawnShieldRipple(this.player.position.clone())
      }
      this.audio.setMusicIntensity(Math.min(1, this.audioIntensity() + 0.35))
      this.audio.setMusicMode('combat')
    })

    this.bindInput()
    const kickMusic = () => {
      if (this.menuMusicStarted) return
      this.menuMusicStarted = true
      void this.audio.resume().then(() => this.audio.setMusicMode('menu'))
    }
    window.addEventListener('pointerdown', kickMusic, { once: true })
    window.addEventListener('keydown', kickMusic, { once: true })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.last = performance.now()
    })

    this.player.onPointerUnlock(() => {
      if (this.running && this.damage.alive) {
        this.pauseToMenu()
      }
    })

    this.last = performance.now()
    requestAnimationFrame((t) => this.frame(t))
  }

  private applySettings(_user?: UserSettings): void {
    this.perf = this.settings.toPerformanceSettings()
    const user = this.settings.get()
    this.renderer.applyPerformance(this.perf)
    this.renderer.setAutoDowngrade(user.autoOptimize)
    this.lighting.setShadowMapSize(this.perf.shadowMapSize)
    this.lighting.setLightShaftsEnabled(this.perf.lightShafts)
    this.audio.setMasterVolume(user.masterVolume)
    this.audio.setSfxVolume(user.sfxVolume)
    this.fpsCounter.setVisible(user.showFps)
    if (this.running && !this.menu.isVisible) {
      this.lighting.lightShafts.visible = this.perf.lightShafts && this.lighting.lightShaftsEnabled
    }
  }

  private pauseToMenu() {
    this.enterMenuWorld()
    this.menu.show()
    this.hud.hide()
    this.audio.setMusicMode('menu')
  }

  private enterMenuWorld() {
    this.ceMenu.show()
    this.envRoot.visible = false
    this.sky.sky.visible = false
    this.lighting.lightShafts.visible = false
    this.weapons.group.visible = false
    this.renderer.setBloom(0.65)
    this.renderer.setPointerCapture(false)
  }

  private enterGameplayWorld() {
    this.ceMenu.hide()
    this.envRoot.visible = true
    this.sky.sky.visible = true
    this.lighting.lightShafts.visible = this.perf.lightShafts && this.lighting.lightShaftsEnabled
    this.weapons.group.visible = true
    this.renderer.setBloom(0.45)
    this.renderer.camera.fov = 75
    this.renderer.camera.updateProjectionMatrix()
    this.renderer.setPointerCapture(true)
  }

  private resetMatch(): void {
    this.damage.reset()
    this.effects.resetTrauma()
    this.projectiles.clear()
    this.enemies.reset()
    this.weapons.reset()
    const ground = sampleGroundHeight(this.spawnPos.x, this.spawnPos.z)
    this.spawnPos.y = ground + 1.7
    this.player.resetTo(this.spawnPos, this.spawnYaw)
    this.footT = 0
    this.betweenWaveBanner = false
    this.crosshairTick = 0
    this.hudSyncT = 0
    if (this.statusEl) this.statusEl.textContent = DEFAULT_SUBTITLE
  }

  private audioIntensity(): number {
    const alive = this.enemies.enemies
    let aliveCount = 0
    let nearest = Infinity
    for (const e of alive) {
      if (!e.alive) continue
      aliveCount++
      nearest = Math.min(nearest, e.group.position.distanceTo(this.player.position))
    }
    if (aliveCount === 0) return 0
    const proximity = THREE.MathUtils.clamp(1 - nearest / 35, 0, 1)
    return THREE.MathUtils.clamp(aliveCount / 10 + proximity * 0.5, 0, 1)
  }

  private bindInput() {
    const el = this.renderer.renderer.domElement
    el.addEventListener('mousedown', (e) => {
      if (!this.running || !this.damage.alive) return
      if (!this.player.locked) {
        this.player.lock()
        return
      }
      if (e.button === 0) this.weapons.setFiring(true)
      if (e.button === 2) this.weapons.setAds(true)
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.weapons.setFiring(false)
      if (e.button === 2) this.weapons.setAds(false)
    })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('click', () => {
      if (this.running && this.damage.alive && !this.player.locked && !this.menu.isVisible) {
        this.player.lock()
      }
    })
    window.addEventListener('keydown', (e) => {
      if (!this.running || this.menu.isVisible) return
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
    this.resetMatch()
    this.running = true
    this.menu.hide()
    this.hud.show()
    this.enterGameplayWorld()
    this.syncHud()
    this.audio.setMusicMode('explore')
    this.audio.setMusicIntensity(0.15)
    this.player.lock()
    this.renderer.camera.position.copy(this.player.position)
    this.renderer.camera.rotation.set(0, this.spawnYaw, 0)
    this.enemies.startWave(6)
  }

  private updateCrosshairTarget(): void {
    this.crosshairTick += 1
    if (this.crosshairTick % this.perf.crosshairRayInterval !== 0) return
    this.player.getLookDirection(this.lookDir)
    this.aimRay.set(this.player.position, this.lookDir)
    this.aimRay.far = 140
    const hits = this.aimRay.intersectObjects(this.enemies.getMeshes(), true)
    let overEnemy = false
    if (hits.length > 0) {
      let cur: THREE.Object3D | null = hits[0]!.object
      while (cur) {
        if (cur.userData?.enemyId) {
          overEnemy = true
          break
        }
        cur = cur.parent
      }
    }
    this.hud.setOverEnemy(overEnemy)
  }

  private syncHud(): void {
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

    const inGameplay = this.running && this.damage.alive && !this.menu.isVisible

    if (!inGameplay) {
      this.ceMenu.updateCamera(this.renderer.camera, dt)
    } else {
      this.lighting.update(dt)
      this.sky.update(this.renderer.camera)
    }

    if (inGameplay) {
      this.player.update(dt)
      this.player.getLookDirection(this.lookDir)
      this.audio.setListener(this.player.position, this.lookDir)

      const moving =
        this.player.keys.forward ||
        this.player.keys.back ||
        this.player.keys.left ||
        this.player.keys.right

      if (this.player.locked) {
        this.weapons.update(dt, moving, this.player.grounded)
        this.updateCrosshairTarget()
      }

      this.damage.update(dt)
      this.enemies.update(dt, this.player.position)
      this.projectiles.update(dt)
      this.hearWorldProjectiles()
      this.resolveProjectileHits()
      this.effects.update(dt)
      if (this.player.locked) {
        this.effects.applyShakeToCamera(this.renderer.camera, dt)
      }
      this.hud.update(dt)

      this.hudSyncT += dt
      if (this.hudSyncT >= this.perf.hudSyncInterval) {
        this.hudSyncT = 0
        this.syncHud()
      }

      const heat = this.audioIntensity()
      if (!this.betweenWaveBanner) {
        this.audio.setMusicIntensity(heat)
        if (heat > 0.35) this.audio.setMusicMode('combat')
        else if (heat < 0.15) this.audio.setMusicMode('explore')
      }

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
    this.fpsCounter.update(dt)
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
          this.projCenter.copy(e.group.position).setY(e.group.position.y + 1)
          if (p.mesh.position.distanceToSquared(this.projCenter) < 1.21) {
            this.projHitPoint.copy(p.mesh.position)
            const killed = this.enemies.damageEnemy(e.id, p.damage, this.projHitPoint, false)
            this.audio.hitmarker()
            this.hud.flashHitmarker(false)
            if (killed) {
              this.audio.enemyDeathAt(e.group.position)
              this.hud.pushKillFeed('HOSTILE', 'Plasma')
            }
            p.alive = false
            this.effects.spawnPlasmaImpact(this.projHitPoint, this.upVec)
            break
          }
        }
      } else if (p.mesh.position.distanceToSquared(playerPos) < 1.44) {
        this.projHitPoint.copy(p.mesh.position)
        this.damage.applyDamage(p.damage, this.projHitPoint)
        p.alive = false
        this.effects.spawnPlasmaImpact(this.projHitPoint, this.upVec)
      }
    }
  }
}
