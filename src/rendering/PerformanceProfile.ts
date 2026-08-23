export type QualityTier = 'high' | 'medium' | 'low'

export interface PerformanceSettings {
  tier: QualityTier
  maxPixelRatio: number
  shadowMapSize: number
  enableBloom: boolean
  bloomScale: number
  enableSMAA: boolean
  enableVignette: boolean
  lightShafts: boolean
  environmentMap: boolean
  crosshairRayInterval: number
  hudSyncInterval: number
}

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : ''

function isSafari(): boolean {
  return /Safari/i.test(UA) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(UA)
}

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(UA)
}

/** Pick conservative defaults for Safari / mobile GPUs. */
export function detectPerformanceSettings(): PerformanceSettings {
  const safari = isSafari()
  const mobile = isMobile()

  if (safari || mobile) {
    return {
      tier: 'medium',
      maxPixelRatio: mobile ? 1.1 : 1.25,
      shadowMapSize: 1024,
      enableBloom: true,
      bloomScale: 0.5,
      enableSMAA: false,
      enableVignette: true,
      lightShafts: false,
      environmentMap: true,
      crosshairRayInterval: 4,
      hudSyncInterval: 1 / 20,
    }
  }

  return {
    tier: 'high',
    maxPixelRatio: 1.5,
    shadowMapSize: 2048,
    enableBloom: true,
    bloomScale: 0.65,
    enableSMAA: true,
    enableVignette: true,
    lightShafts: true,
    environmentMap: true,
    crosshairRayInterval: 2,
    hudSyncInterval: 1 / 30,
  }
}

/** Step down quality when sustained frame times exceed budget. */
export function downgradeSettings(current: PerformanceSettings): PerformanceSettings {
  if (current.tier === 'high') {
    return { ...current, tier: 'medium', maxPixelRatio: 1.25, shadowMapSize: 1024, enableSMAA: false, bloomScale: 0.5, lightShafts: false, crosshairRayInterval: 4 }
  }
  if (current.tier === 'medium') {
    return {
      ...current,
      tier: 'low',
      maxPixelRatio: 1,
      shadowMapSize: 512,
      enableBloom: false,
      enableVignette: false,
      lightShafts: false,
      crosshairRayInterval: 6,
      hudSyncInterval: 1 / 15,
    }
  }
  return current
}
