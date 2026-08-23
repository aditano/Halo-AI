import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  detectPerformanceSettings,
  downgradeSettings,
  type PerformanceSettings,
} from './PerformanceProfile';

export interface RendererBundle {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  bloomPass: UnrealBloomPass | null;
  bloom: UnrealBloomPass | null;
  smaaPass: SMAAPass | null;
  vignettePass: ShaderPass | null;
  performance: PerformanceSettings;
  resize: (width?: number, height?: number) => void;
  render: (deltaSeconds?: number) => void;
  setBloom: (strength: number) => void;
  setPointerCapture: (enabled: boolean) => void;
  dispose: () => void;
}

export interface RendererSetupOptions {
  maxPixelRatio?: number;
  fov?: number;
  vignette?: boolean;
  bloomStrength?: number;
  near?: number;
  far?: number;
  performance?: PerformanceSettings;
}

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 0.42 },
    darkness: { value: 0.48 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vignette = smoothstep(0.8, offset * 0.25, length(uv));
      texel.rgb = mix(texel.rgb, texel.rgb * (1.0 - darkness), vignette * 0.58);
      texel.rgb = mix(texel.rgb, texel.rgb * vec3(0.92, 0.98, 1.02), 0.12);
      gl_FragColor = texel;
    }
  `,
};

/**
 * WebGL renderer with adaptive post-processing for Chrome + Safari.
 * Falls back to direct rendering on low tier (no bloom/SMAA).
 */
export function createRenderer(
  container: HTMLElement,
  options: RendererSetupOptions = {},
): RendererBundle {
  const perf = options.performance ?? detectPerformanceSettings();
  const maxPixelRatio = options.maxPixelRatio ?? perf.maxPixelRatio;
  const enableVignette = options.vignette !== false && perf.enableVignette;
  const bloomStrength = options.bloomStrength ?? 0.48;
  const usePost = perf.enableBloom || perf.enableSMAA || enableVignette;

  const width = Math.max(1, container.clientWidth || window.innerWidth);
  const height = Math.max(1, container.clientHeight || window.innerHeight);

  const scene = new THREE.Scene();
  scene.name = 'HaloArenaScene';

  const camera = new THREE.PerspectiveCamera(
    options.fov ?? 75,
    width / height,
    options.near ?? 0.1,
    options.far ?? 1200,
  );
  camera.position.set(0, 1.7, 8);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({
    antialias: !perf.enableSMAA,
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let smaaPass: SMAAPass | null = null;
  let vignettePass: ShaderPass | null = null;

  if (usePost) {
    composer = new EffectComposer(renderer);
    composer.setSize(width, height);
    composer.setPixelRatio(renderer.getPixelRatio());

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    if (perf.enableBloom) {
      const bw = Math.max(1, Math.floor(width * perf.bloomScale));
      const bh = Math.max(1, Math.floor(height * perf.bloomScale));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(bw, bh), bloomStrength, 0.75, 0.58);
      composer.addPass(bloomPass);
    }

    if (perf.enableSMAA) {
      smaaPass = new SMAAPass();
      composer.addPass(smaaPass);
    }

    vignettePass = new ShaderPass(VignetteShader);
    vignettePass.enabled = enableVignette;
    composer.addPass(vignettePass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);
  }

  let frameBudget = 0;
  let badFrames = 0;
  let currentPerf = perf;

  const resize = (w?: number, h?: number) => {
    const nextW = Math.max(1, w ?? (container.clientWidth || window.innerWidth));
    const nextH = Math.max(1, h ?? (container.clientHeight || window.innerHeight));
    camera.aspect = nextW / nextH;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, currentPerf.maxPixelRatio));
    renderer.setSize(nextW, nextH, false);
    if (composer) {
      composer.setSize(nextW, nextH);
      composer.setPixelRatio(renderer.getPixelRatio());
    }
    if (bloomPass) {
      const bw = Math.max(1, Math.floor(nextW * currentPerf.bloomScale));
      const bh = Math.max(1, Math.floor(nextH * currentPerf.bloomScale));
      bloomPass.resolution.set(bw, bh);
      bloomPass.setSize(bw, bh);
    }
    if (smaaPass) {
      const pixelRatio = renderer.getPixelRatio();
      smaaPass.setSize(nextW * pixelRatio, nextH * pixelRatio);
    }
  };

  const onWindowResize = () => resize();
  window.addEventListener('resize', onWindowResize);

  const render = (deltaSeconds = 0) => {
    if (deltaSeconds > 0) {
      frameBudget += deltaSeconds;
      if (frameBudget >= 1.5) {
        const fps = (1 / deltaSeconds);
        if (fps < 42) badFrames += 1;
        else badFrames = Math.max(0, badFrames - 1);
        frameBudget = 0;
        if (badFrames >= 3 && currentPerf.tier !== 'low') {
          currentPerf = downgradeSettings(currentPerf);
          badFrames = 0;
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, currentPerf.maxPixelRatio));
          if (!currentPerf.enableBloom && bloomPass && composer) {
            composer.removePass(bloomPass);
            bloomPass.dispose();
            bloomPass = null;
          }
          if (!currentPerf.enableSMAA && smaaPass && composer) {
            composer.removePass(smaaPass);
            smaaPass.dispose();
            smaaPass = null;
          }
          if (!currentPerf.enableVignette && vignettePass) vignettePass.enabled = false;
          resize();
        }
      }
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  };

  const setPointerCapture = (enabled: boolean) => {
    renderer.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
  };

  const dispose = () => {
    window.removeEventListener('resize', onWindowResize);
    composer?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    composer,
    camera,
    scene,
    bloomPass,
    bloom: bloomPass,
    smaaPass,
    vignettePass,
    performance: currentPerf,
    resize,
    render,
    setBloom: (strength: number) => {
      if (bloomPass) bloomPass.strength = strength;
    },
    setPointerCapture,
    dispose,
  };
}
