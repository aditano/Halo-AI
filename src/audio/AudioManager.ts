/**
 * Procedural Web Audio SFX — no external files.
 * Layered oscillators + filtered noise with envelopes.
 */

export interface AudioManagerOptions {
  masterVolume?: number
  sfxVolume?: number
}

type NoiseKind = 'white' | 'brown'

export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private masterVolume: number
  private sfxVolume: number
  private unlocked = false
  private footFlip = false
  private charge: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null
  private readonly unlockHandler: () => void

  constructor(options: AudioManagerOptions = {}) {
    this.masterVolume = options.masterVolume ?? 0.85
    this.sfxVolume = options.sfxVolume ?? 0.9
    this.unlockHandler = () => {
      void this.resume()
    }
    document.addEventListener('pointerdown', this.unlockHandler, { once: true })
    document.addEventListener('keydown', this.unlockHandler, { once: true })
  }

  async resume(): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.unlocked = ctx.state === 'running'
  }

  isUnlocked(): boolean {
    return this.unlocked
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp(v, 0, 1)
    if (this.master) this.master.gain.value = this.masterVolume
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = clamp(v, 0, 1)
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume
  }

  // —— Named game hooks (Game / WeaponSystem / EnemyManager) ——

  ui(): void {
    this.blip(720, 0.06, 0.22)
    this.blip(980, 0.07, 0.18, 0.05)
  }

  hitmarker(): void {
    this.blip(1400, 0.03, 0.18)
    this.blip(2100, 0.025, 0.12, 0.02)
  }

  shieldHit(): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(640, t0)
    osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.4, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 700
    bp.Q.value = 4
    osc.connect(bp)
    bp.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc.stop(t0 + 0.22)

    const shimmer = ctx.createOscillator()
    shimmer.type = 'triangle'
    shimmer.frequency.value = 1200
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0.12, t0)
    sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12)
    shimmer.connect(sg)
    sg.connect(this.bus())
    shimmer.start(t0)
    shimmer.stop(t0 + 0.14)
  }

  shieldBreak(): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const noise = this.noise(0.35, 'white')
    const nf = ctx.createBiquadFilter()
    nf.type = 'lowpass'
    nf.frequency.setValueAtTime(3000, t0)
    nf.frequency.exponentialRampToValueAtTime(200, t0 + 0.3)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.55, t0)
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
    noise.connect(nf)
    nf.connect(ng)
    ng.connect(this.bus())
    noise.start(t0)
    noise.stop(t0 + 0.35)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, t0)
    osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.4)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.32, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4)
    osc.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc.stop(t0 + 0.42)
  }

  shieldRecharge(): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, t0)
    osc.frequency.linearRampToValueAtTime(900, t0 + 0.45)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t0)
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.05)
    g.gain.linearRampToValueAtTime(0.001, t0 + 0.5)
    osc.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc.stop(t0 + 0.52)
  }

  footstep(sprint = false): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    this.footFlip = !this.footFlip
    const noise = this.noise(0.08, 'brown')
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = (this.footFlip ? 180 : 230) * (sprint ? 1.15 : 1)
    f.Q.value = 1.2
    const g = ctx.createGain()
    g.gain.setValueAtTime(sprint ? 0.34 : 0.26, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07)
    noise.connect(f)
    f.connect(g)
    g.connect(this.bus())
    noise.start(t0)
    noise.stop(t0 + 0.09)
  }

  jump(): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, t0)
    osc.frequency.exponentialRampToValueAtTime(280, t0 + 0.1)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.22, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12)
    osc.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc.stop(t0 + 0.14)
  }

  land(): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const noise = this.noise(0.15, 'brown')
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 280
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.42, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14)
    noise.connect(f)
    f.connect(g)
    g.connect(this.bus())
    noise.start(t0)
    noise.stop(t0 + 0.16)
  }

  enemyDeath(): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, t0)
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.35)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.28, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 900
    osc.connect(f)
    f.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc.stop(t0 + 0.38)

    const noise = this.noise(0.25, 'white')
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.2, t0)
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25)
    const nf = ctx.createBiquadFilter()
    nf.type = 'bandpass'
    nf.frequency.value = 400
    noise.connect(nf)
    nf.connect(ng)
    ng.connect(this.bus())
    noise.start(t0)
    noise.stop(t0 + 0.25)
  }

  reload(): void {
    this.click(0.28, undefined, 900)
    this.click(0.22, this.ensure().currentTime + 0.35, 220)
    this.click(0.32, this.ensure().currentTime + 0.7, 500)
  }

  empty(): void {
    this.click(0.3, undefined, 700)
  }

  weaponSwap(): void {
    this.click(0.28, undefined, 600)
    this.click(0.22, this.ensure().currentTime + 0.08, 1100)
  }

  /** BR 3-round burst crack — metallic + body thump. */
  brFire(): void {
    this.gunshot({
      noiseDur: 0.07,
      noiseFreq: 1800,
      bodyFreq: 95,
      gain: 0.52,
      metallic: true,
      toneFreq: 240,
    })
  }

  /** AR automatic chatter. */
  arFire(): void {
    this.gunshot({
      noiseDur: 0.05,
      noiseFreq: 2400,
      bodyFreq: 78,
      gain: 0.4,
      metallic: false,
      toneFreq: 160,
    })
  }

  plasmaFire(overcharge = false): void {
    if (overcharge) this.stopCharge()
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const dur = overcharge ? 0.35 : 0.18
    const f0 = overcharge ? 140 : 220

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(f0 * (overcharge ? 0.35 : 0.55), t0 + dur)

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(f0 * 2.1, t0)
    osc2.frequency.exponentialRampToValueAtTime(f0 * 0.8, t0 + dur)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(overcharge ? 2400 : 1800, t0)
    filter.frequency.exponentialRampToValueAtTime(400, t0 + dur)
    filter.Q.value = 6

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(overcharge ? 0.7 : 0.4, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)

    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc2.start(t0)
    osc.stop(t0 + dur + 0.02)
    osc2.stop(t0 + dur + 0.02)
  }

  startPlasmaCharge(): void {
    this.stopCharge()
    const ctx = this.ensure()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, t0)
    osc.frequency.linearRampToValueAtTime(620, t0 + 1.35)

    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 8
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 12
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t0)
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.2)
    g.gain.linearRampToValueAtTime(0.32, t0 + 1.3)

    osc.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    lfo.start(t0)
    this.charge = { osc, gain: g, lfo }
  }

  stopCharge(): void {
    if (!this.charge || !this.ctx) return
    const t0 = this.ctx.currentTime
    const { osc, gain, lfo } = this.charge
    try {
      gain.gain.cancelScheduledValues(t0)
      gain.gain.setValueAtTime(Math.max(0.001, gain.gain.value), t0)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05)
      osc.stop(t0 + 0.06)
      lfo.stop(t0 + 0.06)
    } catch {
      /* already stopped */
    }
    this.charge = null
  }

  playWeaponFire(id: 'br' | 'ar' | 'plasma', overcharge = false): void {
    if (id === 'br') this.brFire()
    else if (id === 'ar') this.arFire()
    else this.plasmaFire(overcharge)
  }

  dispose(): void {
    this.stopCharge()
    document.removeEventListener('pointerdown', this.unlockHandler)
    document.removeEventListener('keydown', this.unlockHandler)
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.sfxBus = null
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.masterVolume
    this.sfxBus = this.ctx.createGain()
    this.sfxBus.gain.value = this.sfxVolume
    this.sfxBus.connect(this.master)
    this.master.connect(this.ctx.destination)
    return this.ctx
  }

  private bus(): GainNode {
    this.ensure()
    return this.sfxBus!
  }

  private blip(freq: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(g)
    g.connect(this.bus())
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  private click(gain: number, at?: number, freq = 900): void {
    const ctx = this.ensure()
    const t0 = at ?? ctx.currentTime
    const noise = this.noise(0.04, 'white')
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = 5
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain * 0.35, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.035)
    noise.connect(f)
    f.connect(g)
    g.connect(this.bus())
    noise.start(t0)
    noise.stop(t0 + 0.05)
  }

  private gunshot(p: {
    noiseDur: number
    noiseFreq: number
    bodyFreq: number
    gain: number
    metallic: boolean
    toneFreq: number
  }): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime

    const noise = this.noise(p.noiseDur + 0.02, 'white')
    const nFilter = ctx.createBiquadFilter()
    nFilter.type = 'bandpass'
    nFilter.frequency.value = p.noiseFreq
    nFilter.Q.value = 0.8
    const nGain = ctx.createGain()
    nGain.gain.setValueAtTime(p.gain, t0)
    nGain.gain.exponentialRampToValueAtTime(0.001, t0 + p.noiseDur)
    noise.connect(nFilter)
    nFilter.connect(nGain)
    nGain.connect(this.bus())
    noise.start(t0)
    noise.stop(t0 + p.noiseDur + 0.02)

    const body = ctx.createOscillator()
    body.type = 'sine'
    body.frequency.setValueAtTime(p.bodyFreq, t0)
    body.frequency.exponentialRampToValueAtTime(40, t0 + 0.08)
    const bGain = ctx.createGain()
    bGain.gain.setValueAtTime(p.gain * 0.85, t0)
    bGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1)
    body.connect(bGain)
    bGain.connect(this.bus())
    body.start(t0)
    body.stop(t0 + 0.12)

    if (p.metallic) {
      const ring = ctx.createOscillator()
      ring.type = 'triangle'
      ring.frequency.value = p.toneFreq * 2.5
      const rGain = ctx.createGain()
      rGain.gain.setValueAtTime(p.gain * 0.22, t0)
      rGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 600
      ring.connect(hp)
      hp.connect(rGain)
      rGain.connect(this.bus())
      ring.start(t0)
      ring.stop(t0 + 0.1)
    }
  }

  private noise(duration: number, kind: NoiseKind): AudioBufferSourceNode {
    const ctx = this.ensure()
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      } else {
        data[i] = white
      }
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    return src
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
