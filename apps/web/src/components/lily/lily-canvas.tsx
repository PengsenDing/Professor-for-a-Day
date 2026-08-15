"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { NoToneMapping } from "three";
import { LILY_HEIGHT } from "./lily-assets";
import { LilyFigure } from "./lily-figure";
import { LilyGltf } from "./lily-gltf";
import { ModelErrorBoundary } from "./model-error-boundary";
import { useLilyPerformer } from "./use-lily-performer";
import type { LilyAnimationState, LilyBodyHandle } from "./types";

export interface LilyCanvasProps {
  /** Resolved GLB url, or undefined to go straight to the stand-in figure. */
  modelUrl?: string;
  state: LilyAnimationState;
  greetProgress: () => number;
  selectProgress: () => number;
  reducedMotion: boolean;
  /** False pauses the render loop entirely (offscreen or hidden tab). */
  active: boolean;
  onModelError?: (error: Error) => void;
}

/**
 * Camera framing.
 *
 * Both bodies are authored standing on y = 0, so the group below lifts the
 * figure's mid-point onto the origin and the camera stays on the world axis.
 * Framing this way rather than raising the camera keeps it independent of
 * whether anything re-aims the default camera at the origin.
 *
 * The distance is set so the whole figure — crown to shoes — clears the
 * edges of a *circular* container, where the usable height shrinks away from
 * the centre line.
 */
const FIGURE_CENTER_Y = LILY_HEIGHT / 2;
const CAMERA = { position: [0, 0, 6.6] as [number, number, number], fov: 28 };

/**
 * Soft three-point lighting with a warm bounce. No environment map: an HDR
 * would mean an external fetch, and the artifact CSP-style constraint aside,
 * the point is a fast first paint on a normal laptop.
 */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#cfe6ff", "#ffd9c0", 0.5]} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.25} />
      <directionalLight position={[-3.5, 1.5, 3]} intensity={0.45} color="#dbe9ff" />
      <directionalLight position={[-1.5, 2.5, -4]} intensity={0.7} color="#ffe9d5" />
    </>
  );
}

function Body({
  modelUrl,
  bodyRef,
  onModelError,
}: {
  modelUrl?: string;
  bodyRef: React.RefObject<LilyBodyHandle | null>;
  onModelError?: (error: Error) => void;
}) {
  if (!modelUrl) return <LilyFigure ref={bodyRef} />;
  return (
    <ModelErrorBoundary fallback={<LilyFigure ref={bodyRef} />} onError={onModelError}>
      <Suspense fallback={null}>
        <LilyGltf url={modelUrl} ref={bodyRef} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function Scene(props: LilyCanvasProps) {
  const bodyRef = useRef<LilyBodyHandle | null>(null);
  const { state } = props;

  useLilyPerformer(bodyRef, {
    state,
    greetProgress: props.greetProgress,
    selectProgress: props.selectProgress,
    reducedMotion: props.reducedMotion,
    active: props.active,
  });

  // Bodies with baked clips drive themselves; hand them the state instead.
  useEffect(() => {
    bodyRef.current?.playState?.(state);
  }, [state]);

  return (
    <>
      <Lights />
      <group position-y={-FIGURE_CENTER_Y}>
        <Body
          modelUrl={props.modelUrl}
          bodyRef={bodyRef}
          onModelError={props.onModelError}
        />
      </group>
    </>
  );
}

export default function LilyCanvas(props: LilyCanvasProps) {
  // Only mount WebGL once we know the browser can give us a context; a
  // failure here must degrade to the poster fallback, never to a blank hole.
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (failed) return null;

  return (
    <Canvas
      // `flat` (NoToneMapping) keeps Lily's authored palette exact — ACES
      // filmic would desaturate the yellow jacket and the red-orange hair.
      flat
      className="absolute inset-0"
      dpr={[1, 2]}
      // "demand", not "never": an offscreen Lily should freeze on her last
      // pose, not blank out. "never" also means the very first frame is never
      // drawn, so a Lily that mounts offscreen would come back empty.
      frameloop={props.active ? "always" : "demand"}
      camera={CAMERA}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
      }}
      onError={() => {
        if (mounted.current) setFailed(true);
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
