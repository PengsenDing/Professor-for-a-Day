"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { Billboard, Line, OrbitControls, useCursor } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Concept, Curriculum } from "@/lib/types";
import { useIsDark } from "@/lib/use-is-dark";
import { cn } from "@/lib/utils";

/** Sphere radius in world units — everything else is sized relative to it. */
const NODE_RADIUS = 1.3;
/** Hard minimum distance between sphere centers in 3D space. */
const MIN_SEPARATION = NODE_RADIUS * 2 + 1.7;
/**
 * Minimum distance between sphere centers as seen from the initial camera:
 * separation in the plane perpendicular to VIEW_DIRECTION. This is what
 * guarantees the first render has no visually overlapping spheres or labels,
 * even for nodes at different depths. Elliptical — labels are wide and
 * shallow, so horizontal clearance must exceed vertical clearance.
 */
const PROJECTED_SEP_X = 5.0;
const PROJECTED_SEP_Y = 3.8;
const SIM_ITERATIONS = 320;

/** The initial camera direction — a gentle three-quarter view. */
const VIEW_DIRECTION = new THREE.Vector3(0.32, 0.38, 1).normalize();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Screen-space basis of the initial view (screen right / screen up). */
const VIEW_RIGHT = new THREE.Vector3()
  .crossVectors(WORLD_UP, VIEW_DIRECTION)
  .normalize();
const VIEW_UP = new THREE.Vector3().crossVectors(VIEW_DIRECTION, VIEW_RIGHT);

/**
 * Screen fraction reserved around the network when fitting the camera, so
 * the constant-size HTML labels of edge nodes stay inside the viewport.
 */
const FIT_MARGIN_X = 0.11;
const FIT_MARGIN_Y = 0.15;

/** World size of the square title plane hugging the front of each sphere. */
const TITLE_PLANE = NODE_RADIUS * 1.78;
/** Pixel resolution of each title texture (square). */
const TITLE_TEXTURE_SIZE = 256;

/**
 * Teaching status lives *inside* the ball: the glass sphere holds water
 * whose volume equals the concept's best score. A full ball (100%) turns
 * the water green and adds a glowing halo.
 */
const WATER_RADIUS = NODE_RADIUS * 0.9;
const WATER_FULL_COLOR = "#34d399";
const WATER_FULL_EMISSIVE = "#10b981";
/** Ripple height while the ball rests — the water is never fully still. */
const WATER_IDLE_AMP = 0.035;
/** Ripple height ceiling while the ball is being shoved around. */
const WATER_MAX_AMP = 0.13;

/**
 * The liquid: a full inner sphere whose fragments above a rippling,
 * tilting water plane are discarded. The visible backfaces through the
 * clipped opening read as the water surface, so waves come from uniforms
 * alone — no per-frame geometry work.
 */
const WATER_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vPos = position;
    vNormal = normalMatrix * normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uAmp;
  uniform vec2 uTilt;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  float waveField(vec2 p) {
    return sin(p.x * 5.1 + uTime * 2.3) * 0.55
         + sin(p.y * 4.3 - uTime * 1.7) * 0.30
         + sin((p.x + p.y) * 7.0 + uTime * 3.1) * 0.15;
  }

  void main() {
    float surface = uLevel + waveField(vPos.xz) * uAmp + dot(vPos.xz, uTilt);
    float below = surface - vPos.y;
    if (below < 0.0) discard;

    // Clean-pool look: nearly clear at the surface, deepening into a fresh
    // aqua toward the bottom (water absorbs red with depth). The gradient
    // is normalized by this ball's own fill depth, so even a shallow
    // puddle reaches full tint at its bottom and every level reads clearly.
    float depthN = clamp(below / max(uLevel + ${WATER_RADIUS.toFixed(4)}, 0.15), 0.0, 1.0);
    vec3 clearTint = vec3(0.90, 0.95, 0.97);
    vec3 deepTint = vec3(0.49, 0.80, 0.84);
    vec3 tint = mix(clearTint, deepTint, depthN);
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vViewPos);

    if (gl_FrontFacing) {
      float fres = pow(1.0 - abs(dot(n, v)), 2.0);
      float line = smoothstep(0.11, 0.0, below);
      vec3 l = normalize(vec3(0.45, 0.8, 0.55));
      float spec = pow(max(dot(reflect(-l, n), v), 0.0), 48.0);
      float alpha = 0.16 + 0.5 * depthN + 0.32 * fres + 0.3 * line + 0.5 * spec;
      vec3 color = tint + line * 0.24 + spec * 0.7;
      gl_FragColor = vec4(color, min(alpha, 0.92));
    } else {
      // The inside of the sphere seen through the clipped opening — this
      // is what reads as the moving water surface.
      float wob = waveField(vPos.xz * 1.4) * 0.5 + 0.5;
      vec3 surf = vec3(0.78, 0.91, 0.93);
      gl_FragColor = vec4(surf * (0.98 + wob * 0.09), 0.45 + wob * 0.13);
    }
  }
`;

/**
 * Height of the spherical cap (measured from the bottom of the sphere)
 * that holds `fraction` of the sphere's volume. Solves
 * t²(3−t)/4 = fraction on the unit sphere via Newton's method, so the
 * *volume* of water matches the score, not just the height.
 */
function waterCapHeight(fraction: number, radius: number): number {
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 2 * radius;
  let t = 2 * fraction; // t ∈ [0, 2] on the unit sphere
  for (let i = 0; i < 12; i++) {
    const f = (t * t * (3 - t)) / 4 - fraction;
    const df = (6 * t - 3 * t * t) / 4;
    t = Math.min(2, Math.max(0, t - f / Math.max(0.05, df)));
  }
  return t * radius;
}

/**
 * Ball-bump physics (the snooker feel): a sphere pushed by the dragged one
 * picks up velocity along the contact normal, glides, can knock into further
 * spheres, and eases to rest under felt-like damping. Nothing springs back.
 */
const BUMP_KICK = 30; // velocity gained per world unit of drag-induced overlap
const BUMP_DAMPING = 2.8; // exponential slow-down, like felt friction
const BUMP_RESTITUTION = 0.55; // energy kept in ball-on-ball collisions
const BUMP_MAX_SPEED = 14; // world units/second
const BUMP_STOP_SPEED = 0.08; // below this a ball is considered at rest
const THROW_SCALE = 0.35; // fraction of pointer velocity kept on release
const THROW_MAX_SPEED = 9;

type Vec3 = [number, number, number];

const VEC3_ZERO: Vec3 = [0, 0, 0];

/** Add a velocity kick to one ball, clamping the result to BUMP_MAX_SPEED. */
function addKick(
  vel: Record<string, Vec3>,
  id: string,
  kx: number,
  ky: number,
  kz: number,
) {
  const v = vel[id] ?? VEC3_ZERO;
  const x = v[0] + kx;
  const y = v[1] + ky;
  const z = v[2] + kz;
  const len = Math.hypot(x, y, z);
  const k = len > BUMP_MAX_SPEED ? BUMP_MAX_SPEED / len : 1;
  vel[id] = [x * k, y * k, z * k];
}

/** Drives the ball-bump physics from the render loop. */
function PhysicsTicker({ step }: { step: (dt: number) => void }) {
  useFrame((_, dt) => step(dt));
  return null;
}

/**
 * Group concepts into prerequisite layers (top = no prerequisites), ordering
 * each layer by the average position of its parents to reduce edge crossings.
 * Used as the deterministic starting arrangement for the 3D force layout.
 */
function computeLayers(curriculum: Curriculum): Concept[][] {
  const parents = new Map<string, string[]>();
  for (const c of curriculum.concepts) parents.set(c.id, []);
  for (const e of curriculum.edges) parents.get(e.to)?.push(e.from);

  // Depth = longest prerequisite chain (edges are acyclic per the contract).
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    depths.set(id, 0); // cycle guard
    const ps = parents.get(id) ?? [];
    const depth = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(depthOf));
    depths.set(id, depth);
    return depth;
  };
  curriculum.concepts.forEach((c) => depthOf(c.id));

  const maxDepth = Math.max(...depths.values());
  const layers: Concept[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const c of curriculum.concepts) layers[depths.get(c.id)!].push(c);

  const position = new Map<string, number>();
  layers.forEach((layer, depth) => {
    layer.sort((a, b) => {
      const avg = (c: Concept) => {
        const ps = (parents.get(c.id) ?? [])
          .map((p) => position.get(p))
          .filter((x): x is number => x !== undefined);
        return ps.length ? ps.reduce((s, x) => s + x, 0) / ps.length : 0.5;
      };
      return avg(a) - avg(b);
    });
    const width = Math.max(1, layer.length - 1);
    layer.forEach((c, i) => position.set(c.id, depth === 0 ? 0.5 : i / width));
  });

  return layers;
}

/**
 * Deterministic 3D force-directed layout.
 *
 * Seed: nodes are placed on a golden-angle spherical shell in prerequisite
 * order, so foundational concepts start near the top and the arrangement is
 * genuinely volumetric from the first frame (no randomness).
 *
 * Relax: pairwise repulsion spreads the cloud, prerequisite edges act as
 * springs pulling related concepts together, and a vertical bias keeps
 * dependents below their prerequisites so the recommended order still reads
 * top-to-bottom.
 *
 * Guarantees: a hard 3D collision pass enforces MIN_SEPARATION between
 * sphere centers, then a screen-projected pass pushes nodes apart in the
 * plane perpendicular to the initial camera direction until no two nodes
 * (or their labels) can visually overlap on load. The projected pass only
 * ever increases 3D distances, so it cannot reintroduce collisions.
 */
function simulateLayout3D(curriculum: Curriculum): {
  positions: Map<string, Vec3>;
  points: Vec3[];
  radius: number;
} {
  const ordered = computeLayers(curriculum).flat();
  const n = ordered.length;
  const pos = new Map<string, { x: number; y: number; z: number }>();

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const SHELL_RADIUS = 5.4;
  ordered.forEach((c, k) => {
    const y = n === 1 ? 0 : 1 - (2 * (k + 0.5)) / n;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = k * GOLDEN_ANGLE;
    pos.set(c.id, {
      x: Math.cos(angle) * ring * SHELL_RADIUS,
      y: y * SHELL_RADIUS,
      // Slightly flattened in depth: the network stays clearly 3D but the
      // initial view suffers less depth-occlusion.
      z: Math.sin(angle) * ring * SHELL_RADIUS * 0.7,
    });
  });

  const ids = ordered.map((c) => c.id);
  const edges = curriculum.edges;

  for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
    const cooling = 1 - iter / SIM_ITERATIONS;
    const force = new Map(ids.map((id) => [id, { x: 0, y: 0, z: 0 }]));

    // Pairwise repulsion.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const distSq = Math.max(0.36, dx * dx + dy * dy + dz * dz);
        const dist = Math.sqrt(distSq);
        const push = 12 / distSq;
        const fa = force.get(ids[i])!;
        const fb = force.get(ids[j])!;
        fa.x += (dx / dist) * push;
        fa.y += (dy / dist) * push;
        fa.z += (dz / dist) * push;
        fb.x -= (dx / dist) * push;
        fb.y -= (dy / dist) * push;
        fb.z -= (dz / dist) * push;
      }
    }

    // Edge springs (rest length keeps connected spheres comfortably apart).
    for (const e of edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
      const pull = (dist - 4.2) * 0.03;
      const fa = force.get(e.from)!;
      const fb = force.get(e.to)!;
      fa.x += (dx / dist) * pull;
      fa.y += (dy / dist) * pull;
      fa.z += (dz / dist) * pull;
      fb.x -= (dx / dist) * pull;
      fb.y -= (dy / dist) * pull;
      fb.z -= (dz / dist) * pull;

      // Downstream bias: keep the dependent below its prerequisite.
      if (a.y - b.y < 1.2) {
        fa.y += 0.02;
        fb.y -= 0.02;
      }
    }

    // Weak centering so the net doesn't drift away from the origin.
    for (const id of ids) {
      const p = pos.get(id)!;
      const f = force.get(id)!;
      f.x -= p.x * 0.004;
      f.y -= p.y * 0.004;
      f.z -= p.z * 0.008; // keep the net a bit flatter in depth
    }

    for (const id of ids) {
      const p = pos.get(id)!;
      const f = force.get(id)!;
      const step = 0.9 * cooling + 0.05;
      p.x += f.x * step;
      p.y += f.y * step;
      p.z += f.z * step;
    }
  }

  const list = ids.map((id) => ({ id, ...pos.get(id)! }));

  // View-space normalization: long prerequisite chains relax into a tall
  // portrait cloud, which forces the fitted camera far away and shrinks
  // every sphere. Reshape the cloud to a landscape aspect (screens are
  // wider than tall) while preserving relative order; the separation
  // passes below restore local clearance afterwards.
  {
    const TARGET_HALF_WIDTH = 11.5;
    const TARGET_HALF_HEIGHT = 6.6;
    const mx = list.reduce((s, p) => s + p.x, 0) / list.length;
    const my = list.reduce((s, p) => s + p.y, 0) / list.length;
    const mz = list.reduce((s, p) => s + p.z, 0) / list.length;
    const rel = new THREE.Vector3();
    const frames = list.map((p) => {
      rel.set(p.x - mx, p.y - my, p.z - mz);
      return {
        u: rel.dot(VIEW_RIGHT),
        v: rel.dot(VIEW_UP),
        w: rel.dot(VIEW_DIRECTION),
      };
    });
    const maxU = Math.max(0.001, ...frames.map((f) => Math.abs(f.u)));
    const maxV = Math.max(0.001, ...frames.map((f) => Math.abs(f.v)));
    const su = TARGET_HALF_WIDTH / maxU;
    const sv = TARGET_HALF_HEIGHT / maxV;
    list.forEach((p, i) => {
      const f = frames[i];
      const u = f.u * su;
      const vv = f.v * sv;
      p.x = mx + VIEW_RIGHT.x * u + VIEW_UP.x * vv + VIEW_DIRECTION.x * f.w;
      p.y = my + VIEW_RIGHT.y * u + VIEW_UP.y * vv + VIEW_DIRECTION.y * f.w;
      p.z = mz + VIEW_RIGHT.z * u + VIEW_UP.z * vv + VIEW_DIRECTION.z * f.w;
    });
  }

  // Hard 3D separation: no two spheres may collide in space.
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
        if (dist >= MIN_SEPARATION) continue;
        moved = true;
        const push = (MIN_SEPARATION - dist) / 2;
        a.x -= (dx / dist) * push;
        a.y -= (dy / dist) * push;
        a.z -= (dz / dist) * push;
        b.x += (dx / dist) * push;
        b.y += (dy / dist) * push;
        b.z += (dz / dist) * push;
      }
    }
    if (!moved) break;
  }

  // Screen-projected separation: as seen from the initial camera, every pair
  // of nodes must sit outside an ellipse (PROJECTED_SEP_X × PROJECTED_SEP_Y)
  // around each other. Pushing happens in the plane perpendicular to the
  // view, which only increases 3D distances, so the collision pass above
  // stays valid.
  const v = new THREE.Vector3();
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        v.set(b.x - a.x, b.y - a.y, b.z - a.z);
        // Normalized (elliptical) screen-space offset.
        let du = v.dot(VIEW_RIGHT) / PROJECTED_SEP_X;
        let dv = v.dot(VIEW_UP) / PROJECTED_SEP_Y;
        let pd = Math.hypot(du, dv);
        if (pd >= 1) continue;
        moved = true;
        if (pd < 0.001) {
          // Exactly stacked in view: split deterministically along screen-x.
          du = 0.01;
          dv = 0;
          pd = 0.01;
        }
        const push = (1 - pd) / 2;
        // Back to world units, per axis.
        const su = (du / pd) * push * PROJECTED_SEP_X;
        const sv = (dv / pd) * push * PROJECTED_SEP_Y;
        const ux = VIEW_RIGHT.x * su + VIEW_UP.x * sv;
        const uy = VIEW_RIGHT.y * su + VIEW_UP.y * sv;
        const uz = VIEW_RIGHT.z * su + VIEW_UP.z * sv;
        a.x -= ux;
        a.y -= uy;
        a.z -= uz;
        b.x += ux;
        b.y += uy;
        b.z += uz;
      }
    }
    if (!moved) break;
  }

  // Center on the centroid; keep the point cloud for camera fitting and the
  // bounding radius for orbit-control zoom limits.
  const cx = list.reduce((s, p) => s + p.x, 0) / list.length;
  const cy = list.reduce((s, p) => s + p.y, 0) / list.length;
  const cz = list.reduce((s, p) => s + p.z, 0) / list.length;
  let radius = 0;
  const positions = new Map<string, Vec3>();
  const points: Vec3[] = [];
  for (const p of list) {
    const vec: Vec3 = [p.x - cx, p.y - cy, p.z - cz];
    positions.set(p.id, vec);
    points.push(vec);
    radius = Math.max(radius, Math.hypot(vec[0], vec[1], vec[2]));
  }
  return { positions, points, radius: radius + NODE_RADIUS + 1.4 };
}

/**
 * Place the camera along VIEW_DIRECTION at the closest distance from which
 * every node (plus label padding) fits the frustum on both axes — a true
 * box fit, so the network fills wide and tall viewports alike. Re-fits on
 * resize.
 */
function FitCamera({ points, radius }: { points: Vec3[]; radius: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * (size.width / Math.max(1, size.height));
    // Reserving a fraction of the screen for labels is equivalent to
    // shrinking the usable frustum tangent by that fraction.
    const useH = tanH * (1 - FIT_MARGIN_X);
    const useV = tanV * (1 - FIT_MARGIN_Y);
    let dist = radius * 1.35; // never closer than a sane minimum
    const p = new THREE.Vector3();
    for (const [x, y, z] of points) {
      p.set(x, y, z);
      const along = p.dot(VIEW_DIRECTION);
      dist = Math.max(
        dist,
        along + (Math.abs(p.dot(VIEW_RIGHT)) + NODE_RADIUS) / useH,
        along + (Math.abs(p.dot(VIEW_UP)) + NODE_RADIUS) / useV,
      );
    }
    camera.position.copy(VIEW_DIRECTION).multiplyScalar(dist);
    // eslint-disable-next-line react-hooks/immutability -- three.js cameras are configured by imperative mutation
    camera.near = Math.max(0.1, dist / 100);
    camera.far = dist * 20;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls?.update();
  }, [camera, size.width, size.height, points, radius, controls]);

  return null;
}

/**
 * The scene's "ink" — everything drawn against the page background: node
 * halos, the selection ring, in-ball titles, and edges. The canvas itself is
 * transparent, so these must flip with the page theme (dark ink on the light
 * page, light ink on the dark one) or they vanish.
 */
const INK = {
  light: {
    halo: "20, 20, 20",
    ring: "23, 23, 23",
    title: "#1c1917",
    edgeActive: "#404040",
    edgeIdle: "#8f8f8f",
  },
  dark: {
    halo: "226, 232, 240",
    ring: "235, 235, 235",
    title: "#f5f5f4",
    edgeActive: "#d4d4d4",
    edgeIdle: "#8f8f8f",
  },
} as const;

const inkFor = (dark: boolean) => (dark ? INK.dark : INK.light);

/** Frees the previous texture's GPU memory when a redraw replaces it. */
function useDisposeTexture(texture: THREE.CanvasTexture) {
  useEffect(() => () => texture.dispose(), [texture]);
}

/**
 * Soft radial halo texture behind each sphere: reads as an ambient shadow
 * on the light page and as a soft backlight on the dark one.
 */
function useHaloTexture(dark: boolean) {
  const texture = useMemo(() => {
    const ink = inkFor(dark).halo;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${ink}, 0.55)`);
    g.addColorStop(0.55, `rgba(${ink}, 0.18)`);
    g.addColorStop(1, `rgba(${ink}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, [dark]);
  useDisposeTexture(texture);
  return texture;
}

/**
 * Selection ring texture: a thin crisp circle with a faint soft halo, far
 * lighter than solid ring geometry. Drawn once, shared by every node.
 */
function useRingTexture(dark: boolean) {
  const texture = useMemo(() => {
    const ink = inkFor(dark).ring;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const ring = (width: number, alpha: number, blur: number) => {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 100, 0, Math.PI * 2);
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(${ink}, ${alpha})`;
      ctx.shadowColor = `rgba(${ink}, ${alpha})`;
      ctx.shadowBlur = blur;
      ctx.stroke();
    };
    ring(10, 0.16, 18); // soft halo pass
    ring(3, 0.85, 5); // crisp core
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [dark]);
  useDisposeTexture(texture);
  return texture;
}

/**
 * The ring texture sits at radius 100/128 of its plane's half-size; this
 * plane size lands the ring at ≈1.24 × NODE_RADIUS around the ball.
 */
const RING_PLANE = NODE_RADIUS * 3.2;

/** Bright radial texture, tinted per-sprite for the mastered-ball glow. */
function useGlowTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    g.addColorStop(0.35, "rgba(255, 255, 255, 0.32)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
}

const SCALE_TARGET = new THREE.Vector3();

/**
 * Render a concept title into a small canvas texture: wrapped, centered, and
 * shrunk-to-fit so it always sits inside the sphere's silhouette. Drawn once
 * per title — unlike SDF text this needs no worker or extra WebGL context,
 * and the billboarded plane it maps onto scales with the ball on zoom.
 */
function useTitleTexture(title: string, dark: boolean): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const size = TITLE_TEXTURE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const maxWidth = size * 0.88;
    const maxHeight = size * 0.72;
    const fontFor = (px: number) =>
      `600 ${px}px ui-sans-serif, system-ui, -apple-system, sans-serif`;

    // Break on spaces, and after "/" so compound titles can wrap there.
    const tokens: { text: string; glue: string }[] = [];
    for (const word of title.split(/\s+/)) {
      word.split(/(?<=\/)/).forEach((part, i) => {
        tokens.push({ text: part, glue: i === 0 ? " " : "" });
      });
    }

    const wrap = (px: number): string[] => {
      ctx.font = fontFor(px);
      const lines: string[] = [];
      let current = "";
      for (const t of tokens) {
        const joined = current ? current + t.glue + t.text : t.text;
        if (!current || ctx.measureText(joined).width <= maxWidth) {
          current = joined;
        } else {
          lines.push(current);
          current = t.text;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    let fontSize = 46;
    let lines = wrap(fontSize);
    while (fontSize > 16) {
      lines = wrap(fontSize);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (widest <= maxWidth && lines.length * fontSize * 1.16 <= maxHeight) {
        break;
      }
      fontSize -= 2;
    }

    ctx.clearRect(0, 0, size, size);
    ctx.font = fontFor(fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = inkFor(dark).title;
    const lineHeight = fontSize * 1.16;
    const firstY = size / 2 - ((lines.length - 1) / 2) * lineHeight;
    lines.forEach((line, i) => {
      ctx.fillText(line, size / 2, firstY + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [title, dark]);
  useDisposeTexture(texture);
  return texture;
}

function ConceptNode({
  concept,
  position,
  best,
  selected,
  dragging,
  dark,
  haloTexture,
  glowTexture,
  ringTexture,
  onSelectNode,
  onHoverNode,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  concept: Concept;
  position: Vec3;
  best: number;
  selected: boolean;
  dragging: boolean;
  dark: boolean;
  haloTexture: THREE.Texture;
  glowTexture: THREE.Texture;
  ringTexture: THREE.Texture;
  onSelectNode: (id: string) => void;
  onHoverNode: (id: string | null) => void;
  onDragStart: (id: string) => void;
  onDrag: (id: string, next: Vec3) => void;
  onDragEnd: () => void;
}) {
  const accomplished = best >= 100;
  const titleTexture = useTitleTexture(concept.title, dark);

  // Water level (local y) holding `best`% of the sphere's volume.
  const water = useMemo(() => {
    if (best <= 0 || best >= 100) return null;
    return { level: -WATER_RADIUS + waterCapHeight(best / 100, WATER_RADIUS) };
  }, [best]);

  const waterMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uLevel: { value: -WATER_RADIUS },
          uAmp: { value: WATER_IDLE_AMP },
          uTilt: { value: new THREE.Vector2(0, 0) },
        },
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
      }),
    [],
  );
  useEffect(() => () => waterMaterial.dispose(), [waterMaterial]);

  const [hovered, setHovered] = useState(false);
  useCursor(hovered || dragging, dragging ? "grabbing" : "pointer");

  const groupRef = useRef<THREE.Group>(null);
  const selectionRef = useRef<THREE.Mesh>(null);
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const hitPoint = useRef(new THREE.Vector3());

  // Water slosh state: the surface tilt chases the ball's velocity through
  // an underdamped spring, so a moving ball piles water against its
  // trailing side and a stopped ball keeps sloshing briefly before it
  // settles back to the idle ripple.
  const lastPosRef = useRef<Vec3 | null>(null);
  const tiltRef = useRef(new THREE.Vector2());
  const tiltVelRef = useRef(new THREE.Vector2());
  const ampRef = useRef(WATER_IDLE_AMP);

  // Smooth hover/drag scaling and water dynamics without re-rendering.
  // eslint-disable-next-line react-hooks/immutability -- three.js materials are driven by imperative uniform mutation from the render loop
  useFrame((state, rawDt) => {
    const group = groupRef.current;
    if (group) {
      const target = dragging ? 1.14 : hovered ? 1.1 : selected ? 1.05 : 1;
      group.scale.lerp(SCALE_TARGET.set(target, target, target), 0.18);
    }
    // The selection ring breathes: a slow, subtle pulse of size + presence.
    const sel = selectionRef.current;
    if (sel) {
      const wave = Math.sin(state.clock.elapsedTime * 2.2);
      sel.scale.setScalar(1 + wave * 0.035);
      (sel.material as THREE.MeshBasicMaterial).opacity = 0.78 + wave * 0.18;
    }
    if (!water) return;

    const dt = Math.min(Math.max(rawDt, 1e-4), 0.05);
    const last = lastPosRef.current ?? position;
    const vx = (position[0] - last[0]) / dt;
    const vy = (position[1] - last[1]) / dt;
    const vz = (position[2] - last[2]) / dt;
    lastPosRef.current = position;

    const tilt = tiltRef.current;
    const tiltVel = tiltVelRef.current;
    const targetX = THREE.MathUtils.clamp(-vx * 0.05, -0.3, 0.3);
    const targetZ = THREE.MathUtils.clamp(-vz * 0.05, -0.3, 0.3);
    tiltVel.x += (targetX - tilt.x) * 34 * dt;
    tiltVel.y += (targetZ - tilt.y) * 34 * dt;
    tiltVel.multiplyScalar(Math.exp(-3.4 * dt));
    tilt.x += tiltVel.x * dt;
    tilt.y += tiltVel.y * dt;

    // Agitation: spring motion and vertical shakes raise the ripple height.
    const agitation =
      Math.hypot(tiltVel.x, tiltVel.y) * 0.28 +
      Math.abs(vy) * 0.004 +
      Math.hypot(vx, vz) * 0.002;
    const targetAmp = Math.min(WATER_MAX_AMP, WATER_IDLE_AMP + agitation);
    ampRef.current += (targetAmp - ampRef.current) * Math.min(1, 6 * dt);

    const u = waterMaterial.uniforms;
    // eslint-disable-next-line react-hooks/immutability -- uniform values are mutated imperatively each frame, the three.js idiom
    u.uTime.value = state.clock.elapsedTime;
    u.uLevel.value = water.level;
    u.uAmp.value = ampRef.current;
    (u.uTilt.value as THREE.Vector2).set(tilt.x, tilt.y);
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0 && e.nativeEvent.pointerType === "mouse")
      return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    // Drag on a camera-facing plane through the sphere: the node follows the
    // pointer exactly, in genuine 3D coordinates.
    const normal = new THREE.Vector3();
    e.camera.getWorldDirection(normal);
    const center = new THREE.Vector3(...position);
    dragPlane.current.setFromNormalAndCoplanarPoint(normal, center);
    if (e.ray.intersectPlane(dragPlane.current, hitPoint.current)) {
      dragOffset.current.copy(hitPoint.current).sub(center);
    } else {
      dragOffset.current.set(0, 0, 0);
    }
    onDragStart(concept.id);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    if (e.ray.intersectPlane(dragPlane.current, hitPoint.current)) {
      const next = hitPoint.current.clone().sub(dragOffset.current);
      onDrag(concept.id, [next.x, next.y, next.z]);
    }
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    onDragEnd();
  };

  return (
    <group position={position}>
      <group ref={groupRef}>
        {/* Soft halo behind the ball. Unmastered balls cast an ambient
            shadow; a fully mastered ball replaces it with a green light
            glow (normal blending — additive washes out and darkens against
            the page-composited transparent canvas). raycast is disabled on
            every decorative layer so only the sphere itself receives
            pointer events. */}
        {accomplished ? (
          <sprite
            scale={[NODE_RADIUS * 4.4, NODE_RADIUS * 4.4, 1]}
            raycast={() => null}
          >
            <spriteMaterial
              map={glowTexture}
              color={WATER_FULL_COLOR}
              transparent
              opacity={hovered || dragging || selected ? 0.95 : 0.8}
              depthWrite={false}
            />
          </sprite>
        ) : (
          <sprite
            scale={[NODE_RADIUS * 3.4, NODE_RADIUS * 3.4, 1]}
            raycast={() => null}
          >
            <spriteMaterial
              map={haloTexture}
              transparent
              depthWrite={false}
              opacity={hovered || dragging || selected ? 0.5 : 0.26}
            />
          </sprite>
        )}

        {/* The water inside the glass: its volume equals the best score.
            The clipped-sphere shader ripples with time and tilts against
            the ball's motion (see the slosh spring in useFrame above). */}
        {water && (
          <mesh renderOrder={1} raycast={() => null} material={waterMaterial}>
            <sphereGeometry args={[WATER_RADIUS, 48, 48]} />
          </mesh>
        )}
        {accomplished && (
          <mesh renderOrder={1} raycast={() => null}>
            <sphereGeometry args={[WATER_RADIUS, 48, 48]} />
            <meshPhysicalMaterial
              color={WATER_FULL_COLOR}
              transparent
              opacity={0.9}
              roughness={0.22}
              clearcoat={0.6}
              emissive={WATER_FULL_EMISSIVE}
              emissiveIntensity={0.45}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* The glass shell: transparent, so the water level reads at a
            glance. This is the only pointer-interactive surface. */}
        <mesh
          renderOrder={2}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            onHoverNode(concept.id);
          }}
          onPointerOut={() => {
            setHovered(false);
            onHoverNode(null);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onLostPointerCapture={() => dragging && onDragEnd()}
          onClick={(e) => {
            e.stopPropagation();
            // A drag is not a selection: ignore clicks that moved the pointer.
            if (e.delta < 6) onSelectNode(concept.id);
          }}
        >
          <sphereGeometry args={[NODE_RADIUS, 48, 48]} />
          <meshPhysicalMaterial
            color="#f8fafc"
            transparent
            opacity={hovered || dragging ? 0.34 : selected ? 0.3 : 0.24}
            roughness={0.12}
            clearcoat={1}
            clearcoatRoughness={0.15}
            emissive="#555555"
            emissiveIntensity={hovered || dragging ? 0.14 : selected ? 0.08 : 0}
            depthWrite={false}
          />
        </mesh>

        {/* The concept title lives on the ball itself: a camera-facing plane
            hugging the front of the sphere, textured with the wrapped title
            so it scales — and stays contained — at any zoom. */}
        <Billboard>
          <mesh
            position={[0, 0, NODE_RADIUS + 0.06]}
            renderOrder={3}
            raycast={() => null}
          >
            <planeGeometry args={[TITLE_PLANE, TITLE_PLANE]} />
            <meshBasicMaterial
              map={titleTexture}
              transparent
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </Billboard>

        {/* Selection: a thin, soft-edged ring that gently breathes (scale
            and opacity pulse in useFrame) — a highlight, not a border. */}
        {selected && (
          <Billboard>
            <mesh ref={selectionRef} renderOrder={4} raycast={() => null}>
              <planeGeometry args={[RING_PLANE, RING_PLANE]} />
              <meshBasicMaterial
                map={ringTexture}
                transparent
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </Billboard>
        )}
      </group>
    </group>
  );
}

/**
 * Relationship edges: undirected lines that stay attached to their spheres.
 * Edges touching the hovered or dragged node brighten so the neighborhood
 * reads at a glance.
 */
function Edges3D({
  edges,
  positions,
  activeId,
  dark,
}: {
  edges: Curriculum["edges"];
  positions: Record<string, Vec3>;
  activeId: string | null;
  dark: boolean;
}) {
  const ink = inkFor(dark);
  const items = useMemo(() => {
    return edges.flatMap((e) => {
      const a = positions[e.from];
      const b = positions[e.to];
      if (!a || !b) return [];
      const from = new THREE.Vector3(...a);
      const to = new THREE.Vector3(...b);
      const dir = to.clone().sub(from);
      const dist = dir.length();
      if (dist < NODE_RADIUS * 2 + 0.2) return [];
      dir.normalize();
      const start = from.clone().addScaledVector(dir, NODE_RADIUS + 0.04);
      const end = to.clone().addScaledVector(dir, -(NODE_RADIUS + 0.04));
      return [{ id: `${e.from}->${e.to}`, from: e.from, to: e.to, start, end }];
    });
  }, [edges, positions]);

  return (
    <>
      {items.map((it) => {
        const active =
          activeId !== null && (it.from === activeId || it.to === activeId);
        return (
          <Line
            key={it.id}
            points={[it.start, it.end]}
            color={active ? ink.edgeActive : ink.edgeIdle}
            transparent
            opacity={active ? 0.9 : 0.45}
            lineWidth={active ? 2 : 1.4}
          />
        );
      })}
    </>
  );
}

/**
 * The Knowledge Graph home view as a real 3D network: all 15 Concepts as
 * transparent glass spheres placed by a deterministic force layout —
 * collision-separated in space *and* in the initial camera projection, so
 * nothing overlaps on load — with undirected relationship edges. The
 * browser-local best Mastery shows as water inside each sphere: the water's
 * volume equals the best score, and a full ball glows green.
 *
 * Interactions: orbit (drag background), pan (right-drag / two fingers),
 * zoom (wheel / pinch), drag a sphere to move it in 3D (bumped spheres pick
 * up momentum and glide apart like snooker balls, edges follow, nothing
 * snaps back), click a sphere to select the concept.
 */
export function KnowledgeGraph3D({
  curriculum,
  mastery,
  selectedId,
  onSelect,
  className,
}: {
  curriculum: Curriculum;
  mastery: Record<string, number>;
  selectedId: string | null;
  onSelect: (conceptId: string) => void;
  className?: string;
}) {
  const ordered = useMemo(() => computeLayers(curriculum).flat(), [curriculum]);
  const layout = useMemo(() => simulateLayout3D(curriculum), [curriculum]);

  const [positions, setPositions] = useState<Record<string, Vec3>>(() =>
    Object.fromEntries(layout.positions),
  );
  // Mutable mirror of the positions: the physics tick and the drag handler
  // both work on this map, then publish a snapshot into React state.
  const positionsRef = useRef<Record<string, Vec3>>(
    Object.fromEntries(layout.positions),
  );
  /** Per-ball velocity in world units/second; absent key = at rest. */
  const velocitiesRef = useRef<Record<string, Vec3>>({});
  const draggingRef = useRef<string | null>(null);
  /** Smoothed pointer velocity of the ball being dragged. */
  const dragVelRef = useRef<Vec3>([0, 0, 0]);
  const lastDragSampleRef = useRef<{ t: number; pos: Vec3 } | null>(null);

  // Re-seed the live positions if the curriculum (and thus the layout) changes.
  const [seededLayout, setSeededLayout] = useState(layout);
  if (layout !== seededLayout) {
    setSeededLayout(layout);
    setPositions(Object.fromEntries(layout.positions));
  }
  // Refs can't be reseeded during render; syncing them in an effect is fine —
  // physics only runs from events and frames, which happen after effects.
  useEffect(() => {
    positionsRef.current = Object.fromEntries(layout.positions);
    velocitiesRef.current = {};
  }, [layout]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const dark = useIsDark();
  const haloTexture = useHaloTexture(dark);
  const glowTexture = useGlowTexture();
  const ringTexture = useRingTexture(dark);

  // Undirected adjacency, used to let connected spheres follow a drag.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of curriculum.concepts) map.set(c.id, new Set());
    for (const e of curriculum.edges) {
      map.get(e.from)?.add(e.to);
      map.get(e.to)?.add(e.from);
    }
    return map;
  }, [curriculum]);

  const beginDrag = useCallback((id: string) => {
    setDraggingId(id);
    draggingRef.current = id;
    dragVelRef.current = [0, 0, 0];
    lastDragSampleRef.current = null;
    delete velocitiesRef.current[id];
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, []);

  const endDrag = useCallback(() => {
    const id = draggingRef.current;
    if (id) {
      // Release with a fraction of the pointer's momentum: a quick flick
      // lets the ball glide briefly (and knock into others) before resting.
      const dv = dragVelRef.current;
      let x = dv[0] * THROW_SCALE;
      let y = dv[1] * THROW_SCALE;
      let z = dv[2] * THROW_SCALE;
      const len = Math.hypot(x, y, z);
      if (len > THROW_MAX_SPEED) {
        const k = THROW_MAX_SPEED / len;
        x *= k;
        y *= k;
        z *= k;
      }
      if (len > BUMP_STOP_SPEED) velocitiesRef.current[id] = [x, y, z];
    }
    draggingRef.current = null;
    dragVelRef.current = [0, 0, 0];
    setDraggingId(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, []);

  /**
   * Move the dragged sphere and let the web react: every other sphere
   * follows a fraction of the drag — direct prerequisites/dependents
   * noticeably more than the rest — so the network feels connected instead
   * of rigid. Any sphere the dragged one presses into is pushed out to the
   * minimum separation AND picks up a momentum kick along the contact
   * normal, so it keeps gliding for a moment like a struck snooker ball
   * (the glide itself lives in stepPhysics). Dropped spheres stay put.
   */
  const NEIGHBOR_FOLLOW = 0.26; // connected spheres: follow strongly
  const OTHERS_FOLLOW = 0.07; // the rest of the web: subtle sympathy motion
  const moveNode = useCallback(
    (id: string, next: Vec3) => {
      const map = positionsRef.current;
      const vel = velocitiesRef.current;
      const from = map[id];

      // Smoothed pointer velocity, for collision transfer + release glide.
      const now = performance.now();
      const last = lastDragSampleRef.current;
      if (last && now - last.t > 2) {
        const dt = Math.min(0.1, (now - last.t) / 1000);
        const blend = 0.4;
        const dv = dragVelRef.current;
        dragVelRef.current = [
          dv[0] + ((next[0] - last.pos[0]) / dt - dv[0]) * blend,
          dv[1] + ((next[1] - last.pos[1]) / dt - dv[1]) * blend,
          dv[2] + ((next[2] - last.pos[2]) / dt - dv[2]) * blend,
        ];
      }
      lastDragSampleRef.current = { t: now, pos: next };

      const dx = from ? next[0] - from[0] : 0;
      const dy = from ? next[1] - from[1] : 0;
      const dz = from ? next[2] - from[2] : 0;
      const neighbors = adjacency.get(id);
      for (const nid of Object.keys(map)) {
        if (nid === id) continue;
        const w = neighbors?.has(nid) ? NEIGHBOR_FOLLOW : OTHERS_FOLLOW;
        const p = map[nid];
        map[nid] = [p[0] + dx * w, p[1] + dy * w, p[2] + dz * w];
      }
      map[id] = next;

      const ids = Object.keys(map);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = map[ids[i]];
            const b = map[ids[j]];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const dz = b[2] - a[2];
            const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
            if (dist >= MIN_SEPARATION) continue;
            const overlap = MIN_SEPARATION - dist;
            const aLocked = ids[i] === id;
            const bLocked = ids[j] === id;
            const aShare = aLocked ? 0 : bLocked ? 1 : 0.5;
            const ux = dx / dist;
            const uy = dy / dist;
            const uz = dz / dist;
            map[ids[i]] = [
              a[0] - ux * overlap * aShare,
              a[1] - uy * overlap * aShare,
              a[2] - uz * overlap * aShare,
            ];
            map[ids[j]] = [
              b[0] + ux * overlap * (1 - aShare),
              b[1] + uy * overlap * (1 - aShare),
              b[2] + uz * overlap * (1 - aShare),
            ];
            // Momentum kick: harder shoves create deeper per-event overlap,
            // so the bump speed naturally scales with the drag speed.
            if (pass === 0) {
              const kick = overlap * BUMP_KICK;
              if (!aLocked && aShare > 0) {
                const k = kick * aShare;
                addKick(vel, ids[i], -ux * k, -uy * k, -uz * k);
              }
              if (!bLocked && aShare < 1) {
                const k = kick * (1 - aShare);
                addKick(vel, ids[j], ux * k, uy * k, uz * k);
              }
            }
          }
        }
      }
      setPositions({ ...map });
    },
    [adjacency],
  );

  /**
   * Per-frame ball physics: integrate the velocities handed out by moveNode
   * (and by release throws), damp them like felt friction, and resolve
   * ball-on-ball collisions with restitution so a bumped ball can pass the
   * bump on. Idle when every ball is at rest — the common case.
   */
  const stepPhysics = useCallback((rawDt: number) => {
    const vel = velocitiesRef.current;
    const movingIds = Object.keys(vel);
    if (movingIds.length === 0) return;
    const dt = Math.min(rawDt, 0.05);
    const map = positionsRef.current;
    const held = draggingRef.current;
    const decay = Math.exp(-BUMP_DAMPING * dt);

    for (const mid of movingIds) {
      if (mid === held) {
        delete vel[mid]; // the held ball is pointer-driven, not ballistic
        continue;
      }
      const v = vel[mid];
      const p = map[mid];
      if (!p) {
        delete vel[mid];
        continue;
      }
      map[mid] = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      const nv: Vec3 = [v[0] * decay, v[1] * decay, v[2] * decay];
      if (Math.hypot(nv[0], nv[1], nv[2]) < BUMP_STOP_SPEED) delete vel[mid];
      else vel[mid] = nv;
    }

    // Collisions: push overlapping pairs apart (the held ball never yields)
    // and exchange the velocity component along the contact normal.
    const ids = Object.keys(map);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = map[ids[i]];
          const b = map[ids[j]];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const dz = b[2] - a[2];
          const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
          if (dist >= MIN_SEPARATION) continue;
          const overlap = MIN_SEPARATION - dist;
          const aHeld = ids[i] === held;
          const bHeld = ids[j] === held;
          const aShare = aHeld ? 0 : bHeld ? 1 : 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          const uz = dz / dist;
          map[ids[i]] = [
            a[0] - ux * overlap * aShare,
            a[1] - uy * overlap * aShare,
            a[2] - uz * overlap * aShare,
          ];
          map[ids[j]] = [
            b[0] + ux * overlap * (1 - aShare),
            b[1] + uy * overlap * (1 - aShare),
            b[2] + uz * overlap * (1 - aShare),
          ];
          if (pass === 0) {
            const va = aHeld ? dragVelRef.current : (vel[ids[i]] ?? VEC3_ZERO);
            const vb = bHeld ? dragVelRef.current : (vel[ids[j]] ?? VEC3_ZERO);
            // Approach speed along the a→b normal; separate only if closing.
            const s =
              (va[0] - vb[0]) * ux +
              (va[1] - vb[1]) * uy +
              (va[2] - vb[2]) * uz;
            if (s > 0) {
              const bounce = (1 + BUMP_RESTITUTION) * s;
              if (aHeld) {
                addKick(vel, ids[j], ux * bounce, uy * bounce, uz * bounce);
              } else if (bHeld) {
                addKick(vel, ids[i], -ux * bounce, -uy * bounce, -uz * bounce);
              } else {
                const h = bounce / 2;
                addKick(vel, ids[i], -ux * h, -uy * h, -uz * h);
                addKick(vel, ids[j], ux * h, uy * h, uz * h);
              }
            }
          }
        }
      }
    }
    setPositions({ ...map });
  }, []);

  return (
    <>
      {/* The scene is portaled to <body> and fixed to the full viewport, so
          WebGL can draw spheres all the way to the screen edges when the
          user zooms in — the in-flow box below only reserves layout space.
          (A portal, not position:fixed in place: the step container animates
          with transforms, which would re-anchor and clip a fixed child.) */}
      {createPortal(
        <div className="fixed inset-0 z-0">
          {/* A narrow FOV flattens perspective so near spheres don't balloon
              over their neighbors' screen-space clearance. */}
          <Canvas
            dpr={[1, 2]}
            camera={{ fov: 32, position: [0, 0, 24] }}
            style={{ position: "absolute", inset: 0 }}
          >
            <ambientLight intensity={0.9} />
            <directionalLight position={[6, 10, 8]} intensity={1.9} />
            <directionalLight position={[-8, -5, -6]} intensity={0.4} />
            <FitCamera points={layout.points} radius={layout.radius} />
            <PhysicsTicker step={stepPhysics} />
            <OrbitControls
              ref={controlsRef}
              makeDefault
              enableDamping
              dampingFactor={0.12}
              minDistance={layout.radius * 0.35}
              maxDistance={layout.radius * 5}
            />
            <Edges3D
              edges={curriculum.edges}
              positions={positions}
              activeId={draggingId ?? hoveredId}
              dark={dark}
            />
            {ordered.map((concept) => (
              <ConceptNode
                key={concept.id}
                concept={concept}
                position={positions[concept.id] ?? [0, 0, 0]}
                best={mastery[concept.id] ?? 0}
                selected={selectedId === concept.id}
                dragging={draggingId === concept.id}
                dark={dark}
                haloTexture={haloTexture}
                glowTexture={glowTexture}
                ringTexture={ringTexture}
                onSelectNode={onSelect}
                onHoverNode={setHoveredId}
                onDragStart={beginDrag}
                onDrag={moveNode}
                onDragEnd={endDrag}
              />
            ))}
          </Canvas>

          {/* Top of the viewport: the bottom is taken by the step nav pill
              and the "Pick a concept" copy. */}
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 text-[11px] whitespace-nowrap text-muted-foreground">
            Drag spheres to arrange · Drag the background to rotate · Scroll to
            zoom
          </div>
        </div>,
        document.body,
      )}

      {/* Layout spacer: keeps the page structure (and the copy beneath the
          graph) where it was before the canvas went full-viewport. */}
      <div className={cn("h-[62dvh] min-h-96 w-full lg:h-auto", className)}>
        {/* Keyboard fallback: the canvas is pointer-driven, so offer the same
            selection as screen-reader/keyboard-accessible buttons. */}
        <div className="sr-only">
          {ordered.map((c) => (
            <button key={c.id} type="button" onClick={() => onSelect(c.id)}>
              Teach {c.title}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
