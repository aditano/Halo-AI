import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Outdoor-leaning PMREM environment for PBR reflections
 * (Hardlight / Forerunner metal sheen closer to Infinite).
 */
export function applyEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): { dispose: () => void } {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  // Base studio room, then tint toward bright teal sky for outdoor Infinite feel.
  const room = new RoomEnvironment()
  const envScene = new THREE.Scene()
  envScene.add(room)

  const hemi = new THREE.HemisphereLight(0x7ec8e0, 0x6b5a3e, 1.2)
  envScene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffe2c0, 2.2)
  sun.position.set(10, 20, 8)
  envScene.add(sun)

  // Soft sky dome color wash
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x5eb8c8, side: THREE.BackSide }),
  )
  envScene.add(sky)

  const envMap = pmrem.fromScene(envScene, 0.04).texture
  scene.environment = envMap
  scene.environmentIntensity = 0.85

  envScene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else if (mat) (mat as THREE.Material).dispose()
  })

  return {
    dispose: () => {
      envMap.dispose()
      pmrem.dispose()
      if (scene.environment === envMap) scene.environment = null
    },
  }
}
