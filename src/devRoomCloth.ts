/**
 * THE BUILDER'S CLOTH TEE, TRIED IN THE DEV ROOM (v0.40; Joshua, 2026-11-14: "Can you try the cloth sim to see if it
 * works?", and "would keep those at a minimum or actually baked/freeze the shirt sim after 3s of loading so it can
 * settle. It should be the Sarah one I shared in the JSON").
 *
 * The tee is the builder's own procedural garment (`vendor/ccbs/sarahlab/garment`, unchanged): tailored to her body,
 * sewn, laid round her and simulated as cloth against her skin. This file only puts it into this room:
 *
 * - THE BUILDER'S CLOTH WORKS IN ITS OWN ROOM'S UNITS, 100 to the metre (its gravity, its millimetres off her skin).
 *   This room's are about 1.7. So the cloth is simulated on a SECOND, UNSEEN COPY of her at the builder's size, standing
 *   at the middle of its own little world, given her bones' turns and her live shapes each frame; and the tee is drawn
 *   through one matrix that carries that world onto her where she really is. Walking her circle therefore does not
 *   swing the tee about (her copy never travels), which is also the calmer thing for it.
 * - That copy has her whole body (every triangle, all 43 shapes): the cloth reads her skin on the processor, not the
 *   graphics chip, so it costs the same whatever detail she is drawn at.
 * - DRESSING is the builder's own sequence: eased on weightless, held where it settled, her arms out a little and down
 *   again so the sleeves fall into place, held again.
 * - FREEZE: once dressed, the tee as it hangs is turned into an ordinary piece of clothing on her skeleton (each point
 *   given the bones of the skin under it, and moved back to where it would be with her bones at rest), and the
 *   simulation and her unseen copy are thrown away. From then on it costs one more mesh to draw and nothing to think
 *   about: it bends with her as her skin does, and no longer swings.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomGarment } from './vendor/ccbs/sarahlab/garment/roomGarment';
import { clampGarmentSettings } from './vendor/ccbs/sarahlab/garment/settings';
import { SARAH_V2_JOINTS } from './vendor/ccbs/sarahlab/garment/bodyInput';
import { CUT_EDGE_ATTRIBUTE, setCutEdge } from './vendor/ccbs/sarahlab/garment/cutEdge';
import { FACE_REST_OFFSET, FACE_REST_SCALE } from './vendor/ccbs/sarahlab/faceRig';
import { CLOTH_TUNE_DEFAULT, clothRestScale, clothTuning, type ClothTune } from './vendor/ccbs/sarahlab/sarahLabTool';

/**
 * Joshua's saved character "Sarah" (his characters file of 2026-11-14): her red raglan tee's settings and cloth dials,
 * as the builder saved them (`clothes.garment`), and its fabric's colour (`clothes.garments.shirtSpandexLite`).
 */
export const SARAH_TEE = Object.freeze({
  settings: { construction: 'raglan', gusset: 0.5, neckWidth: 0.24, neckCurve: 0, ease: { bust: 0, waist: 0, hip: 0 }, sleeveWidth: 0, length: 20, frontHem: 0, backHem: 0, hemCurve: 1, sleeve: 40, neckDepth: 0.1, bellyRoom: 0 },
  dials: { weight: 41, calm: 100, fit: 100, close: 100, stretch: 100, grip: 73, steps: 43 } as ClothTune,
  colour: '#be0f2a',
});

/** The builder's dressing, seconds (its DRESS): weightless until, arms out by, held until, down by, held where it hangs at. */
const DRESS = Object.freeze({ weightless: 1.2, raise: 0.55, out: 1.5, hold: 2.7, down: 3.7, done: 4.3 });
/** FREEZE happens this long after she is dressed (seconds): the hem has stopped swinging by then. */
const FREEZE_AFTER_DRESSED = 0.7;
const BUILDER_UNITS_PER_METRE = 100;

export interface ClothTestOptions {
  /** The loaded model's own body part (never drawn itself): her unseen copy is cloned from it. */
  readonly part: THREE.Object3D;
  /** Her skin as she is drawn in the room, and the group that sizes her. */
  readonly display: THREE.SkinnedMesh;
  readonly inner: THREE.Object3D;
  /** Her height against the model's own (1 = as modelled). */
  readonly tall: number;
  /** Her skin's whole triangle list and all its shapes, as the file has them, with the shapes' names. */
  readonly index: THREE.BufferAttribute;
  readonly morphs: THREE.BufferGeometry['morphAttributes'];
  readonly dict: Record<string, number>;
  /** Her own shape weights (belly, bust, navel). */
  readonly shape: Readonly<Record<string, number>>;
  /** The shapes that move with her walk: read from her drawn body each frame. */
  readonly motion: readonly string[];
  readonly scene: THREE.Scene;
  /** True: turn the tee into ordinary clothing once it is dressed. False: keep simulating. */
  readonly freeze: boolean;
}

export class ClothTest {
  /** 'dressing', 'live' or 'frozen', and what it costs: for the room's readout. */
  phase: 'dressing' | 'live' | 'frozen' = 'dressing';
  private room: RoomGarment | null;
  private readonly simRoot = new THREE.Group();
  private readonly simInner = new THREE.Group();
  private simBody: THREE.SkinnedMesh | null;
  private readonly simGeo: THREE.BufferGeometry;
  private readonly holder = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private frozen: THREE.SkinnedMesh | null = null;
  private t = 0;
  private readonly inverse = new THREE.Matrix4();
  private readonly tailorMs: number;
  private frozenTriangles = 0;

  constructor(private readonly options: ClothTestOptions) {
    const t0 = performance.now();
    const copy = cloneSkinned(options.part);
    let body: THREE.SkinnedMesh | null = null;
    copy.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && !body && m.geometry.getAttribute('_cloth_cover')) body = m;
    });
    if (!body) throw new Error('this body has no skin the cloth can lie on');
    const simBody = body as THREE.SkinnedMesh;
    // her whole body with all its shapes, on her copy only (the room's own copy of this model may be lighter, or baked)
    const source = simBody.geometry, g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(source.attributes)) g.setAttribute(name, a);
    g.setIndex(options.index);
    g.morphAttributes = options.morphs;
    g.morphTargetsRelative = source.morphTargetsRelative;
    this.simGeo = g;
    simBody.geometry = g;
    simBody.morphTargetDictionary = options.dict;
    simBody.morphTargetInfluences = new Array<number>(Object.keys(options.dict).length).fill(0);
    this.simBody = simBody;
    this.simInner.add(copy);
    this.simRoot.add(this.simInner);
    this.simRoot.updateMatrixWorld(true);
    // Her copy at the builder's size: her metres are her geometry's units times FACE_REST_SCALE. Her size in the world
    // is her SKELETON's (her skin is drawn where her bones carry it; her mesh's own scale only undoes the file's
    // packing of its numbers, and measuring that made her a tenth too small for her tee: it hung to her knees). So:
    // two of her joints, as far apart in the world as they are, against as far apart as her geometry has them.
    {
      const bones = simBody.skeleton.bones, inverses = simBody.skeleton.boneInverses, unbind = simBody.bindMatrix.clone().invert();
      const inGeometry = (i: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(inverses[i]).invert()).applyMatrix4(unbind);
      const inWorld = (i: number) => new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld);
      const head = SARAH_V2_JOINTS.head, ankle = SARAH_V2_JOINTS.ankle[0];
      const now = inWorld(head).distanceTo(inWorld(ankle)) / inGeometry(head).distanceTo(inGeometry(ankle));
      this.simInner.scale.setScalar((BUILDER_UNITS_PER_METRE * FACE_REST_SCALE * options.tall) / now);
    }
    this.follow();
    // (her copy's bones where they now are, before the tee is laid on her: laid on her as she was a moment ago, at a
    // hundredth of her size, it began as a knot at her feet and never untangled)
    this.simRoot.updateMatrixWorld(true);
    const tuning = clothTuning(SARAH_TEE.dials);
    this.material = new THREE.MeshStandardMaterial({ color: SARAH_TEE.colour, roughness: 0.85, side: THREE.DoubleSide });
    const garment = clampGarmentSettings(SARAH_TEE.settings);
    this.room = new RoomGarment({
      body: simBody, root: this.simInner, params: {}, settings: tuning.settings, standOff: tuning.standOff,
      unitsPerMetre: BUILDER_UNITS_PER_METRE * options.tall, scale: FACE_REST_SCALE, offset: FACE_REST_OFFSET, material: this.material, garment,
      fitScale: clothRestScale(SARAH_TEE.dials.fit) / clothRestScale(CLOTH_TUNE_DEFAULT.fit),
    });
    setCutEdge(this.material, true);
    this.room.cloth.refit();
    this.room.cloth.weightless = true;
    this.room.cloth.mesh.castShadow = true;
    this.holder.matrixAutoUpdate = false;
    this.holder.add(this.room.cloth.mesh);
    options.scene.add(this.holder);
    this.tailorMs = performance.now() - t0;
  }

  /** Her copy takes her bones' turns and her shapes as they are this frame. */
  private follow(): void {
    const body = this.simBody;
    if (!body) return;
    const from = this.options.display.skeleton.bones, to = body.skeleton.bones;
    for (let i = 0; i < to.length && i < from.length; i++) {
      to[i].position.copy(from[i].position); to[i].quaternion.copy(from[i].quaternion); to[i].scale.copy(from[i].scale);
    }
    const inf = body.morphTargetInfluences!, dict = this.options.dict;
    inf.fill(0);
    for (const [name, w] of Object.entries(this.options.shape)) if (dict[name] !== undefined) inf[dict[name]] = w;
    const shown = this.options.display, shownDict = shown.morphTargetDictionary, shownInf = shown.morphTargetInfluences;
    if (shownDict && shownInf) for (const name of this.options.motion) if (dict[name] !== undefined && shownDict[name] !== undefined) inf[dict[name]] = shownInf[shownDict[name]] ?? 0;
  }

  /** One frame: after her bones are posed and she stands where she is drawn. */
  update(dt: number): void {
    const room = this.room;
    if (!room) return;
    this.follow();
    // the builder's dressing, step for step
    const was = this.t;
    this.t += dt;
    const at = (k: number) => was < k && this.t >= k;
    if (at(DRESS.weightless)) { room.cloth.settle(); room.cloth.weightless = false; }
    if (this.t < DRESS.done) {
      const ss = (a: number, b: number) => { const u = Math.min(1, Math.max(0, (this.t - a) / (b - a))); return u * u * (3 - 2 * u); };
      room.pose.raise = DRESS.raise * (ss(DRESS.weightless, DRESS.out) - ss(DRESS.hold, DRESS.down));
    } else room.pose.raise = 0;
    if (at(DRESS.done)) { room.cloth.settle(); this.phase = 'live'; }
    this.simRoot.updateMatrixWorld(true);
    room.applyPose();
    this.simRoot.updateMatrixWorld(true);
    // (a slow frame in two halves, as the builder's room takes it)
    const pieces = dt > 1 / 40 ? 2 : 1;
    for (let k = 0; k < pieces; k++) room.frame(dt / pieces);
    // her copy's world carried onto her
    this.options.inner.updateWorldMatrix(true, false);
    this.holder.matrix.multiplyMatrices(this.options.inner.matrixWorld, this.inverse.copy(this.simInner.matrixWorld).invert());
    this.holder.matrixWorldNeedsUpdate = true;
    if (this.options.freeze && this.t >= DRESS.done + FREEZE_AFTER_DRESSED) this.freeze();
  }

  /**
   * The tee as it hangs now, as ordinary clothing on her skeleton: each drawn point takes the bones of the skin it was
   * tailored over (the three corners of that triangle, by how near it lies to each; its four strongest bones kept), and
   * is moved back through those bones' turns to where it belongs with her at rest. Then the simulation goes.
   */
  private freeze(): void {
    const room = this.room, simBody = this.simBody;
    if (!room || !simBody) return;
    const cloth = room.cloth.mesh.geometry, sewn = room.tailored.sewn, binding = room.tailored.binding;
    const P = cloth.getAttribute('position'), N = cloth.getAttribute('normal'), UV = cloth.getAttribute('uv'), CUT = cloth.getAttribute(CUT_EDGE_ATTRIBUTE);
    const drawn = cloth.drawRange.count === Infinity ? cloth.index!.count : Math.min(cloth.index!.count, cloth.drawRange.count);
    // only the points that are worn, renumbered
    const remap = new Int32Array(P.count).fill(-1), order: number[] = [], tri = new Uint32Array(drawn);
    for (let i = 0; i < drawn; i++) { const v = cloth.index!.getX(cloth.drawRange.start + i); if (remap[v] < 0) { remap[v] = order.length; order.push(v); } tri[i] = remap[v]; }
    const n = order.length;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), cut = new Float32Array(n).fill(1), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const SI = simBody.geometry.getAttribute('skinIndex'), SW = simBody.geometry.getAttribute('skinWeight');
    const bones = simBody.skeleton.bones, inverses = simBody.skeleton.boneInverses;
    const boneMatrix = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inverses[i]));
    const unbind = simBody.bindMatrix.clone().invert();
    const sum = new THREE.Matrix4(), back = new THREE.Matrix4(), p = new THREE.Vector3(), d = new THREE.Vector3();
    const share = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const v = order[k], particle = sewn.vertexParticle[v];
      share.clear();
      for (let c = 0; c < 3; c++) {
        const bv = binding.tri[particle * 3 + c], w = binding.bary[particle * 3 + c];
        for (let j = 0; j < 4; j++) { const weight = SW.getComponent(bv, j) * w; if (weight > 0) { const b = SI.getComponent(bv, j); share.set(b, (share.get(b) ?? 0) + weight); } }
      }
      const top = [...share.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = top.reduce((s, e) => s + e[1], 0) || 1;
      sum.elements.fill(0);
      top.forEach(([b, w], j) => {
        si[k * 4 + j] = b; sw[k * 4 + j] = w / total;
        const e = boneMatrix[b].elements;
        for (let q = 0; q < 16; q++) sum.elements[q] += e[q] * (w / total);
      });
      back.copy(sum).invert().premultiply(unbind);
      p.set(P.getX(v), P.getY(v), P.getZ(v)).applyMatrix4(back);
      d.set(N.getX(v), N.getY(v), N.getZ(v)).transformDirection(back);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      nor[k * 3] = d.x; nor[k * 3 + 1] = d.y; nor[k * 3 + 2] = d.z;
      uv[k * 2] = UV.getX(v); uv[k * 2 + 1] = UV.getY(v);
      if (CUT) cut[k] = CUT.getX(v);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute(CUT_EDGE_ATTRIBUTE, new THREE.BufferAttribute(cut, 1));
    g.setIndex(new THREE.BufferAttribute(tri, 1));
    // (its hem and cuffs are cut within their last row of triangles, by the material, as on the simulated tee)
    const material = new THREE.MeshStandardMaterial({ color: SARAH_TEE.colour, roughness: 0.85, side: THREE.DoubleSide });
    setCutEdge(material, true);
    const shown = this.options.display;
    const frozen = new THREE.SkinnedMesh(g, material);
    frozen.name = 'devroom-frozen-tee';
    frozen.position.copy(shown.position); frozen.quaternion.copy(shown.quaternion); frozen.scale.copy(shown.scale);
    frozen.castShadow = true;
    frozen.frustumCulled = false;
    shown.parent!.add(frozen);
    frozen.bind(shown.skeleton, shown.bindMatrix);
    this.frozen = frozen;
    this.frozenTriangles = drawn / 3;
    this.dropSim();
    this.phase = 'frozen';
  }

  private dropSim(): void {
    this.room?.dispose();
    this.room = null;
    this.holder.removeFromParent();
    this.material.dispose();
    this.simBody?.skeleton.dispose();
    this.simBody = null;
    this.simInner.clear();
    // (its attributes are the model's own, shared: only this geometry's own bookkeeping goes)
    this.simGeo.dispose();
  }

  /** A line for the room's readout. */
  line(): string {
    if (this.phase === 'frozen') return `cloth tee: frozen · ${(this.frozenTriangles / 1000).toFixed(1)}k triangles · no simulation`;
    const s = this.room?.cloth.stats();
    if (!s) return '';
    const ms = (x: number) => x.toFixed(x < 10 ? 1 : 0);
    return `cloth tee: ${this.phase} · ${s.particles} points · ${ms(s.skinMs + s.simMs + s.drawMs)} ms a frame (skin ${ms(s.skinMs)} + cloth ${ms(s.simMs)} + draw ${ms(s.drawMs)}) · tailored in ${(this.tailorMs / 1000).toFixed(1)} s`;
  }

  dispose(): void {
    if (this.room) this.dropSim();
    if (this.frozen) {
      this.frozen.removeFromParent();
      this.frozen.geometry.dispose();
      (this.frozen.material as THREE.Material).dispose();
      this.frozen = null;
    }
  }
}
