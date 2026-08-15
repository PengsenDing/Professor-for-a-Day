"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils } from "three";
import type { LilyAnimationState, LilyBodyHandle } from "./types";

const { damp, lerp, clamp } = MathUtils;

/** Amplitude multiplier applied to body motion under prefers-reduced-motion. */
const REDUCED_MOTION_SCALE = 0.12;
/** One blink takes this long, closing and opening on a half-sine. */
const BLINK_SECONDS = 0.14;

/** 0..1 ramp across the [a, b] slice of a normalised timeline. */
function seg(p: number, a: number, b: number) {
  return clamp((p - a) / (b - a), 0, 1);
}
/** Smoothstep easing. */
function ease(t: number) {
  return t * t * (3 - 2 * t);
}
/** 0 -> 1 -> 0 over [a, b]. */
function pulse(p: number, a: number, b: number) {
  return Math.sin(seg(p, a, b) * Math.PI);
}

interface PerformerState {
  time: number;
  blinkTimer: number;
  blinking: boolean;
  blinkT: number;
  /** Ponytail spring: angle and angular velocity, one per side. */
  tailAngle: [number, number];
  tailVel: [number, number];
  prevHeadY: number;
  prevHeadZ: number;
  /** Smoothed mouth/expression channels, so state changes never snap. */
  mouth: number;
  smile: number;
  brow: number;
  lookX: number;
  lookY: number;
  /**
   * Random phase so two Lilys on one page never breathe in lockstep.
   * Seeded on mount rather than at construction — randomness during render
   * is not idempotent.
   */
  phase: number;
}

export interface PerformerInput {
  state: LilyAnimationState;
  greetProgress: () => number;
  selectProgress: () => number;
  reducedMotion: boolean;
  /** Pauses the render loop when Lily is scrolled out of view. */
  active: boolean;
}

/**
 * Drives a `LilyRig` every frame.
 *
 * Everything is written as an *absolute* target for the current frame and
 * then damped toward, rather than accumulated — so a state change mid-motion
 * eases across instead of snapping, and no channel can drift over time.
 *
 * When the body reports `usesBakedClips`, the body's own AnimationMixer owns
 * the skeleton and this performer writes nothing to joints; that is the one
 * rule that keeps two animation sources from fighting over the same bones.
 */
export function useLilyPerformer(
  bodyRef: RefObject<LilyBodyHandle | null>,
  input: PerformerInput,
) {
  const s = useRef<PerformerState>({
    time: 0,
    blinkTimer: 1.2,
    blinking: false,
    blinkT: 0,
    tailAngle: [0, 0],
    tailVel: [0, 0],
    prevHeadY: 0,
    prevHeadZ: 0,
    mouth: 0,
    smile: 0.35,
    brow: 0,
    lookX: 0,
    lookY: 0,
    phase: 0,
  });

  useEffect(() => {
    s.current.phase = Math.random() * 100;
  }, []);

  // `useFrame` refreshes its callback every render, so closing over the
  // current props here is always the latest input — no mirror ref needed.
  useFrame((_, rawDelta) => {
    const body = bodyRef.current;
    const { state, greetProgress, selectProgress, reducedMotion, active } = input;
    if (!body || !active) return;

    // Clamp delta so a backgrounded tab doesn't explode the springs on return.
    const dt = Math.min(rawDelta, 1 / 20);
    const st = s.current;
    st.time += dt;
    const t = st.time + st.phase;

    const rig = body.rig;
    const m = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    const greet = greetProgress();
    const select = selectProgress();

    // -----------------------------------------------------------------
    // Face — always driven here unless baked clips already animate it.
    // -----------------------------------------------------------------

    // Autonomous blinking. Listening blinks a little more often (attentive),
    // and a blink is always allowed to finish once it has started.
    st.blinkTimer -= dt;
    if (!st.blinking && st.blinkTimer <= 0) {
      st.blinking = true;
      st.blinkT = 0;
      const base = state === "listening" ? 1.9 : 2.6;
      st.blinkTimer = base + Math.random() * 3.2;
    }
    let blink = 0;
    if (st.blinking) {
      st.blinkT += dt;
      if (st.blinkT >= BLINK_SECONDS) st.blinking = false;
      else blink = Math.sin((st.blinkT / BLINK_SECONDS) * Math.PI);
    }
    // A quick extra blink as she notices the user at the start of a greeting.
    if (state === "greeting") blink = Math.max(blink, pulse(greet, 0.04, 0.14));

    // Mouth. Speaking gets a pseudo-syllable envelope with phrase pauses —
    // not phoneme-accurate, but unmistakably "she is talking".
    let mouthTarget = 0;
    if (state === "speaking") {
      const syllable =
        0.55 * Math.sin(t * 9.1) +
        0.28 * Math.sin(t * 5.3 + 1.7) +
        0.17 * Math.sin(t * 13.7 + 0.4);
      const phrase = ease(clamp(Math.sin(t * 0.8) * 1.8 + 0.9, 0, 1));
      mouthTarget = clamp((syllable + 0.15) * 0.85, 0, 1) * phrase;
    } else if (state === "greeting") {
      // Two clear mouth shapes: "Hal—lo!"
      mouthTarget =
        0.85 * pulse(greet, 0.3, 0.42) + 0.9 * pulse(greet, 0.45, 0.6);
    }
    // Listening deliberately keeps the mouth closed — she is not talking.
    st.mouth = damp(st.mouth, mouthTarget, 22, dt);

    // Smile and brows carry most of the emotional read.
    const smileTarget =
      state === "greeting"
        ? 0.6 + 0.4 * ease(seg(greet, 0.06, 0.3))
        : state === "listening"
          ? 0.68
          : state === "selected"
            ? 1
            : state === "speaking"
              ? 0.5
              : 0.38;
    const browTarget =
      state === "greeting"
        ? ease(seg(greet, 0.02, 0.16))
        : state === "listening"
          ? 0.45
          : state === "speaking"
            ? 0.18 + 0.12 * Math.sin(t * 3.1)
            : 0.08;
    st.smile = damp(st.smile, smileTarget, 9, dt);
    st.brow = damp(st.brow, browTarget, 9, dt);

    // Eyes. She looks at the user in every state that involves the user, and
    // drifts gently while idle so she never stares.
    const engaged =
      state === "greeting" ||
      state === "listening" ||
      state === "selected" ||
      state === "speaking";
    const lookTargetX = engaged
      ? 0.06 * Math.sin(t * 0.7)
      : 0.34 * Math.sin(t * 0.31) + 0.12 * Math.sin(t * 0.13 + 2);
    const lookTargetY = engaged
      ? 0.05 * Math.sin(t * 0.9)
      : 0.18 * Math.sin(t * 0.23 + 1.1);
    st.lookX = damp(st.lookX, lookTargetX, 6, dt);
    st.lookY = damp(st.lookY, lookTargetY, 6, dt);

    if (!body.bakedClipsDriveFace) {
      rig.setBlink(blink);
      rig.setMouthOpen(st.mouth);
      rig.setSmile(st.smile);
      rig.setBrowRaise(st.brow);
      rig.setEyeLook(st.lookX, st.lookY);
    }

    // -----------------------------------------------------------------
    // Body. Skipped entirely when baked clips own the skeleton.
    // -----------------------------------------------------------------
    if (body.usesBakedClips) return;

    // Breathing: the chest expands, the whole figure rises a little with it.
    const breathRate = state === "listening" ? 1.15 : 1.0;
    const breath = Math.sin(t * breathRate);
    rig.breath?.scale.set(
      1 + breath * 0.014 * m,
      1 + breath * 0.022 * m,
      1 + breath * 0.014 * m,
    );

    // Root: idle float, listening lean-in, selection bounce.
    const float = Math.sin(t * 0.95) * 0.018 * m;
    const bounce = select > 0 ? Math.sin(select * Math.PI) * 0.09 * m : 0;
    const settle = select > 0 ? 1 + Math.sin(select * Math.PI) * 0.03 * m : 1;
    rig.root.position.y = damp(rig.root.position.y, float + bounce, 14, dt);
    rig.root.scale.setScalar(damp(rig.root.scale.x, settle, 14, dt));

    const leanTarget =
      state === "listening" ? 0.075 * m : state === "greeting" ? 0.02 * m : 0;
    rig.root.rotation.x = damp(rig.root.rotation.x, leanTarget, 5, dt);
    // A slow weight shift keeps her from looking frozen between states.
    rig.root.rotation.y = damp(
      rig.root.rotation.y,
      Math.sin(t * 0.37) * 0.05 * m,
      4,
      dt,
    );
    rig.root.rotation.z = damp(
      rig.root.rotation.z,
      Math.sin(t * 0.53 + 1) * 0.012 * m,
      4,
      dt,
    );

    rig.chest.rotation.y = damp(
      rig.chest.rotation.y,
      Math.sin(t * 0.41 + 0.6) * 0.05 * m +
        (state === "greeting" ? -0.09 * ease(seg(greet, 0.1, 0.35)) * m : 0),
      5,
      dt,
    );

    // Head. Every state layers its own gesture on top of a slow idle drift.
    let headX = Math.sin(t * 0.63) * 0.035 * m;
    let headY = Math.sin(t * 0.47 + 1.4) * 0.06 * m;
    let headZ = Math.sin(t * 0.39 + 0.2) * 0.025 * m;

    if (state === "greeting") {
      // Notice the user, then a small cheerful nod near the end.
      headY += -0.1 * ease(seg(greet, 0.0, 0.14)) * (1 - seg(greet, 0.8, 1)) * m;
      headX += 0.16 * pulse(greet, 0.72, 0.88) * m;
      headZ += 0.07 * ease(seg(greet, 0.15, 0.4)) * (1 - seg(greet, 0.85, 1)) * m;
    } else if (state === "listening") {
      // Attentive tilt with periodic encouraging nods.
      headZ += 0.11 * m;
      headX += 0.05 * m + Math.sin(t * 1.7) * 0.045 * m;
    } else if (state === "speaking") {
      headX += Math.sin(t * 2.3) * 0.05 * m;
      headY += Math.sin(t * 1.6 + 0.8) * 0.07 * m;
    } else if (state === "selected") {
      headX += 0.12 * pulse(select, 0, 1) * m;
    }

    rig.head.rotation.x = damp(rig.head.rotation.x, headX, 7, dt);
    rig.head.rotation.y = damp(rig.head.rotation.y, headY, 7, dt);
    rig.head.rotation.z = damp(rig.head.rotation.z, headZ, 7, dt);

    // Arms. Rest pose is a relaxed splay; the greeting wave is the one big
    // gesture, and speaking adds only a small conversational drift.
    // Splayed enough that both arms stay clear of the jacket silhouette.
    const armRestR = -0.24;
    const armRestL = 0.24;
    let shoulderRZ = armRestR;
    let shoulderRX = 0;
    let elbowRZ = 0;
    let shoulderLZ = armRestL;
    let elbowLZ = 0;

    if (state === "greeting" && !reducedMotion) {
      // Raise (0.12-0.32) -> three waves (0.32-0.72) -> lower (0.78-1.0).
      const raise = ease(seg(greet, 0.12, 0.32)) * (1 - ease(seg(greet, 0.78, 1)));
      shoulderRZ = lerp(armRestR, -2.05, raise);
      shoulderRX = lerp(0, -0.3, raise);
      const waving = seg(greet, 0.32, 0.72);
      const waveGate = Math.sin(clamp(waving, 0, 1) * Math.PI) ** 0.5;
      elbowRZ = lerp(0, -0.4, raise) + Math.sin(waving * Math.PI * 6) * 0.5 * waveGate;
      // The other arm swings very slightly with the body.
      shoulderLZ = armRestL + 0.12 * raise;
    } else if (state === "speaking") {
      shoulderRZ = armRestR - 0.1 * m + Math.sin(t * 1.9) * 0.07 * m;
      shoulderLZ = armRestL + 0.1 * m + Math.sin(t * 1.7 + 1) * 0.07 * m;
      elbowRZ = -0.22 * m + Math.sin(t * 2.4) * 0.12 * m;
      elbowLZ = 0.2 * m + Math.sin(t * 2.1 + 0.5) * 0.1 * m;
    } else if (state === "listening") {
      shoulderRZ = armRestR + 0.06 * m;
      shoulderLZ = armRestL - 0.06 * m;
    }

    if (rig.shoulderR) {
      rig.shoulderR.rotation.z = damp(rig.shoulderR.rotation.z, shoulderRZ, 9, dt);
      rig.shoulderR.rotation.x = damp(rig.shoulderR.rotation.x, shoulderRX, 9, dt);
    }
    if (rig.elbowR) {
      rig.elbowR.rotation.z = damp(rig.elbowR.rotation.z, elbowRZ, 14, dt);
    }
    if (rig.shoulderL) {
      rig.shoulderL.rotation.z = damp(rig.shoulderL.rotation.z, shoulderLZ, 9, dt);
    }
    if (rig.elbowL) {
      rig.elbowL.rotation.z = damp(rig.elbowL.rotation.z, elbowLZ, 14, dt);
    }

    // Ponytails: never keyframed. They are two damped springs driven by the
    // head's angular velocity, which is what makes the head motion read as
    // weight rather than as a rotating prop.
    const headVelZ = (rig.head.rotation.z - st.prevHeadZ) / dt;
    const headVelY = (rig.head.rotation.y - st.prevHeadY) / dt;
    st.prevHeadZ = rig.head.rotation.z;
    st.prevHeadY = rig.head.rotation.y;

    const tails = [rig.ponytailR, rig.ponytailL];
    for (let i = 0; i < 2; i++) {
      const tail = tails[i];
      if (!tail) continue;
      const side = i === 0 ? -1 : 1;
      // Drive: head swing + the root bob + a touch of idle life.
      const drive =
        -headVelZ * 0.07 -
        headVelY * 0.05 * side +
        Math.sin(t * 1.3 + i * 2.1) * 0.05 * m;
      const stiffness = 42;
      const damping = 7.5;
      const accel =
        (drive - st.tailAngle[i]) * stiffness - st.tailVel[i] * damping;
      st.tailVel[i] += accel * dt;
      st.tailAngle[i] += st.tailVel[i] * dt;
      st.tailAngle[i] = clamp(st.tailAngle[i], -0.5, 0.5);
      tail.rotation.z = st.tailAngle[i] * side;
      tail.rotation.x = st.tailAngle[i] * 0.6;
    }
  });
}
