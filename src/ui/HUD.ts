/**
 * Halo-inspired combat HUD — premium DOM/CSS overlay.
 * Orange/cyan accents, segmented shields, blooming reticle, directional damage arcs.
 */

export interface HUDWeaponInfo {
  name: string
  ammo: number
  reserve: number
  isEnergy?: boolean
  heat?: number
}

export interface HUDVitals {
  health: number
  maxHealth: number
  shields: number
  maxShields: number
}

export interface HUDOptions {
  parent?: HTMLElement
  title?: string
}

export type CrosshairMode = 'hip' | 'ads' | 'enemy' | 'ads-enemy'

const STYLE_ID = 'ringfall-hud-styles'
const FONT_ID = 'ringfall-hud-fonts'

const HUD_CSS = `
.rf-hud {
  --rf-orange: #ff9a3c;
  --rf-orange-hot: #ffb86b;
  --rf-cyan: #5eead4;
  --rf-cyan-dim: rgba(94, 234, 212, 0.35);
  --rf-shield: #7ef0e4;
  --rf-health: #e8f0e4;
  --rf-danger: #ff4d4d;
  --rf-panel: rgba(6, 14, 18, 0.55);
  --rf-line: rgba(94, 234, 212, 0.45);
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  font-family: "Orbitron", "Rajdhani", system-ui, sans-serif;
  color: var(--rf-cyan);
  opacity: 0;
  transition: opacity 0.45s ease;
  user-select: none;
}
.rf-hud::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(94, 234, 212, 0.035) 3px
  );
  animation: rf-scanline 8s linear infinite;
  opacity: 0.7;
  mix-blend-mode: soft-light;
}
@keyframes rf-scanline {
  0% { transform: translateY(0); }
  100% { transform: translateY(6px); }
}
.rf-hud.rf-visible { opacity: 1; }

.rf-hud * { box-sizing: border-box; }

/* —— Crosshair / reticle —— */
.rf-reticle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 36px;
  height: 36px;
  transform: translate(-50%, -50%);
  transition: width 0.12s ease, height 0.12s ease, filter 0.12s ease;
  filter: drop-shadow(0 0 10px rgba(255, 154, 60, 0.55));
}
.rf-reticle::before,
.rf-reticle::after {
  content: "";
  position: absolute;
  background: var(--rf-orange);
  box-shadow: 0 0 6px rgba(255, 154, 60, 0.7);
  transition: inherit;
}
.rf-reticle::before {
  left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px;
  clip-path: polygon(0 0, 100% 0, 100% 28%, 0 28%, 0 72%, 100% 72%, 100% 100%, 0 100%);
}
.rf-reticle::after {
  top: 50%; left: 0; right: 0; height: 2px; margin-top: -1px;
  clip-path: polygon(0 0, 28% 0, 28% 100%, 0 100%, 72% 0, 100% 0, 100% 100%, 72% 100%);
}
.rf-reticle-dot {
  position: absolute;
  left: 50%; top: 50%;
  width: 5px; height: 5px;
  margin: -2.5px 0 0 -2.5px;
  background: var(--rf-orange-hot);
  border-radius: 50%;
  box-shadow: 0 0 12px var(--rf-orange);
}
.rf-reticle.rf-bloom {
  filter: drop-shadow(0 0 4px rgba(255, 154, 60, 0.9));
}
.rf-reticle.rf-ads {
  width: 22px; height: 22px;
}
.rf-reticle.rf-enemy::before,
.rf-reticle.rf-enemy::after,
.rf-reticle.rf-enemy .rf-reticle-dot {
  background: var(--rf-danger);
  box-shadow: 0 0 8px rgba(255, 77, 77, 0.85);
}
.rf-hitmarker {
  position: absolute;
  left: 50%; top: 50%;
  width: 28px; height: 28px;
  margin: -14px 0 0 -14px;
  opacity: 0;
  pointer-events: none;
}
.rf-hitmarker span {
  position: absolute;
  width: 8px; height: 2px;
  background: #fff6e8;
  box-shadow: 0 0 6px #fff;
}
.rf-hitmarker span:nth-child(1) { left: 0; top: 0; transform: rotate(45deg); transform-origin: left center; }
.rf-hitmarker span:nth-child(2) { right: 0; top: 0; transform: rotate(-45deg); transform-origin: right center; }
.rf-hitmarker span:nth-child(3) { left: 0; bottom: 0; transform: rotate(-45deg); transform-origin: left center; }
.rf-hitmarker span:nth-child(4) { right: 0; bottom: 0; transform: rotate(45deg); transform-origin: right center; }
.rf-hitmarker.rf-flash {
  animation: rf-hitflash 0.18s ease-out;
}
.rf-hitmarker.rf-headshot span { background: #ff4d4d; box-shadow: 0 0 10px #ff4d4d; }
@keyframes rf-hitflash {
  0% { opacity: 1; transform: scale(0.7); }
  100% { opacity: 0; transform: scale(1.35); }
}

/* —— Vitals (bottom-left) —— */
.rf-vitals {
  position: absolute;
  left: 28px;
  bottom: 28px;
  width: min(320px, 42vw);
  padding: 14px 16px 12px;
  background:
    linear-gradient(135deg, rgba(8, 22, 28, 0.72), rgba(4, 10, 14, 0.4)),
    linear-gradient(90deg, rgba(94, 234, 212, 0.08), transparent 60%);
  border: 1px solid var(--rf-line);
  border-left: 3px solid var(--rf-cyan);
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  backdrop-filter: blur(8px);
}
.rf-vitals-label {
  font-size: 9px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--rf-cyan);
  opacity: 0.75;
  margin-bottom: 6px;
}
.rf-shield-segments {
  display: flex;
  gap: 3px;
  height: 14px;
  margin-bottom: 8px;
}
.rf-shield-seg {
  flex: 1;
  background: rgba(94, 234, 212, 0.12);
  border: 1px solid rgba(94, 234, 212, 0.25);
  position: relative;
  overflow: hidden;
  transform: skewX(-12deg);
}
.rf-shield-seg > i {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(180deg, #bffff6, var(--rf-shield) 40%, #2a9e94);
  box-shadow: 0 0 10px rgba(126, 240, 228, 0.65);
  transition: width 0.12s linear;
}
.rf-shield-seg.rf-empty { opacity: 0.35; }
.rf-health-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rf-health-bar {
  flex: 1;
  height: 8px;
  background: rgba(232, 240, 228, 0.1);
  border: 1px solid rgba(232, 240, 228, 0.28);
  overflow: hidden;
}
.rf-health-fill {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #9fb89a, var(--rf-health));
  box-shadow: 0 0 8px rgba(232, 240, 228, 0.4);
  transition: width 0.15s ease-out;
}
.rf-health-val {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  color: var(--rf-health);
  min-width: 36px;
  text-align: right;
}
.rf-vitals.rf-critical .rf-health-fill {
  background: linear-gradient(90deg, #8a2020, var(--rf-danger));
  animation: rf-pulse 0.7s ease-in-out infinite;
}
@keyframes rf-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* —— Weapon (bottom-center) —— */
.rf-weapon {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  min-width: 220px;
  padding: 10px 22px 12px;
  text-align: center;
  background: linear-gradient(180deg, rgba(10, 18, 22, 0.15), rgba(8, 16, 20, 0.72));
  border-top: 1px solid rgba(255, 154, 60, 0.45);
  clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%);
}
.rf-weapon-name {
  font-size: 10px;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: var(--rf-orange);
  margin-bottom: 2px;
  text-shadow: 0 0 12px rgba(255, 154, 60, 0.45);
}
.rf-weapon-ammo {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.rf-ammo-mag {
  font-size: 28px;
  font-weight: 600;
  color: #fff3e0;
  letter-spacing: 0.04em;
  text-shadow: 0 0 18px rgba(255, 154, 60, 0.55);
}
.rf-ammo-sep {
  font-size: 16px;
  color: rgba(255, 154, 60, 0.5);
}
.rf-ammo-res {
  font-size: 15px;
  color: var(--rf-orange-hot);
  opacity: 0.85;
}
.rf-heat {
  margin-top: 6px;
  height: 3px;
  background: rgba(255, 154, 60, 0.15);
  overflow: hidden;
}
.rf-heat > i {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--rf-orange), #ff5533);
  box-shadow: 0 0 8px var(--rf-orange);
  transition: width 0.08s linear;
}
.rf-weapon.rf-empty .rf-ammo-mag { color: var(--rf-danger); }

/* —— Damage direction arcs —— */
.rf-dmg-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.rf-dmg-arc {
  position: absolute;
  left: 50%; top: 50%;
  width: 220px; height: 220px;
  margin: -110px 0 0 -110px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: rgba(255, 60, 60, 0.85);
  opacity: 0;
  filter: drop-shadow(0 0 8px rgba(255, 40, 40, 0.7));
  pointer-events: none;
}
.rf-dmg-arc.rf-show {
  animation: rf-dmg 0.55s ease-out forwards;
}
@keyframes rf-dmg {
  0% { opacity: 0.95; transform: rotate(var(--rf-rot, 0deg)) scale(0.85); }
  100% { opacity: 0; transform: rotate(var(--rf-rot, 0deg)) scale(1.25); }
}

/* —— Kill feed —— */
.rf-killfeed {
  position: absolute;
  top: 72px;
  right: 28px;
  width: 280px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.rf-kill-item {
  padding: 6px 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #f0faf8;
  background: linear-gradient(90deg, transparent, rgba(8, 20, 24, 0.75));
  border-right: 2px solid var(--rf-orange);
  animation: rf-kill-in 0.25s ease-out;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rf-kill-item strong { color: var(--rf-orange); font-weight: 600; }
.rf-kill-item.rf-out {
  animation: rf-kill-out 0.35s ease-in forwards;
}
@keyframes rf-kill-in {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes rf-kill-out {
  to { opacity: 0; transform: translateX(20px); }
}

/* —— Wave / objective cue —— */
.rf-banner {
  position: absolute;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 14px;
  letter-spacing: 0.45em;
  text-transform: uppercase;
  color: var(--rf-orange-hot);
  text-shadow: 0 0 24px rgba(255, 154, 60, 0.55);
  opacity: 0;
  pointer-events: none;
}
.rf-banner.rf-show {
  animation: rf-banner 2.4s ease-out forwards;
}
@keyframes rf-banner {
  0% { opacity: 0; letter-spacing: 0.8em; }
  15% { opacity: 1; letter-spacing: 0.45em; }
  75% { opacity: 1; }
  100% { opacity: 0; }
}

/* —— Edge vignette when damaged —— */
.rf-pain {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 45%, rgba(120, 0, 0, 0.45) 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
`

function ensureFonts(): void {
  if (document.getElementById(FONT_ID)) return
  const link = document.createElement('link')
  link.id = FONT_ID
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap'
  document.head.appendChild(link)
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = HUD_CSS
  document.head.appendChild(style)
}

export class HUD {
  readonly root: HTMLElement

  private readonly reticle: HTMLElement
  private readonly hitmarker: HTMLElement
  private readonly vitals: HTMLElement
  private readonly shieldSegs: HTMLElement[] = []
  private readonly healthFill: HTMLElement
  private readonly healthVal: HTMLElement
  private readonly weaponEl: HTMLElement
  private readonly weaponName: HTMLElement
  private readonly ammoMag: HTMLElement
  private readonly ammoRes: HTMLElement
  private readonly heatFill: HTMLElement
  private readonly dmgLayer: HTMLElement
  private readonly killfeed: HTMLElement
  private readonly banner: HTMLElement
  private readonly pain: HTMLElement

  private ads = false
  private overEnemy = false
  private heat = 0
  private readonly segmentCount = 5
  private killFeedLimit = 5

  constructor(opts: HUDOptions = {}) {
    ensureFonts()
    ensureStyles()

    const parent = opts.parent ?? document.body
    this.root = document.createElement('div')
    this.root.className = 'rf-hud'
    this.root.setAttribute('aria-hidden', 'true')

    this.root.innerHTML = `
      <div class="rf-pain"></div>
      <div class="rf-dmg-layer"></div>
      <div class="rf-reticle"><div class="rf-reticle-dot"></div></div>
      <div class="rf-hitmarker"><span></span><span></span><span></span><span></span></div>
      <div class="rf-killfeed"></div>
      <div class="rf-banner"></div>
      <div class="rf-vitals">
        <div class="rf-vitals-label">Energy Shields</div>
        <div class="rf-shield-segments"></div>
        <div class="rf-health-row">
          <div class="rf-health-bar"><div class="rf-health-fill"></div></div>
          <div class="rf-health-val">100</div>
        </div>
      </div>
      <div class="rf-weapon">
        <div class="rf-weapon-name">Assault Rifle</div>
        <div class="rf-weapon-ammo">
          <span class="rf-ammo-mag">32</span>
          <span class="rf-ammo-sep">/</span>
          <span class="rf-ammo-res">320</span>
        </div>
        <div class="rf-heat"><i></i></div>
      </div>
    `

    parent.appendChild(this.root)

    this.reticle = this.root.querySelector('.rf-reticle')!
    this.hitmarker = this.root.querySelector('.rf-hitmarker')!
    this.vitals = this.root.querySelector('.rf-vitals')!
    this.healthFill = this.root.querySelector('.rf-health-fill')!
    this.healthVal = this.root.querySelector('.rf-health-val')!
    this.weaponEl = this.root.querySelector('.rf-weapon')!
    this.weaponName = this.root.querySelector('.rf-weapon-name')!
    this.ammoMag = this.root.querySelector('.rf-ammo-mag')!
    this.ammoRes = this.root.querySelector('.rf-ammo-res')!
    this.heatFill = this.root.querySelector('.rf-heat > i')!
    this.dmgLayer = this.root.querySelector('.rf-dmg-layer')!
    this.killfeed = this.root.querySelector('.rf-killfeed')!
    this.banner = this.root.querySelector('.rf-banner')!
    this.pain = this.root.querySelector('.rf-pain')!

    const segHost = this.root.querySelector('.rf-shield-segments')!
    for (let i = 0; i < this.segmentCount; i++) {
      const seg = document.createElement('div')
      seg.className = 'rf-shield-seg'
      const fill = document.createElement('i')
      seg.appendChild(fill)
      segHost.appendChild(seg)
      this.shieldSegs.push(seg)
    }
  }

  show(): void {
    this.root.classList.add('rf-visible')
  }

  hide(): void {
    this.root.classList.remove('rf-visible')
  }

  setVitals(v: HUDVitals): void {
    const hRatio = v.maxHealth > 0 ? Math.max(0, Math.min(1, v.health / v.maxHealth)) : 0
    this.healthFill.style.width = `${hRatio * 100}%`
    this.healthVal.textContent = String(Math.ceil(Math.max(0, v.health)))
    this.vitals.classList.toggle('rf-critical', hRatio > 0 && hRatio <= 0.3)

    const sRatio = v.maxShields > 0 ? Math.max(0, Math.min(1, v.shields / v.maxShields)) : 0
    const perSeg = 1 / this.segmentCount
    for (let i = 0; i < this.segmentCount; i++) {
      const seg = this.shieldSegs[i]!
      const fill = seg.firstElementChild as HTMLElement
      const local = Math.max(0, Math.min(1, (sRatio - i * perSeg) / perSeg))
      fill.style.width = `${local * 100}%`
      seg.classList.toggle('rf-empty', local <= 0.001)
    }
  }

  setWeapon(info: HUDWeaponInfo): void {
    this.weaponName.textContent = info.name
    this.ammoMag.textContent = String(info.ammo)
    this.ammoRes.textContent = String(info.reserve)
    this.weaponEl.classList.toggle('rf-empty', info.ammo <= 0)
    if (info.heat !== undefined) this.setHeat(info.heat)
  }

  setHeat(heat01: number): void {
    this.heat = Math.max(0, Math.min(1, heat01))
    this.heatFill.style.width = `${this.heat * 100}%`
    this.reticle.classList.toggle('rf-bloom', this.heat > 0.35 || this.ads)
  }

  setADS(ads: boolean): void {
    this.ads = ads
    this.syncCrosshair()
  }

  setOverEnemy(over: boolean): void {
    this.overEnemy = over
    this.syncCrosshair()
  }

  getCrosshairMode(): CrosshairMode {
    if (this.ads && this.overEnemy) return 'ads-enemy'
    if (this.ads) return 'ads'
    if (this.overEnemy) return 'enemy'
    return 'hip'
  }

  /** Flash hitmarker on damage dealt. */
  flashHitmarker(headshot = false): void {
    this.hitmarker.classList.remove('rf-flash', 'rf-headshot')
    // Force reflow to restart animation
    void this.hitmarker.offsetWidth
    if (headshot) this.hitmarker.classList.add('rf-headshot')
    this.hitmarker.classList.add('rf-flash')
  }

  /**
   * Show directional damage arc.
   * @param angleRad World-space yaw of damage source relative to camera forward (0 = front).
   *                 Pass atan2(rightDot, forwardDot) style angle; CSS rotates clockwise from top.
   */
  showDamageDirection(angleRad: number): void {
    const arc = document.createElement('div')
    arc.className = 'rf-dmg-arc'
    const deg = (angleRad * 180) / Math.PI
    arc.style.setProperty('--rf-rot', `${deg}deg`)
    this.dmgLayer.appendChild(arc)
    void arc.offsetWidth
    arc.classList.add('rf-show')
    window.setTimeout(() => arc.remove(), 600)

    this.pain.style.opacity = '0.85'
    window.setTimeout(() => {
      this.pain.style.opacity = '0'
    }, 280)
  }

  pushKillFeed(victimName: string, weaponName?: string): void {
    const item = document.createElement('div')
    item.className = 'rf-kill-item'
    const weapon = weaponName ? ` · ${weaponName}` : ''
    item.innerHTML = `<strong>YOU</strong> eliminated ${escapeHtml(victimName)}${escapeHtml(weapon)}`
    this.killfeed.prepend(item)

    while (this.killfeed.children.length > this.killFeedLimit) {
      this.killfeed.lastElementChild?.remove()
    }

    window.setTimeout(() => {
      item.classList.add('rf-out')
      window.setTimeout(() => item.remove(), 360)
    }, 3200)
  }

  showBanner(text: string): void {
    this.banner.textContent = text
    this.banner.classList.remove('rf-show')
    void this.banner.offsetWidth
    this.banner.classList.add('rf-show')
  }

  /** Soft per-frame updates (reserved for animated HUD elements). */
  update(_dt: number): void {
    // Reticle bloom / vitals are driven by setters from Game.syncHud
  }

  dispose(): void {
    this.root.remove()
  }

  private syncCrosshair(): void {
    this.reticle.classList.toggle('rf-ads', this.ads)
    this.reticle.classList.toggle('rf-enemy', this.overEnemy)
    this.reticle.classList.toggle('rf-bloom', this.ads || this.heat > 0.35)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
