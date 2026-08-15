"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import * as THREE from "three";
import { MathUtils } from "three";
import {
  buildLilyAssets,
  jacketRadiusAt,
  CHEST_Y,
  EYE_MOUNT_R,
  EYE_X,
  EYE_Y,
  HEAD_LOCAL_Y,
  HEAD_R,
  type LilyAssets,
} from "./lily-assets";
import type { LilyBodyHandle, LilyRig } from "./types";

const { lerp } = MathUtils;

/**
 * Lily as real three.js geometry.
 *
 * This is a hand-modelled stand-in, not a rendered image: every part is a
 * mesh in 3D space, the joints are a real transform hierarchy, and the
 * performer animates it exactly as it would animate a skinned GLB. It exists
 * so the interaction system is complete and testable before `lily.glb`
 * arrives from the image-to-3D step (see README.md) — the moment that file
 * is present, `LilyBody` renders the GLB instead and this file is unused.
 *
 * Her identity is pinned by `palette.ts` and by the proportions here: ~2.9
 * heads tall, round face, oversized blue eyes, red-orange hair with two side
 * ponytails, freckles, yellow jacket over a purple shirt, red skirt, white
 * socks, purple shoes.
 */

// --- Eyelid sweep angles -----------------------------------------------
// A lid is a hemisphere shell around its group's +Y axis; rotating the group
// about X sweeps which side of the eyeball it covers.
//
// Writing the eyeball surface as an angle `t` from straight ahead (+ = up),
// the upper lid covers everything above `-a` and the lower lid everything
// below `-b`. So the open pair leaves the middle ~130 degrees of the eye
// clear — Lily's eyes are her signature and must read as wide open — and the
// closed pair overlaps slightly past centre so a blink fully meets.
const LID_UPPER_OPEN = -1.15;
const LID_UPPER_CLOSED = 0.2;
const LID_LOWER_OPEN = 1.15;
const LID_LOWER_CLOSED = -0.2;

/** Freckles across the nose and both cheeks, in head-local face coords. */
const FRECKLES: [number, number][] = [
  [-0.06, -0.055],
  [0.06, -0.055],
  [0.0, -0.02],
  [-0.035, -0.105],
  [0.035, -0.105],
  [-0.225, -0.045],
  [-0.285, -0.09],
  [-0.335, -0.05],
  [-0.26, -0.15],
  [-0.325, -0.135],
  [0.225, -0.045],
  [0.285, -0.09],
  [0.335, -0.05],
  [0.26, -0.15],
  [0.325, -0.135],
];

/**
 * Fringe blobs hanging from the hairline over the forehead, swept slightly
 * to her left. They sit *below* the cap's hairline so the fringe overhangs
 * rather than butting against it in a hard line.
 */
const BANGS: { x: number; y: number; rz: number; s: [number, number, number] }[] = [
  { x: -0.34, y: 0.255, rz: 0.55, s: [1.0, 0.95, 0.42] },
  { x: -0.175, y: 0.325, rz: 0.32, s: [1.2, 1.05, 0.42] },
  { x: 0.02, y: 0.35, rz: 0.05, s: [1.25, 1.05, 0.42] },
  { x: 0.2, y: 0.325, rz: -0.32, s: [1.2, 1.0, 0.42] },
  { x: 0.35, y: 0.25, rz: -0.6, s: [1.0, 0.9, 0.42] },
];

/**
 * Mounts children on the head sphere at (x, y), oriented so local +Z points
 * straight out of the face. Two nested groups keep the rotation order
 * unambiguous: yaw on the outside, pitch on the inside.
 */
function FaceMount({
  x,
  y,
  radius = HEAD_R + 0.004,
  children,
}: {
  x: number;
  y: number;
  radius?: number;
  children: React.ReactNode;
}) {
  const z = Math.sqrt(Math.max(radius * radius - x * x - y * y, 1e-6));
  const yaw = Math.atan2(x, z);
  const pitch = -Math.atan2(y, Math.hypot(x, z));
  return (
    <group position={[x, y, z]} rotation-y={yaw}>
      <group rotation-x={pitch}>{children}</group>
    </group>
  );
}

function Eye({
  side,
  assets,
  look,
  upper,
  lower,
}: {
  side: 1 | -1;
  assets: LilyAssets;
  look: Ref<THREE.Group>;
  upper: Ref<THREE.Group>;
  lower: Ref<THREE.Group>;
}) {
  const { geo, mat } = assets;
  return (
    <FaceMount x={EYE_X * side} y={EYE_Y} radius={EYE_MOUNT_R}>
      <mesh geometry={geo.eyeball} material={mat.eyeWhite} />

      {/* Iris, pupil and glint ride the eyeball as curved caps, so they stay
          glued to its surface when the eyes track the user. */}
      <group ref={look}>
        <mesh geometry={geo.iris} material={mat.iris} rotation-x={Math.PI / 2} />
        <mesh geometry={geo.pupil} material={mat.pupil} rotation-x={Math.PI / 2} />
        <group rotation-y={-0.34 * side} rotation-x={-0.3}>
          <mesh geometry={geo.glint} material={mat.glint} rotation-x={Math.PI / 2} />
        </group>
      </group>

      {/* Upper lid carries the lash line, so the lashes fall with the blink. */}
      <group ref={upper} rotation-x={LID_UPPER_OPEN}>
        <mesh geometry={geo.lidUpper} material={mat.skin} />
        <mesh geometry={geo.lash} material={mat.lash} rotation-x={Math.PI / 2} />
      </group>
      <group ref={lower} rotation-x={LID_LOWER_OPEN}>
        <mesh geometry={geo.lidLower} material={mat.skin} rotation-x={Math.PI} />
      </group>
    </FaceMount>
  );
}

function Ponytail({
  side,
  assets,
  joint,
}: {
  side: 1 | -1;
  assets: LilyAssets;
  joint: Ref<THREE.Group>;
}) {
  const { geo, mat } = assets;
  return (
    // Set forward of the head's mid-plane so both tails stay in silhouette
    // from a straight-on view — they are half of what makes her Lily.
    <group position={[0.44 * side, 0.06, -0.06]}>
      <mesh geometry={geo.tie} material={mat.hairTie} rotation-z={Math.PI / 2} />
      {/* The performer swings this group; everything below it is the tail. */}
      <group ref={joint}>
        <mesh
          geometry={geo.tail1}
          material={mat.hair}
          position={[0.23 * side, -0.06, -0.03]}
          scale={[1.1, 1, 0.95]}
        />
        <mesh
          geometry={geo.tail2}
          material={mat.hair}
          position={[0.36 * side, -0.26, -0.05]}
        />
        <mesh
          geometry={geo.tail3}
          material={mat.hair}
          position={[0.42 * side, -0.44, -0.06]}
        />
        <mesh
          geometry={geo.tail4}
          material={mat.hairLight}
          position={[0.45 * side, -0.56, -0.06]}
        />
      </group>
    </group>
  );
}

function Arm({
  side,
  assets,
  shoulder,
  elbow,
}: {
  side: 1 | -1;
  assets: LilyAssets;
  shoulder: Ref<THREE.Group>;
  elbow: Ref<THREE.Group>;
}) {
  const { geo, mat } = assets;
  return (
    <group position={[0.375 * side, 0.245, 0]}>
      <group ref={shoulder} rotation-z={0.24 * side}>
        <mesh geometry={geo.upperArm} material={mat.jacket} position={[0, -0.185, 0]} />
        <group ref={elbow} position={[0, -0.37, 0]}>
          <mesh geometry={geo.foreArm} material={mat.jacket} position={[0, -0.155, 0]} />
          <mesh geometry={geo.cuff} material={mat.shirt} position={[0, -0.285, 0]} />
          <mesh geometry={geo.hand} material={mat.skin} position={[0, -0.36, 0]} />
        </group>
      </group>
    </group>
  );
}

function Leg({ side, assets }: { side: 1 | -1; assets: LilyAssets }) {
  const { geo, mat } = assets;
  return (
    <group position={[0.19 * side, 0, 0]}>
      <mesh geometry={geo.leg} material={mat.skin} position={[0, 0.68, 0]} />
      <mesh geometry={geo.sock} material={mat.sock} position={[0, 0.355, 0]} />
      <mesh geometry={geo.sockStripe} material={mat.sockStripe} position={[0, 0.47, 0]} />
      <mesh geometry={geo.sockStripe} material={mat.sockStripe} position={[0, 0.515, 0]} />
      <mesh
        geometry={geo.shoe}
        material={mat.shoe}
        position={[0, 0.1, 0.045]}
        scale={[0.85, 0.62, 1.2]}
      />
      <mesh
        geometry={geo.sole}
        material={mat.shoeShade}
        position={[0, 0.045, 0.045]}
        scale={[0.86, 0.26, 1.2]}
      />
    </group>
  );
}

/** The zipper, laid onto the jacket's curved surface rather than guessed. */
function Zipper({ assets }: { assets: LilyAssets }) {
  const { geo, mat } = assets;
  const teeth = useMemo(() => {
    const out: { y: number; z: number }[] = [];
    for (let y = -0.28; y <= 0.26; y += 0.09) {
      out.push({ y, z: jacketRadiusAt(y) + 0.006 });
    }
    return out;
  }, []);
  return (
    <group>
      {teeth.map((t, i) => (
        <mesh
          key={i}
          geometry={geo.zipTooth}
          material={mat.jacketShade}
          position={[0, t.y, t.z]}
        />
      ))}
      <mesh
        geometry={geo.zipPull}
        material={mat.metal}
        position={[0, -0.32, jacketRadiusAt(-0.32) + 0.012]}
      />
    </group>
  );
}

export function LilyFigure({ ref }: { ref?: Ref<LilyBodyHandle> }) {
  const assets = useMemo(() => buildLilyAssets(), []);
  useEffect(() => () => assets.dispose(), [assets]);

  const rootRef = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Group>(null);
  const breathRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailR = useRef<THREE.Group>(null);
  const tailL = useRef<THREE.Group>(null);
  const shoulderR = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const shoulderL = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);

  // Six explicit eye refs rather than two ref objects: writing into a ref
  // passed down as a prop is exactly what the immutability rule forbids.
  const lookR = useRef<THREE.Group>(null);
  const lookL = useRef<THREE.Group>(null);
  const lidUpR = useRef<THREE.Group>(null);
  const lidUpL = useRef<THREE.Group>(null);
  const lidLoR = useRef<THREE.Group>(null);
  const lidLoL = useRef<THREE.Group>(null);
  const browR = useRef<THREE.Group>(null);
  const browL = useRef<THREE.Group>(null);
  const smileRef = useRef<THREE.Group>(null);
  const mouthRef = useRef<THREE.Mesh>(null);

  const { geo, mat } = assets;

  useImperativeHandle(
    ref,
    (): LilyBodyHandle => {
      const rig: LilyRig = {
        root: rootRef.current!,
        chest: chestRef.current!,
        breath: breathRef.current,
        head: headRef.current!,
        ponytailR: tailR.current,
        ponytailL: tailL.current,
        shoulderR: shoulderR.current,
        elbowR: elbowR.current,
        shoulderL: shoulderL.current,
        elbowL: elbowL.current,

        setBlink(v) {
          const upper = lerp(LID_UPPER_OPEN, LID_UPPER_CLOSED, v);
          const lower = lerp(LID_LOWER_OPEN, LID_LOWER_CLOSED, v);
          if (lidUpR.current) lidUpR.current.rotation.x = upper;
          if (lidUpL.current) lidUpL.current.rotation.x = upper;
          if (lidLoR.current) lidLoR.current.rotation.x = lower;
          if (lidLoL.current) lidLoL.current.rotation.x = lower;
        },
        setMouthOpen(v) {
          const m = mouthRef.current;
          if (!m) return;
          m.scale.set(0.9 + v * 0.06, Math.max(v, 0.02), 0.5);
          // The jaw drops rather than the mouth growing symmetrically.
          m.position.y = -v * 0.045;
        },
        setSmile(v) {
          const s = smileRef.current;
          if (!s) return;
          s.scale.set(0.88 + v * 0.26, 0.8 + v * 0.45, 1);
        },
        setBrowRaise(v) {
          if (browR.current) browR.current.position.y = v * 0.035;
          if (browL.current) browL.current.position.y = v * 0.035;
        },
        setEyeLook(x, y) {
          for (const look of [lookR.current, lookL.current]) {
            if (!look) continue;
            look.rotation.y = x * 0.32;
            look.rotation.x = -y * 0.26;
          }
        },
      };
      return { rig, usesBakedClips: false, bakedClipsDriveFace: false };
    },
    [],
  );

  return (
    <group ref={rootRef}>
      <Leg side={-1} assets={assets} />
      <Leg side={1} assets={assets} />
      <mesh geometry={geo.skirt} material={mat.skirt} position={[0, 0.95, 0]} />

      <group ref={chestRef} position={[0, CHEST_Y, 0]}>
        {/* Only the torso shell breathes — scaling this group would squash
            the head and arms with it, which is why they are siblings. */}
        <group ref={breathRef}>
          <mesh geometry={geo.jacket} material={mat.jacket} />
          <mesh
            geometry={geo.hood}
            material={mat.jacketShade}
            position={[0, 0.3, -0.2]}
            rotation-x={2.5}
            scale={[1.15, 0.85, 0.9]}
          />
          <Zipper assets={assets} />
          <mesh
            geometry={geo.chestV}
            material={mat.shirt}
            position={[0, 0.29, 0.29]}
            scale={[1.0, 0.8, 0.45]}
          />
          <mesh geometry={geo.collar} material={mat.shirt} position={[0, 0.4, 0]} />

          {/* Drawstrings and the two grey pom-poms on her chest. */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh
                geometry={geo.drawstring}
                material={mat.drawstring}
                position={[0.11 * s, 0.19, jacketRadiusAt(0.19) + 0.02]}
                rotation-x={-0.32}
              />
              <mesh
                geometry={geo.pompom}
                material={mat.pompom}
                position={[0.125 * s, 0.03, jacketRadiusAt(0.03) + 0.06]}
              />
            </group>
          ))}
        </group>

        <Arm side={-1} assets={assets} shoulder={shoulderR} elbow={elbowR} />
        <Arm side={1} assets={assets} shoulder={shoulderL} elbow={elbowL} />

        <mesh geometry={geo.neck} material={mat.shirt} position={[0, 0.5, 0]} />

        <group ref={headRef} position={[0, HEAD_LOCAL_Y, 0]}>
          <mesh geometry={geo.head} material={mat.skin} />
          <mesh
            geometry={geo.ear}
            material={mat.skin}
            position={[-0.5, -0.02, 0]}
            scale={[0.55, 1, 0.72]}
          />
          <mesh
            geometry={geo.ear}
            material={mat.skin}
            position={[0.5, -0.02, 0]}
            scale={[0.55, 1, 0.72]}
          />

          <Eye side={-1} assets={assets} look={lookR} upper={lidUpR} lower={lidLoR} />
          <Eye side={1} assets={assets} look={lookL} upper={lidUpL} lower={lidLoL} />

          {[-1, 1].map((s) => (
            <FaceMount key={s} x={0.2 * s} y={0.255}>
              <group ref={s === -1 ? browR : browL}>
                <mesh
                  geometry={geo.brow}
                  material={mat.brow}
                  rotation-z={Math.PI * 0.225 + 0.12 * s}
                  scale={[1, 0.8, 1]}
                />
              </group>
            </FaceMount>
          ))}

          <FaceMount x={0} y={-0.055}>
            <mesh geometry={geo.nose} material={mat.skinShade} scale={[1.1, 0.9, 0.8]} />
          </FaceMount>

          {[-1, 1].map((s) => (
            <FaceMount key={s} x={0.3 * s} y={-0.11}>
              <mesh geometry={geo.cheek} material={mat.cheek} scale={[1, 0.72, 0.22]} />
            </FaceMount>
          ))}

          {FRECKLES.map(([x, y], i) => (
            <FaceMount key={i} x={x} y={y}>
              <mesh geometry={geo.freckle} material={mat.freckle} scale={[1, 1, 0.5]} />
            </FaceMount>
          ))}

          <FaceMount x={0} y={-0.235}>
            <mesh
              ref={mouthRef}
              geometry={geo.mouthInner}
              material={mat.mouthInner}
              position={[0, 0, 0.005]}
              scale={[0.9, 0.02, 0.5]}
            />
            <group ref={smileRef}>
              <mesh
                geometry={geo.smile}
                material={mat.mouth}
                position={[0, 0.105, 0]}
                rotation-z={-Math.PI * 0.9}
              />
            </group>
          </FaceMount>

          {/* Hair: a swept cap for the hairline, a fuller mass behind it, a
              fringe of overlapping blobs, and the two side ponytails. */}
          <mesh geometry={geo.hairCap} material={mat.hair} rotation-x={-0.38} />
          {/* Sized so it swallows the back and both sides of the head while
              clearing the face: at the ears it is just outside the skull, at
              the forehead comfortably behind it. */}
          <mesh
            geometry={geo.hairBack}
            material={mat.hair}
            position={[0, 0.02, -0.15]}
            scale={[1.2, 1.12, 1.0]}
          />
          {BANGS.map((b, i) => (
            <FaceMount key={i} x={b.x} y={b.y} radius={HEAD_R + 0.035}>
              <mesh geometry={geo.bang} material={mat.hair} rotation-z={b.rz} scale={b.s} />
            </FaceMount>
          ))}
          <FaceMount x={0.12} y={0.45} radius={HEAD_R + 0.03}>
            <mesh
              geometry={geo.spike}
              material={mat.hair}
              rotation-z={-0.85}
              rotation-x={0.3}
              scale={[0.9, 1, 0.6]}
            />
          </FaceMount>

          <Ponytail side={-1} assets={assets} joint={tailR} />
          <Ponytail side={1} assets={assets} joint={tailL} />
        </group>
      </group>
    </group>
  );
}
