import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface RendererBundle {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  bloomPass: UnrealBloomPass;
  /** Alias for bloomPass (compat with gameplay bootstrap). */
  bloom: UnrealBloomPass;
  smaaPass: SMAAPass;
  vignettePass: ShaderPass;
  resize: (width?: number, height?: number) => void;
  render: (deltaSeconds?: number) => void;
  setBloom: (strength: number) => void;
  dispose: () => void;
}

export interface RendererSetupOptions {
  /** Max device pixel ratio. Default 2. */
  maxPixelRatio?: number;
  /** Camera FOV. Default 75 (FPS-friendly). */
  fov?: number;
  /** Enable subtle vignette. Default true. */
  vignette?: boolean;
  /** Bloom strength. Default 0.18 (subtle Hardlight glow). */
  bloomStrength?: number;
  /** Near / far clip. */
  near?: number;
  far?: number;
}

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 0.35 },
    darkness: { value: 0.55 },
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
      texel.rgb = mix(texel.rgb, texel.rgb * (1.0 - darkness), vignette * 0.65);
      gl_FragColor = texel;
    }
  `,
};

/**
 * AAA-style WebGL renderer + EffectComposer stack:
 * RenderPass → UnrealBloom (subtle) → SMAA → optional vignette → OutputPass.
 */
export function createRenderer(
  container: HTMLElement,
  options: RendererSetupOptions = {},
): RendererBundle {
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  const enableVignette = options.vignette !== false;
  const bloomStrength = options.bloomStrength ?? 0.42;

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
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    bloomStrength,
    0.7,
    0.62,
  );
  composer.addPass(bloomPass);

  const smaaPass = new SMAAPass();
  composer.addPass(smaaPass);

  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.enabled = enableVignette;
  composer.addPass(vignettePass);

  // OutputPass applies tone mapping / color space when rendering via composer.
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const resize = (w?: number, h?: number) => {
    const nextW = Math.max(1, w ?? (container.clientWidth || window.innerWidth));
    const nextH = Math.max(1, h ?? (container.clientHeight || window.innerHeight));
    camera.aspect = nextW / nextH;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(nextW, nextH, false);
    composer.setSize(nextW, nextH);
    composer.setPixelRatio(renderer.getPixelRatio());
    bloomPass.resolution.set(nextW, nextH);
    bloomPass.setSize(nextW, nextH);
    const pixelRatio = renderer.getPixelRatio();
    smaaPass.setSize(nextW * pixelRatio, nextH * pixelRatio);
  };

  const onWindowResize = () => resize();
  window.addEventListener('resize', onWindowResize);

  const render = (_deltaSeconds?: number) => {
    composer.render();
  };

  const dispose = () => {
    window.removeEventListener('resize', onWindowResize);
    composer.dispose();
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
    resize,
    render,
    setBloom: (strength: number) => {
      bloomPass.strength = strength;
    },
    dispose,
  };
}
