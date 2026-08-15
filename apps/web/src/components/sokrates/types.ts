import type * as THREE from "three";

/**
 * The five states Sokrates can be in. `selected` is reported while the
 * selection confirmation is playing; the *persistent* fact that he is
 * selected is a separate visual layer (glow ring + scale), so he can keep
 * speaking or listening while selected.
 *
 * Deliberately the same five states as Lily's — the Teaching Session drives
 * every student through one vocabulary.
 */
export type SokratesAnimationState =
  | "idle"
  | "greeting"
  | "speaking"
  | "listening"
  | "selected";

/**
 * The animation contract between a Sokrates *body* and the performer that
 * moves it — the same pattern as Lily's rig, with his own appendages: where
 * she has two ponytails, he has one beard mass that swings with the head.
 *
 * Joints are plain `Object3D`s whose *local* rotation the performer owns.
 * Each one must sit at rest with identity rotation so the performer can
 * write absolute angles instead of accumulating drift.
 */
export interface SokratesRig {
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
  /** Beard root — driven by spring lag, never keyframed directly. */
  beard: THREE.Object3D | null;
  /**
   * Arm chains, character-anatomical left/right (his right = screen left).
   * His right hand is the *thinking* hand (chin/beard); his left is the
   * free hand used for the greeting gesture.
   */
  shoulderR: THREE.Object3D | null;
  elbowR: THREE.Object3D | null;
  shoulderL: THREE.Object3D | null;
  elbowL: THREE.Object3D | null;

  /** 0 = eyes open, 1 = eyes fully closed. Small negatives may widen them. */
  setBlink(value: number): void;
  /** 0 = mouth closed, 1 = mouth wide open. */
  setMouthOpen(value: number): void;
  /** 0 = resting smile, 1 = big amused smile. */
  setSmile(value: number): void;
  /** 0 = neutral brows, 1 = raised/interested brows. */
  setBrowRaise(value: number): void;
  /** Eye direction in roughly [-1, 1] on each axis. */
  setEyeLook(x: number, y: number): void;
}

/** What a body component hands back once its object graph is mounted. */
export interface SokratesBodyHandle {
  rig: SokratesRig;
  /**
   * True when the body animates itself from baked glTF clips. The performer
   * then leaves every joint alone so two animation sources can never fight
   * over the same bones.
   */
  usesBakedClips: boolean;
  /** True when baked clips already drive the face (morph target tracks). */
  bakedClipsDriveFace: boolean;
  /** Play a state; only meaningful when `usesBakedClips` is true. */
  playState?(state: SokratesAnimationState): void;
}

/** External signals that drive the state machine. */
export interface SokratesSignals {
  isSpeaking: boolean;
  isListening: boolean;
  isSelected: boolean;
  isHovered: boolean;
  reducedMotion: boolean;
}
