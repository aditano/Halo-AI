/**
 * Halo: Combat Evolved–inspired title screen.
 * Left-aligned classic menu over a live 3D ringworld backdrop.
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
  --m-gold: #c4a35a;
  --m-cyan: #7ec8a0;
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  font-family: "Rajdhani", "Orbitron", system-ui, sans-serif;
  color: #e8f0e8;
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
  background: linear-gradient(90deg, rgba(2,4,10,0.78) 0%, rgba(2,4,10,0.4) 38%, rgba(2,4,10,0.12) 65%, transparent 100%);
  pointer-events: none;
}
.rf-menu-panel {
  position: relative;
  z-index: 2;
  margin-left: clamp(2rem, 8vw, 6rem);
  max-width: 28rem;
  text-align: left;
  animation: rf-ce-in 1.1s ease both;
}
.rf-menu-eyebrow {
  font-family: "Orbitron", sans-serif;
  letter-spacing: 0.42em;
  font-size: 0.65rem;
  color: var(--m-cyan);
  margin-bottom: 0.85rem;
  text-transform: uppercase;
}
.rf-menu-title {
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  font-size: clamp(2.8rem, 8vw, 4.8rem);
  letter-spacing: 0.14em;
  line-height: 0.95;
  color: #f2f6f2;
  text-shadow: 0 0 28px rgba(126, 200, 160, 0.35), 0 2px 0 rgba(0,0,0,0.55);
  margin: 0 0 0.75rem;
}
.rf-menu-sub {
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: rgba(210, 230, 215, 0.72);
  margin: 0 0 1.75rem;
  max-width: 22rem;
}
.rf-menu-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
}
.rf-menu-btn {
  font-family: "Orbitron", sans-serif;
  font-weight: 600;
  font-size: 0.85rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  padding: 0.85rem 1.6rem;
  min-width: 14rem;
  border: 1px solid rgba(126, 200, 160, 0.45);
  background: linear-gradient(180deg, rgba(126, 200, 160, 0.16), rgba(8, 16, 12, 0.35));
  color: #f2f6f2;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s;
}
.rf-menu-btn:hover {
  transform: translateX(4px);
  border-color: rgba(196, 163, 90, 0.75);
  box-shadow: 0 0 28px rgba(126, 200, 160, 0.22);
  background: linear-gradient(180deg, rgba(196, 163, 90, 0.22), rgba(126, 200, 160, 0.1));
}
.rf-menu-btn.rf-ghost {
  border-color: rgba(180, 200, 190, 0.25);
  background: transparent;
}
.rf-menu-hint {
  margin-top: 1.5rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: rgba(170, 200, 185, 0.45);
}
@keyframes rf-ce-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
.rf-menu-settings {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(2, 4, 10, 0.55);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0.25s;
  z-index: 5;
}
.rf-menu-settings.rf-open {
  opacity: 1;
  visibility: visible;
}
.rf-settings-card {
  width: min(360px, 90vw);
  padding: 1.5rem;
  border: 1px solid rgba(126, 200, 160, 0.35);
  background: rgba(6, 12, 14, 0.92);
}
.rf-settings-card h2 {
  font-family: "Orbitron", sans-serif;
  letter-spacing: 0.2em;
  font-size: 0.9rem;
  margin: 0 0 1rem;
  color: var(--m-cyan);
}
.rf-settings-row {
  display: flex;
  justify-content: space-between;
  padding: 0.55rem 0;
  border-bottom: 1px solid rgba(126, 200, 160, 0.12);
  font-size: 0.9rem;
  color: rgba(220, 235, 225, 0.8);
}
.rf-settings-close { margin-top: 1.1rem; width: 100%; min-width: 0; }
`

function ensureFonts(): void {
  if (document.getElementById(FONT_ID) || document.getElementById('ringfall-hud-fonts')) return
  const link = document.createElement('link')
  link.id = FONT_ID
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap'
  document.head.appendChild(link)
}

function ensureStyles(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = MENU_CSS
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
    const subtitle = opts.subtitle ?? 'Infinite Protocols'
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
      <div class="rf-menu-panel">
        <div class="rf-menu-eyebrow">Rainfall // Campaign</div>
        <h1 class="rf-menu-title">${escapeHtml(title)}</h1>
        <p class="rf-menu-sub">${escapeHtml(subtitle)}</p>
        <div class="rf-menu-actions">
          <button type="button" class="rf-menu-btn rf-play">Campaign</button>
          <button type="button" class="rf-menu-btn rf-ghost rf-settings-open">Settings</button>
        </div>
        <p class="rf-menu-hint">WASD · Mouse · LMB fire · Esc releases lock</p>
      </div>
      <div class="rf-menu-settings" aria-hidden="true">
        <div class="rf-settings-card">
          <h2>Settings</h2>
          <div class="rf-settings-row"><span>Mouse Sensitivity</span><span>Stub</span></div>
          <div class="rf-settings-row"><span>Field of View</span><span>Stub</span></div>
          <div class="rf-settings-row"><span>Graphics Preset</span><span>High</span></div>
          <div class="rf-settings-row"><span>Audio Mix</span><span>Positional + Dynamic</span></div>
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
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch(() => undefined)
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
