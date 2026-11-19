/**
 * people/rig.ts
 * -----------------------------------------------------------------------------
 * Phase 2 — the wedding cast's skeleton and its motion clips.
 *
 * Every character is a hierarchy of plain `THREE.Group` joints (no skinned
 * meshes, no asset files): root → hips → spine → chest → neck → head, with
 * shoulder → elbow chains for the arms and hip → knee chains for the legs.
 * Body parts are rigid meshes parented to those joints, so animating is just
 * writing joint rotations each frame — cheap, and impossible to "tear".
 *
 * Conventions (character faces +Z at rotation.y = 0, Y up, metres):
 *  - Arms and legs hang along −Y from their joint.
 *  - shoulder/hip rotation.x < 0 swings the limb forward; > 0 backward.
 *  - shoulderL.z > 0 lifts the left arm out sideways; shoulderR.z < 0 the right.
 *  - knee rotation.x > 0 folds the shin back; elbow rotation.x < 0 folds the
 *    forearm forward.
 *
 * Pure module: no React, safe to unit-test.
 */

import type * as THREE from "three";

/** Joint handles for one character. Filled in by `Character.tsx`. */
export interface Joints {
  readonly root: THREE.Group;
  readonly hips: THREE.Group;
  readonly spine: THREE.Group;
  readonly chest: THREE.Group;
  readonly neck: THREE.Group;
  readonly head: THREE.Group;
  readonly shoulderL: THREE.Group;
  readonly elbowL: THREE.Group;
  readonly shoulderR: THREE.Group;
  readonly elbowR: THREE.Group;
  readonly hipL: THREE.Group;
  readonly kneeL: THREE.Group;
  readonly hipR: THREE.Group;
  readonly kneeR: THREE.Group;
}

/** Every motion the cast can perform. */
export type Motion =
  | "idle"
  | "walk"
  | "clap"
  | "dance" // bhangra-like: arms up, shoulder shrugs, alternating knee lifts
  | "garba" // circling clap-and-turn
  | "sit" // seated on the floor, cross-legged-ish
  | "sitRaised" // seated on a swing / ledge
  | "kneel" // one knee down, offering a ring
  | "holdHands"
  | "ringExchange"
  | "varmala"
  | "petalThrow"
  | "wave"
  | "namaste"
  | "chant"; // pandit: seated, hands moving over the fire

/** Leg length (hip joint height) of an adult at scale 1, in metres. */
export const HIP_HEIGHT = 0.92;

const sin = Math.sin;
const pos = (v: number): number => (v > 0 ? v : 0);

function reset(j: Joints): void {
  for (const g of [
    j.hips,
    j.spine,
    j.chest,
    j.neck,
    j.head,
    j.shoulderL,
    j.elbowL,
    j.shoulderR,
    j.elbowR,
    j.hipL,
    j.kneeL,
    j.hipR,
    j.kneeR,
  ]) {
    g.rotation.set(0, 0, 0);
  }
  j.hips.position.y = HIP_HEIGHT;
}

/** Relaxed arms, slow breath, a little weight shift. Layered under most clips. */
function breathe(j: Joints, t: number, phase: number): void {
  j.chest.rotation.x = 0.025 * sin(t * 1.5 + phase);
  j.spine.rotation.z = 0.02 * sin(t * 0.45 + phase);
  j.head.rotation.y = 0.18 * sin(t * 0.27 + phase * 1.7);
  j.head.rotation.x = 0.04 * sin(t * 0.4 + phase);
  j.shoulderL.rotation.z = 0.09 + 0.015 * sin(t * 1.5 + phase);
  j.shoulderR.rotation.z = -0.09 - 0.015 * sin(t * 1.5 + phase);
  j.elbowL.rotation.x = -0.18;
  j.elbowR.rotation.x = -0.18;
}

function seatedLegs(j: Joints): void {
  j.hips.position.y = 0.16;
  j.hipL.rotation.set(-1.45, 0, 0.55);
  j.hipR.rotation.set(-1.45, 0, -0.55);
  j.kneeL.rotation.x = 2.35;
  j.kneeR.rotation.x = 2.35;
}

/**
 * Write one frame of `motion` into the joints.
 *
 * @param t      seconds since the character appeared
 * @param phase  per-character offset so a crowd never moves in lockstep
 * @param side   +1 when the partner stands on the character's left, −1 right
 */
export function applyMotion(
  j: Joints,
  motion: Motion,
  t: number,
  phase: number,
  side = 1,
): void {
  reset(j);
  switch (motion) {
    case "idle": {
      breathe(j, t, phase);
      break;
    }
    case "walk": {
      const w = t * 5.2 + phase;
      j.hipL.rotation.x = -0.42 * sin(w);
      j.hipR.rotation.x = 0.42 * sin(w);
      j.kneeL.rotation.x = 0.65 * pos(sin(w - 1.4));
      j.kneeR.rotation.x = 0.65 * pos(-sin(w - 1.4));
      j.shoulderL.rotation.set(0.32 * sin(w), 0, 0.08);
      j.shoulderR.rotation.set(-0.32 * sin(w), 0, -0.08);
      j.elbowL.rotation.x = -0.25 - 0.15 * pos(-sin(w));
      j.elbowR.rotation.x = -0.25 - 0.15 * pos(sin(w));
      j.spine.rotation.y = 0.07 * sin(w);
      j.hips.position.y = HIP_HEIGHT - 0.02 + 0.022 * Math.abs(sin(w));
      break;
    }
    case "clap": {
      breathe(j, t, phase);
      const c = sin(t * 11 + phase);
      j.shoulderL.rotation.set(-0.95, 0, -0.18 - 0.14 * c);
      j.shoulderR.rotation.set(-0.95, 0, 0.18 + 0.14 * c);
      j.elbowL.rotation.x = -1.05;
      j.elbowR.rotation.x = -1.05;
      break;
    }
    case "dance": {
      const b = t * 6.2 + phase;
      const lift = pos(sin(b));
      const liftR = pos(-sin(b));
      j.hips.position.y = HIP_HEIGHT - 0.05 + 0.05 * Math.abs(sin(b));
      j.hipL.rotation.x = -0.75 * lift;
      j.kneeL.rotation.x = 1.1 * lift;
      j.hipR.rotation.x = -0.75 * liftR;
      j.kneeR.rotation.x = 1.1 * liftR;
      j.shoulderL.rotation.set(-0.2, 0, 2.45 + 0.18 * sin(b * 2));
      j.shoulderR.rotation.set(-0.2, 0, -2.45 + 0.18 * sin(b * 2 + 1));
      j.elbowL.rotation.x = -0.35;
      j.elbowR.rotation.x = -0.35;
      j.chest.rotation.y = 0.18 * sin(b);
      j.head.rotation.z = 0.08 * sin(b);
      break;
    }
    case "garba": {
      const g = t * 3.4 + phase;
      const s = sin(g);
      j.spine.rotation.z = 0.16 * s;
      j.spine.rotation.y = 0.25 * s;
      j.shoulderL.rotation.set(-0.7, 0, 1.0 + 0.5 * s);
      j.shoulderR.rotation.set(-0.7, 0, -1.0 + 0.5 * s);
      j.elbowL.rotation.x = -1.2;
      j.elbowR.rotation.x = -1.2;
      j.hipL.rotation.x = -0.3 * pos(s);
      j.kneeL.rotation.x = 0.5 * pos(s);
      j.hipR.rotation.x = -0.3 * pos(-s);
      j.kneeR.rotation.x = 0.5 * pos(-s);
      j.hips.position.y = HIP_HEIGHT - 0.03 + 0.025 * Math.abs(s);
      break;
    }
    case "sit": {
      breathe(j, t, phase);
      seatedLegs(j);
      j.spine.rotation.x = 0.08;
      j.shoulderL.rotation.set(-0.55, 0, 0.15);
      j.shoulderR.rotation.set(-0.55, 0, -0.15);
      j.elbowL.rotation.x = -0.55;
      j.elbowR.rotation.x = -0.55;
      break;
    }
    case "sitRaised": {
      breathe(j, t, phase);
      j.hips.position.y = 0.5;
      j.hipL.rotation.x = -1.5;
      j.hipR.rotation.x = -1.5;
      j.kneeL.rotation.x = 1.45 + 0.1 * sin(t * 1.1 + phase);
      j.kneeR.rotation.x = 1.45 + 0.1 * sin(t * 1.1 + phase + 0.6);
      j.shoulderL.rotation.set(-0.4, 0, 0.25);
      j.shoulderR.rotation.set(-0.4, 0, -0.25);
      j.elbowL.rotation.x = -0.9;
      j.elbowR.rotation.x = -0.9;
      break;
    }
    case "kneel": {
      breathe(j, t, phase);
      j.hips.position.y = 0.5;
      j.hipL.rotation.x = -1.5;
      j.kneeL.rotation.x = 1.5;
      j.hipR.rotation.x = 0.15;
      j.kneeR.rotation.x = 1.55;
      j.spine.rotation.x = -0.05;
      j.head.rotation.x = -0.18;
      j.shoulderR.rotation.set(-1.25 + 0.04 * sin(t * 2), 0, -0.1);
      j.elbowR.rotation.x = -0.35;
      j.shoulderL.rotation.set(-0.6, 0, 0.1);
      j.elbowL.rotation.x = -0.9;
      break;
    }
    case "holdHands": {
      breathe(j, t, phase);
      // The inner hand reaches toward the partner.
      if (side > 0) {
        j.shoulderL.rotation.set(-0.2, 0, 0.32);
        j.elbowL.rotation.x = -0.25;
      } else {
        j.shoulderR.rotation.set(-0.2, 0, -0.32);
        j.elbowR.rotation.x = -0.25;
      }
      j.head.rotation.y = 0.35 * side + 0.08 * sin(t * 0.3 + phase);
      break;
    }
    case "ringExchange": {
      breathe(j, t, phase);
      const r = 0.06 * sin(t * 1.6 + phase);
      j.shoulderR.rotation.set(-1.05 + r, 0, 0.12);
      j.elbowR.rotation.x = -0.55;
      j.shoulderL.rotation.set(-0.85 - r, 0, -0.08);
      j.elbowL.rotation.x = -0.7;
      j.head.rotation.x = 0.18;
      break;
    }
    case "varmala": {
      breathe(j, t, phase);
      // A 9-second loop: lift the garland high, hold, lower it onto the partner.
      const k = (t + phase) % 9;
      const up = k < 3 ? sin((k / 3) * Math.PI) : 0;
      j.shoulderL.rotation.set(-0.7 - 1.6 * up, 0, -0.15);
      j.shoulderR.rotation.set(-0.7 - 1.6 * up, 0, 0.15);
      j.elbowL.rotation.x = -0.5;
      j.elbowR.rotation.x = -0.5;
      j.head.rotation.x = -0.12 * up;
      break;
    }
    case "petalThrow": {
      breathe(j, t, phase);
      const a = pos(sin(t * 1.7 + phase));
      j.shoulderR.rotation.set(-0.4 - 2.0 * a, 0, -0.1);
      j.elbowR.rotation.x = -0.9 * (1 - a);
      j.head.rotation.x = -0.2 * a;
      break;
    }
    case "wave": {
      breathe(j, t, phase);
      j.shoulderR.rotation.set(-0.1, 0, -2.45 + 0.22 * sin(t * 7 + phase));
      j.elbowR.rotation.x = -0.35;
      break;
    }
    case "namaste": {
      breathe(j, t, phase);
      j.shoulderL.rotation.set(-0.5, 0, -0.42);
      j.shoulderR.rotation.set(-0.5, 0, 0.42);
      j.elbowL.rotation.x = -1.85;
      j.elbowR.rotation.x = -1.85;
      j.spine.rotation.x = 0.06 + 0.06 * pos(sin(t * 0.8 + phase));
      break;
    }
    case "chant": {
      breathe(j, t, phase);
      seatedLegs(j);
      const c = sin(t * 1.3 + phase);
      j.shoulderR.rotation.set(-1.0 - 0.2 * c, 0, 0.1);
      j.elbowR.rotation.x = -0.7;
      j.shoulderL.rotation.set(-0.55, 0, 0.12);
      j.elbowL.rotation.x = -1.0;
      j.head.rotation.x = 0.1 + 0.05 * c;
      break;
    }
  }
}
