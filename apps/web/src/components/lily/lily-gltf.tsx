"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { LILY_HEIGHT } from "./lily-assets";
import type { LilyAnimationState, LilyBodyHandle, LilyRig } from "./types";

/** Crossfade length between baked clips. */
const FADE_SECONDS = 0.28;

/** Lowercase, strip separators — so `mixamorig:LeftArm` ~= `left_arm`. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** First descendant whose normalised name matches any pattern, in order. */
function findNode(root: THREE.Object3D, patterns: RegExp[]): THREE.Object3D | null {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => nodes.push(o));
  for (const pattern of patterns) {
    const hit = nodes.find((n) => pattern.test(norm(n.name)));
    if (hit) return hit;
  }
  return null;
}

/**
 * Bone names we understand, most specific first. Covers Mixamo, VRM, and the
 * generic `Head` / `RightArm` naming that Tripo, Meshy and Blender's Rigify
 * export — enough that a model from any of those rigs animates without
 * anyone hand-editing this file.
 */
const BONES = {
  hips: [/^(mixamorig)?hips$/, /^j?_?bip_?c_?hips$/, /hips?$/, /pelvis/],
  chest: [/^(mixamorig)?spine2$/, /upperchest/, /^(mixamorig)?chest$/, /chest/, /spine1?$/],
  head: [/^(mixamorig)?head$/, /^j?_?bip_?c_?head$/, /head$/],
  shoulderR: [/^(mixamorig)?rightarm$/, /^j?_?bip_?r_?upperarm$/, /right(upper)?arm$/, /upperarm_?r$/, /arm_?r$/],
  elbowR: [/^(mixamorig)?rightforearm$/, /^j?_?bip_?r_?lowerarm$/, /right(fore|lower)arm$/, /(fore|lower)arm_?r$/],
  shoulderL: [/^(mixamorig)?leftarm$/, /^j?_?bip_?l_?upperarm$/, /left(upper)?arm$/, /upperarm_?l$/, /arm_?l$/],
  elbowL: [/^(mixamorig)?leftforearm$/, /^j?_?bip_?l_?lowerarm$/, /left(fore|lower)arm$/, /(fore|lower)arm_?l$/],
  eyeR: [/righteye$/, /eye_?r$/],
  eyeL: [/lefteye$/, /eye_?l$/],
  ponytailR: [/right.*(ponytail|pigtail|hair)/, /(ponytail|pigtail|hair).*_?r$/, /hair.*right/],
  ponytailL: [/left.*(ponytail|pigtail|hair)/, /(ponytail|pigtail|hair).*_?l$/, /hair.*left/],
} satisfies Record<string, RegExp[]>;

/** Morph target names for each facial channel, most specific first. */
const MORPHS = {
  blink: [/^eyeblink(left|right)?$/, /^blink/, /eyesclosed/, /fcl_?eye_?close/, /vrcblink/],
  mouthOpen: [/^jawopen$/, /^mouthopen$/, /visemeaa$/, /^fcl_?mth_?a$/, /^aa$/],
  smile: [/^mouthsmile(left|right)?$/, /^smile$/, /fcl_?mth_?joy/, /happy/],
  brow: [/^brow(inner|outer)up/, /^browup/, /fcl_?brw_?(joy|surprised)/],
} satisfies Record<string, RegExp[]>;

/** Every mesh + index pair driving one facial channel. */
type MorphTargets = { mesh: THREE.Mesh; index: number }[];

function collectMorphs(root: THREE.Object3D, patterns: RegExp[]): MorphTargets {
  const found: MorphTargets = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const dict = mesh.morphTargetDictionary;
    if (!dict || !mesh.morphTargetInfluences) return;
    for (const pattern of patterns) {
      for (const [name, index] of Object.entries(dict)) {
        if (pattern.test(norm(name))) found.push({ mesh, index });
      }
      if (found.length) return; // first matching pattern wins for this mesh
    }
  });
  return found;
}

function setMorphs(targets: MorphTargets, value: number) {
  for (const { mesh, index } of targets) {
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
  }
}

/** Clip name patterns per animation state. */
const CLIPS: Record<LilyAnimationState, RegExp[]> = {
  idle: [/idle/, /breath/, /^rest/],
  greeting: [/greet/, /wave/, /hello/, /hi$/],
  speaking: [/speak/, /talk/, /^say/],
  listening: [/listen/, /^nod/, /attent/],
  selected: [/select/, /confirm/, /^happy/, /cheer/],
};

/**
 * Renders a real Lily glTF/GLB and exposes the same `LilyRig` the procedural
 * figure does, so one performer drives either body.
 *
 * Three levels of fidelity, chosen automatically:
 *  1. The GLB ships animation clips  -> an AnimationMixer crossfades them and
 *     the performer leaves the skeleton alone (nothing fights over bones).
 *  2. The GLB is rigged but has no clips -> its bones are matched by name and
 *     the performer animates them procedurally, exactly as it does the
 *     stand-in figure.
 *  3. Neither -> the model still renders, breathes and bobs at the root.
 * Facial morph targets are used whenever they exist, at any level.
 */
export function LilyGltf({ url, ref }: { url: string; ref?: Ref<LilyBodyHandle> }) {
  const gltf = useGLTF(url);
  const rootRef = useRef<THREE.Group>(null);

  // Clone so two Lilys on one page never share (and fight over) a skeleton.
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);

  /**
   * Normalise whatever the modelling tool exported: centre it on X/Z, stand
   * it on y = 0, and scale it to Lily's canonical height. Without this the
   * camera framing would depend on the exporter's unit choice.
   */
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 1e-4 ? LILY_HEIGHT / size.y : 1;
    return {
      scale,
      position: [
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale,
      ] as [number, number, number],
    };
  }, [scene]);

  const parts = useMemo(() => {
    const bones = Object.fromEntries(
      Object.entries(BONES).map(([key, patterns]) => [key, findNode(scene, patterns)]),
    ) as Record<keyof typeof BONES, THREE.Object3D | null>;
    const morphs = Object.fromEntries(
      Object.entries(MORPHS).map(([key, patterns]) => [key, collectMorphs(scene, patterns)]),
    ) as Record<keyof typeof MORPHS, MorphTargets>;
    return { bones, morphs };
  }, [scene]);

  // Map each state to a clip, if the file has one.
  const mixer = useMemo(
    () => (gltf.animations.length ? new THREE.AnimationMixer(scene) : null),
    [gltf.animations.length, scene],
  );

  const actions = useMemo(() => {
    if (!mixer) return null;
    const byState = {} as Partial<Record<LilyAnimationState, THREE.AnimationAction>>;
    for (const [state, patterns] of Object.entries(CLIPS) as [
      LilyAnimationState,
      RegExp[],
    ][]) {
      const clip = patterns
        .map((p) => gltf.animations.find((a) => p.test(norm(a.name))))
        .find(Boolean);
      if (clip) byState[state] = mixer.clipAction(clip);
    }
    // Greeting and the selection burst are one-shots; the rest loop.
    byState.greeting?.setLoop(THREE.LoopOnce, 1);
    byState.selected?.setLoop(THREE.LoopOnce, 1);
    if (byState.greeting) byState.greeting.clampWhenFinished = true;
    if (byState.selected) byState.selected.clampWhenFinished = true;
    return Object.keys(byState).length ? byState : null;
  }, [mixer, gltf.animations]);

  /** True when a clip writes morph influences — then we must not also write them. */
  const clipsDriveFace = useMemo(
    () =>
      gltf.animations.some((clip) =>
        clip.tracks.some((track) => track.name.includes("morphTargetInfluences")),
      ),
    [gltf.animations],
  );

  const current = useRef<LilyAnimationState | null>(null);

  useEffect(() => {
    if (!actions) return;
    const start = actions.idle ?? Object.values(actions)[0];
    start?.reset().fadeIn(FADE_SECONDS).play();
    current.current = "idle";
    return () => {
      mixer?.stopAllAction();
    };
  }, [actions, mixer]);

  useFrame((_, delta) => mixer?.update(delta));

  useImperativeHandle(
    ref,
    (): LilyBodyHandle => {
      const { bones, morphs } = parts;
      const rig: LilyRig = {
        root: rootRef.current!,
        chest: bones.chest ?? bones.hips ?? rootRef.current!,
        // Never scale a skinned chest bone — it would stretch the whole mesh.
        breath: null,
        head: bones.head ?? rootRef.current!,
        ponytailR: bones.ponytailR,
        ponytailL: bones.ponytailL,
        shoulderR: bones.shoulderR,
        elbowR: bones.elbowR,
        shoulderL: bones.shoulderL,
        elbowL: bones.elbowL,

        setBlink: (v) => setMorphs(morphs.blink, v),
        setMouthOpen: (v) => setMorphs(morphs.mouthOpen, v),
        setSmile: (v) => setMorphs(morphs.smile, v),
        setBrowRaise: (v) => setMorphs(morphs.brow, v),
        setEyeLook: (x, y) => {
          for (const eye of [bones.eyeR, bones.eyeL]) {
            if (!eye) continue;
            eye.rotation.y = x * 0.3;
            eye.rotation.x = -y * 0.24;
          }
        },
      };

      return {
        rig,
        usesBakedClips: actions !== null,
        bakedClipsDriveFace: clipsDriveFace,
        playState(state) {
          if (!actions || state === current.current) return;
          const next = actions[state] ?? actions.idle;
          if (!next) return;
          const prev = current.current ? actions[current.current] : undefined;
          prev?.fadeOut(FADE_SECONDS);
          next.reset().fadeIn(FADE_SECONDS).play();
          current.current = state;
        },
      };
    },
    [parts, actions, clipsDriveFace],
  );

  return (
    <group ref={rootRef}>
      <primitive object={scene} scale={fit.scale} position={fit.position} />
    </group>
  );
}
