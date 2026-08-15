import type * as THREE from "three";

/**
 * The five states Lily can be in. `selected` is reported while the
 * selection confirmation is playing; the *persistent* fact that she is
 * selected is a separate visual layer (glow ring + scale), so she can keep
 * speaking or listening while selected.
 */
export type LilyAnimationState =
  | "idle"
  | "greeting"
  | "speaking"
  | "listening"
  | "selected";

/**
 * The animation contract between a Lily *body* and the performer that moves
 * it. Everything that animates Lily goes through this interface, which is
 * why the procedural stand-in and a real `lily.glb` can share one performer:
 * the GLB path fills the same slots from discovered bones and morph targets
 * (see `lily-gltf.tsx`).
 *
 * Joints are plain `Object3D`s whose *local* rotation the performer owns.
 * Each one must sit at rest with identity rotation so the performer can
 * write absolute angles instead of accumulating drift.
 */
export interface LilyRig {
  /** Whole figure: bob, sway, lean, selection bounce. */
  root: THREE.Object3D;
  /** Upper body: gentle twist. Head and arms hang below it. */
  chest: THREE.Object3D;
  /**
   * Breathing scale target. Kept separate from `chest` on purpose: a
   * non-uniform scale on the chest would squash the head and arms with it.
   * Null when a body has no safe place to breathe from.
   */
  breath: THREE.Object3D | null;
  /** Head: nod, tilt, turn. */
  head: THREE.Object3D;
  /** Ponytail roots — driven by spring lag, never keyframed directly. */
  ponytailL: THREE.Object3D | null;
  ponytailR: THREE.Object3D | null;
  /** Arm chain, character-anatomical left/right (her right = screen left). */
  shoulderR: THREE.Object3D | null;
  elbowR: THREE.Object3D | null;
  shoulderL: THREE.Object3D | null;
  elbowL: THREE.Object3D | null;

  /** 0 = eyes open, 1 = eyes fully closed. */
  setBlink(value: number): void;
  /** 0 = mouth closed, 1 = mouth wide open. */
  setMouthOpen(value: number): void;
  /** 0 = resting smile, 1 = big expressive smile. */
  setSmile(value: number): void;
  /** 0 = neutral brows, 1 = raised/interested brows. */
  setBrowRaise(value: number): void;
  /** Eye direction in roughly [-1, 1] on each axis. */
  setEyeLook(x: number, y: number): void;
}

/** What a body component hands back once its object graph is mounted. */
export interface LilyBodyHandle {
  rig: LilyRig;
  /**
   * True when the body animates itself from baked glTF clips. The performer
   * then leaves every joint alone so two animation sources can never fight
   * over the same bones.
   */
  usesBakedClips: boolean;
  /** True when baked clips already drive the face (morph target tracks). */
  bakedClipsDriveFace: boolean;
  /** Play a state; only meaningful when `usesBakedClips` is true. */
  playState?(state: LilyAnimationState): void;
}

/** External signals that drive the state machine. */
export interface LilySignals {
  isSpeaking: boolean;
  isListening: boolean;
  isSelected: boolean;
  isHovered: boolean;
  reducedMotion: boolean;
}
