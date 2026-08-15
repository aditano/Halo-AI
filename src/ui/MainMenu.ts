/**
 * Cinematic title screen for RINGFALL / Halo-AI Infinite Protocols.
 * Click-to-play requests pointer lock; settings are stubbed for now.
 */

export interface MainMenuOptions {
  parent?: HTMLElement
  title?: string
  subtitle?: string
  onPlay?: () => void
  onSettings?: () => void
  requestPointerLockTarget?: HTMLElement | null
}

const STYLE_ID = 'ringfall-menu-styles'
const FONT_ID = 'ringfall-menu-fonts'

const MENU_CSS = `
.rf-menu {
  --m-orange: #ff9a3c;
  --m-cyan: #5eead4;
  --m-ink: #061016;
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  font-family: "Orbitron", "Rajdhani", system-ui, sans-serif;
  color: #e8f6f4;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.7s ease, visibility 0.7s;
  visibility: visible;
}
.rf-menu.rf-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.rf-menu-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 90% 70% at 70% 20%, rgba(255, 154, 60, 0.22), transparent 55%),
    radial-gradient(ellipse 70% 60% at 15% 80%, rgba(94, 234, 212, 0.18), transparent 50%),
    linear-gradient(160deg, #02080c 0%, #0a1a22 45%, #061018 100%);
}
.rf-menu-bg::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(94, 234, 212, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(94, 234, 212, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
  animation: rf-grid-drift 28s linear infinite;
}
.rf-menu-bg::after {
  content: "";
  position: absolute;
  inset: -20%;
  background: conic-gradient(from 210deg at 60% 40%, transparent 0deg, rgba(255, 154, 60, 0.07) 60deg, transparent 120deg);
  animation: rf-sweep 14s ease-in-out infinite;
}
@keyframes rf-grid-drift {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-48px, -48px, 0); }
}
@keyframes rf-sweep {
  0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.7; }
  50% { transform: rotate(18deg) scale(1.05); opacity: 1; }
}

.rf-menu-ring {
  position: absolute;
  width: min(720px, 90vw);
  height: min(720px, 90vw);
  border-radius: 50%;
  border: 1px solid rgba(94, 234, 212, 0.18);
  box-shadow:
    inset 0 0 80px rgba(94, 234, 212, 0.06),
    0 0 60px rgba(255, 154, 60, 0.08);
  animation: rf-ring-spin 48s linear infinite;
  pointer-events: none;
}
.rf-menu-ring::before {
  content: "";
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  border: 1px dashed rgba(255, 154, 60, 0.28);
  animation: rf-ring-spin 36s linear infinite reverse;
}
@keyframes rf-ring-spin {
  to { transform: rotate(360deg); }
}

.rf-menu-panel {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 48px 40px 40px;
  max-width: 640px;
  width: min(92vw, 640px);
  animation: rf-panel-in 1s ease-out both;
}
@keyframes rf-panel-in {
  from { opacity: 0; transform: translateY(18px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.rf-menu-eyebrow {
  font-size: 11px;
  letter-spacing: 0.55em;
  text-transform: uppercase;
  color: var(--m-cyan);
  opacity: 0.8;
  margin-bottom: 18px;
  text-shadow: 0 0 18px rgba(94, 234, 212, 0.45);
}

.rf-menu-title {
  margin: 0;
  font-size: clamp(42px, 9vw, 78px);
  font-weight: 700;
  letter-spacing: 0.18em;
  line-height: 1.05;
  text-indent: 0.18em;
  background: linear-gradient(180deg, #fff8f0 10%, var(--m-orange) 55%, #c45a12 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 28px rgba(255, 154, 60, 0.35));
  animation: rf-title-glow 3.5s ease-in-out infinite;
}
@keyframes rf-title-glow {
  0%, 100% { filter: drop-shadow(0 0 22px rgba(255, 154, 60, 0.3)); }
  50% { filter: drop-shadow(0 0 36px rgba(255, 154, 60, 0.55)); }
}

.rf-menu-sub {
  margin: 16px 0 36px;
  font-size: clamp(12px, 2.2vw, 15px);
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: rgba(232, 246, 244, 0.72);
  text-indent: 0.42em;
}

.rf-menu-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.rf-menu-btn {
  pointer-events: auto;
  cursor: pointer;
  appearance: none;
  border: 1px solid rgba(255, 154, 60, 0.55);
  background: linear-gradient(180deg, rgba(255, 154, 60, 0.18), rgba(255, 154, 60, 0.05));
  color: #fff4e8;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.38em;
  text-indent: 0.38em;
  text-transform: uppercase;
  padding: 16px 48px;
  min-width: 260px;
  clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 0 24px rgba(255, 154, 60, 0.15);
}
.rf-menu-btn:hover,
.rf-menu-btn:focus-visible {
  outline: none;
  background: linear-gradient(180deg, rgba(255, 154, 60, 0.35), rgba(255, 154, 60, 0.12));
  border-color: var(--m-orange);
  transform: translateY(-2px);
  box-shadow: 0 0 36px rgba(255, 154, 60, 0.35);
}
.rf-menu-btn:active { transform: translateY(0); }

.rf-menu-btn.rf-ghost {
  border-color: rgba(94, 234, 212, 0.35);
  background: linear-gradient(180deg, rgba(94, 234, 212, 0.1), rgba(94, 234, 212, 0.02));
  color: var(--m-cyan);
  box-shadow: none;
  min-width: 220px;
  padding: 12px 36px;
  font-size: 11px;
}
.rf-menu-btn.rf-ghost:hover,
.rf-menu-btn.rf-ghost:focus-visible {
  border-color: var(--m-cyan);
  background: linear-gradient(180deg, rgba(94, 234, 212, 0.2), rgba(94, 234, 212, 0.06));
  box-shadow: 0 0 24px rgba(94, 234, 212, 0.2);
}

.rf-menu-hint {
  margin-top: 28px;
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(94, 234, 212, 0.55);
}

.rf-menu-settings {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  background: rgba(2, 8, 12, 0.72);
  backdrop-filter: blur(10px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s;
}
.rf-menu-settings.rf-open {
  opacity: 1;
  visibility: visible;
}
.rf-settings-card {
  width: min(420px, 90vw);
  padding: 28px 28px 22px;
  background: linear-gradient(160deg, rgba(10, 24, 30, 0.95), rgba(6, 14, 18, 0.92));
  border: 1px solid rgba(94, 234, 212, 0.3);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
}
.rf-settings-card h2 {
  margin: 0 0 18px;
  font-size: 14px;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--m-orange);
}
.rf-settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(94, 234, 212, 0.12);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(232, 246, 244, 0.8);
}
.rf-settings-row span:last-child {
  color: var(--m-cyan);
  opacity: 0.7;
  font-size: 11px;
}
.rf-settings-close {
  margin-top: 18px;
  width: 100%;
}

.rf-menu-scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.08) 3px
  );
  opacity: 0.35;
  mix-blend-mode: multiply;
}
`

function ensureFonts(): void {
  if (document.getElementById(FONT_ID)) return
  // Reuse HUD font link if present
  if (document.getElementById('ringfall-hud-fonts')) return
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
  style.textContent = MENU_CSS
  document.head.appendChild(style)
}

export class MainMenu {
  readonly root: HTMLElement

  private readonly settingsPanel: HTMLElement
  private readonly playBtn: HTMLButtonElement
  private readonly settingsBtn: HTMLButtonElement
  private onPlay: (() => void) | null
  private onSettings: (() => void) | null
  private pointerLockTarget: HTMLElement | null
  private dismissed = false

  constructor(opts: MainMenuOptions = {}) {
    ensureFonts()
    ensureStyles()

    const title = opts.title ?? 'RINGFALL'
    const subtitle = opts.subtitle ?? 'Halo-AI · Infinite Protocols'
    this.onPlay = opts.onPlay ?? null
    this.onSettings = opts.onSettings ?? null
    this.pointerLockTarget = opts.requestPointerLockTarget ?? document.body

    const parent = opts.parent ?? document.body
    this.root = document.createElement('div')
    this.root.className = 'rf-menu'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', 'Main menu')

    this.root.innerHTML = `
      <div class="rf-menu-bg"></div>
      <div class="rf-menu-ring" aria-hidden="true"></div>
      <div class="rf-menu-scan" aria-hidden="true"></div>
      <div class="rf-menu-panel">
        <div class="rf-menu-eyebrow">UNSC // Simulation Deck</div>
        <h1 class="rf-menu-title">${escapeHtml(title)}</h1>
        <p class="rf-menu-sub">${escapeHtml(subtitle)}</p>
        <div class="rf-menu-actions">
          <button type="button" class="rf-menu-btn rf-play">Click to Deploy</button>
          <button type="button" class="rf-menu-btn rf-ghost rf-settings-open">Settings</button>
        </div>
        <p class="rf-menu-hint">Pointer lock required · Esc releases</p>
      </div>
      <div class="rf-menu-settings" aria-hidden="true">
        <div class="rf-settings-card">
          <h2>Settings</h2>
          <div class="rf-settings-row"><span>Mouse Sensitivity</span><span>Stub</span></div>
          <div class="rf-settings-row"><span>Field of View</span><span>Stub</span></div>
          <div class="rf-settings-row"><span>Graphics Preset</span><span>High</span></div>
          <div class="rf-settings-row"><span>Audio Mix</span><span>Stub</span></div>
          <button type="button" class="rf-menu-btn rf-ghost rf-settings-close">Close</button>
        </div>
      </div>
    `

    parent.appendChild(this.root)

    this.playBtn = this.root.querySelector('.rf-play')!
    this.settingsBtn = this.root.querySelector('.rf-settings-open')!
    this.settingsPanel = this.root.querySelector('.rf-menu-settings')!

    this.playBtn.addEventListener('click', () => this.handlePlay())
    this.settingsBtn.addEventListener('click', () => this.openSettings())
    this.root.querySelector('.rf-settings-close')!.addEventListener('click', () => this.closeSettings())

    // Click backdrop of settings to close
    this.settingsPanel.addEventListener('click', (e) => {
      if (e.target === this.settingsPanel) this.closeSettings()
    })
  }

  setCallbacks(opts: { onPlay?: () => void; onSettings?: () => void }): void {
    if (opts.onPlay) this.onPlay = opts.onPlay
    if (opts.onSettings) this.onSettings = opts.onSettings
  }

  setPointerLockTarget(el: HTMLElement | null): void {
    this.pointerLockTarget = el
  }

  show(): void {
    this.dismissed = false
    this.root.classList.remove('rf-hidden')
  }

  hide(): void {
    this.dismissed = true
    this.root.classList.add('rf-hidden')
    this.closeSettings()
  }

  get isVisible(): boolean {
    return !this.dismissed
  }

  openSettings(): void {
    this.settingsPanel.classList.add('rf-open')
    this.settingsPanel.setAttribute('aria-hidden', 'false')
    this.onSettings?.()
  }

  closeSettings(): void {
    this.settingsPanel.classList.remove('rf-open')
    this.settingsPanel.setAttribute('aria-hidden', 'true')
  }

  dispose(): void {
    this.root.remove()
  }

  private handlePlay(): void {
    const target = this.pointerLockTarget
    if (target && typeof target.requestPointerLock === 'function') {
      const result = target.requestPointerLock()
      // Newer browsers return a Promise
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch(() => {
          /* user gesture / permissions — still proceed into game */
        })
      }
    }
    this.hide()
    this.onPlay?.()
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
