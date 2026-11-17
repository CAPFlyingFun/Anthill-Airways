// ============================================================================
// seeThrough.ts — 👀 NOTHING HIDES YOUR ANT (v0.75).
//
// Anything tall that stands between the camera and the player (a nectar flower's head, a leaf, a mushroom, a sign,
// a wall) fades out in a dotted window around the player, so you can always see where you are and what's on the
// ground there. Only the part that's in the way goes: what's above knee height, nearer the camera than the ant, and
// around it on screen. (The lawn's grass has its own version of this in flora/lawn.ts.)
//
// It's a few lines added to each scenery material's shader (once: every material shares the one uniform).
// ============================================================================
import * as THREE from 'three';

/** Where the player is on screen (x, y: -1..1), how far from the camera, and the screen's width / height. z = 0: off. */
const uSee = { value: new THREE.Vector4(0, 0, 0, 1) };
const tmp = new THREE.Vector3();
const cam = new THREE.Vector3();

/** Each frame: where the hole goes (`focus` undefined = no hole: first person). */
export function setSee(camera: THREE.Camera, focus?: THREE.Vector3) {
  const see = uSee.value;
  camera.getWorldPosition(cam);
  if (!focus || focus.distanceTo(cam) < 6) return void (see.z = 0);
  const depth = -tmp.copy(focus).applyMatrix4(camera.matrixWorldInverse).z;
  tmp.copy(focus).project(camera);
  see.set(tmp.x, tmp.y, depth, (camera as THREE.PerspectiveCamera).aspect ?? 1);
}

type Mat = THREE.Material & { userData: { see?: boolean } };
const own = (m: object, k: string) => Object.prototype.hasOwnProperty.call(m, k);

/** Add the see-through window to one material (once). */
function patch(mat: Mat) {
  if (mat.userData.see) return;
  mat.userData.see = true;
  const before = own(mat, 'onBeforeCompile') ? mat.onBeforeCompile : null;
  const key = own(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey : null;
  mat.onBeforeCompile = (sh, renderer) => {
    before?.call(mat, sh, renderer);
    if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <clipping_planes_fragment>')) return;
    sh.uniforms.uSee = uSee;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vSeeP;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         {
           vec4 seeW = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             seeW = instanceMatrix * seeW;
           #endif
           vSeeP = vec4(gl_Position.xyw, (modelMatrix * seeW).y);
         }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uSee;\nvarying vec4 vSeeP;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         if (uSee.z > 0.0 && vSeeP.w > 2.2 && vSeeP.z < uSee.z - 2.0) {
           vec2 sd = (vSeeP.xy / vSeeP.z - uSee.xy) * vec2(min(uSee.w, 1.0), 1.0);
           // (kept outside the window, and near the ground: the cut has a soft edge both ways)
           float keep = max(smoothstep(0.42, 0.68, length(sd)), 1.0 - smoothstep(2.2, 3.6, vSeeP.w));
           float dots = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
           if (dots >= keep) discard;
         }`,
      );
  };
  mat.customProgramCacheKey = () => `${key ? key.call(mat) : ''}|see`;
  mat.needsUpdate = true;
}

/**
 * Give everything under `root` the see-through window: every mesh material, except what's under one of `skip`
 * (your own ant) and the lawn's grass (it has its own). Safe to call again after something new is built.
 */
export function seeThroughAll(root: THREE.Object3D, skip: THREE.Object3D[] = []) {
  const no = new Set<THREE.Object3D>();
  for (const s of skip) s.traverse((o) => void no.add(o));
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || no.has(o)) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m || (m as THREE.ShaderMaterial).isShaderMaterial || (m as THREE.SpriteMaterial).isSpriteMaterial) continue;
      if (own(m, 'customProgramCacheKey') && String(m.customProgramCacheKey()).startsWith('flora-lawn')) continue;
      if (m.userData.devRoomOwn) continue; // (the builder's people keep their own painted materials)
      patch(m as Mat);
    }
  });
}
