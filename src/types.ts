import type * as THREE from 'three'

export type AABB = {
  min: THREE.Vector3
  max: THREE.Vector3
}

export type SpawnPoint = {
  position: THREE.Vector3
  yaw?: number
}

export type DamageEvent = {
  amount: number
  source: THREE.Vector3
  isShield: boolean
  isFatal: boolean
}

export type HitInfo = {
  point: THREE.Vector3
  normal: THREE.Vector3
  distance: number
  enemyId?: string
  isHeadshot?: boolean
}
