// ============================================================================
// lab.ts — 🧪 the tycoon art lab (dev only, never shipped): one page that shows a module's procedural art
// under the game's lighting, so each piece can be checked from the game's 2.5D camera AND up close in 3D.
//
//   /Anthill-Airways/lab/?show=bugs        (bugs/lab.ts)
//   /Anthill-Airways/lab/?show=flora       (flora/lab.ts)
//   /Anthill-Airways/lab/?show=airport     (airport/lab.ts)
//   &cam=game   the in-game camera: high, looking down at ~48° (DEFAULT)
//   &cam=low    ant's-eye: just above the ground, looking across (the 3D / first-person check)
//   &cam=top    straight down
//   &cam=x,y,z,tx,ty,tz   any position + target
//   &t=3        run the animation for 3 s before the shot (window.labReady = true when it's settled)
//
// Each module's lab.ts exports `labScene(scene, ctx)` that fills the scene and returns an update(dt) (or nothing).
// Drag to orbit (OrbitControls) when looking by hand.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PAL } from '../kit';

export interface LabCtx {
  camera: THREE.PerspectiveCamera;
  /** Where the camera looks (move it to frame your scene before the shot). */
  target: THREE.Vector3;
  /** The query string, so a module can show variants (e.g. &kind=ladybug). */
  params: URLSearchParams;
}
type Show = (scene: THREE.Scene, ctx: LabCtx) => ((dt: number) => void) | void;

const MODULES: Record<string, () => Promise<{ labScene: Show }>> = {
  bugs: () => import('../bugs/lab'),
  flora: () => import('../flora/lab'),
  airport: () => import('../airport/lab'),
};

(async () => {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // The game's lighting (same as the worlds): sky, hemisphere light, one sun with soft shadows
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.Fog(PAL.sky, 160, 420);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d6e4a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 60, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 1200);
  const target = new THREE.Vector3();
  const ctx: LabCtx = { camera, target, params };
  const show = params.get('show') ?? 'bugs';
  const mod = await MODULES[show]?.();
  if (!mod) throw new Error(`no lab module "${show}"`);
  const update = mod.labScene(scene, ctx) || (() => {});

  const cam = params.get('cam') ?? 'game';
  const dist = Number(params.get('dist') ?? 30);
  if (cam === 'game') camera.position.copy(target).add(new THREE.Vector3(0, dist * 0.75, dist * 0.66));
  else if (cam === 'low') camera.position.copy(target).add(new THREE.Vector3(0, dist * 0.06, dist));
  else if (cam === 'top') camera.position.copy(target).add(new THREE.Vector3(0, dist, 0.01));
  else {
    const v = cam.split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]);
    target.set(v[3], v[4], v[5]);
  }
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.update();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  const clock = new THREE.Clock();
  const settle = Number(params.get('t') ?? 1);
  let t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    update(dt);
    controls.update();
    renderer.render(scene, camera);
    if (t > settle) (window as unknown as { labReady: boolean }).labReady = true;
  });
})();
