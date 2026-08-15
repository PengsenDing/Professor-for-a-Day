"use client";

import {
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  Billboard,
  Html,
  Line,
  OrbitControls,
  useCursor,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Trophy } from "lucide-react";
import type { Concept, Curriculum } from "@/lib/types";
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

type Vec3 = [number, number, number];

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

/** Soft radial halo texture used as a shadow-like glow behind each sphere. */
function useHaloTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(20, 20, 20, 0.55)");
    g.addColorStop(0.55, "rgba(20, 20, 20, 0.18)");
    g.addColorStop(1, "rgba(20, 20, 20, 0)");
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
function useTitleTexture(title: string): THREE.CanvasTexture {
  return useMemo(() => {
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
    ctx.fillStyle = "#1c1917";
    const lineHeight = fontSize * 1.16;
    const firstY = size / 2 - ((lines.length - 1) / 2) * lineHeight;
    lines.forEach((line, i) => {
      ctx.fillText(line, size / 2, firstY + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [title]);
}

function ConceptNode({
  concept,
  position,
  best,
  selected,
  dragging,
  meshRef,
  occluders,
  haloTexture,
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
  meshRef: RefObject<THREE.Mesh | null>;
  occluders: RefObject<THREE.Object3D>[];
  haloTexture: THREE.Texture;
  onSelectNode: (id: string) => void;
  onHoverNode: (id: string | null) => void;
  onDragStart: (id: string) => void;
  onDrag: (id: string, next: Vec3) => void;
  onDragEnd: () => void;
}) {
  const accomplished = best === 100;
  const developing = best > 0 && best < 100;
  const titleTexture = useTitleTexture(concept.title);

  const [hovered, setHovered] = useState(false);
  useCursor(hovered || dragging, dragging ? "grabbing" : "pointer");

  const groupRef = useRef<THREE.Group>(null);
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const hitPoint = useRef(new THREE.Vector3());

  // Smooth hover/drag scaling without re-rendering the tree.
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const target = dragging ? 1.14 : hovered ? 1.1 : selected ? 1.05 : 1;
    group.scale.lerp(SCALE_TARGET.set(target, target, target), 0.18);
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
        {/* Soft halo: reads as ambient shadow, brightens into a glow on hover.
            raycast is disabled on every decorative layer so only the sphere
            itself receives pointer events. */}
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

        <mesh
          ref={meshRef}
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
            color={accomplished ? "#cdeadb" : "#f5f5f4"}
            roughness={0.34}
            clearcoat={1}
            clearcoatRoughness={0.22}
            emissive={accomplished ? "#2f6f4f" : "#555555"}
            emissiveIntensity={hovered || dragging ? 0.14 : selected ? 0.08 : 0}
          />
        </mesh>

        {/* The concept title lives on the ball itself: a camera-facing plane
            hugging the front of the sphere, textured with the wrapped title
            so it scales — and stays contained — at any zoom. */}
        <Billboard>
          <mesh
            position={[0, 0, NODE_RADIUS + 0.06]}
            renderOrder={1}
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

        {/* Selection: a crisp camera-facing ring, echoing the 2D design. */}
        {selected && (
          <Billboard>
            <mesh renderOrder={2} raycast={() => null}>
              <ringGeometry
                args={[NODE_RADIUS * 1.24, NODE_RADIUS * 1.36, 64]}
              />
              <meshBasicMaterial
                color="#171717"
                transparent
                opacity={0.92}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </Billboard>
        )}
      </group>

      {/* Status line: constant-size HTML anchored just below the ball. */}
      <Html
        center
        position={[0, -(NODE_RADIUS + 0.42), 0]}
        occlude={occluders}
        style={{ pointerEvents: "none", transition: "opacity 0.2s" }}
      >
        <div className="w-24 text-center select-none">
          <div
            className={cn(
              "flex items-center justify-center gap-0.5 text-[8px] tabular-nums",
              accomplished
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : developing
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
          >
            {accomplished ? (
              <>
                <Trophy className="size-2" /> Accomplished
              </>
            ) : developing ? (
              `Best ${best}%`
            ) : (
              "Not attempted"
            )}
          </div>
        </div>
      </Html>
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
}: {
  edges: Curriculum["edges"];
  positions: Record<string, Vec3>;
  activeId: string | null;
}) {
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
            color={active ? "#404040" : "#8f8f8f"}
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
 * glossy spheres placed by a deterministic force layout — collision-separated
 * in space *and* in the initial camera projection, so nothing overlaps on
 * load — with undirected relationship edges and the browser-local best
 * Mastery per node.
 *
 * Interactions: orbit (drag background), pan (right-drag / two fingers),
 * zoom (wheel / pinch), drag a sphere to move it in 3D (neighbors yield,
 * edges follow, nothing snaps back), click a sphere to select the concept.
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
  // Re-seed the live positions if the curriculum (and thus the layout) changes.
  const [seededLayout, setSeededLayout] = useState(layout);
  if (layout !== seededLayout) {
    setSeededLayout(layout);
    setPositions(Object.fromEntries(layout.positions));
  }

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const meshRefs = useMemo(
    () => new Map(ordered.map((c) => [c.id, createRef<THREE.Mesh | null>()])),
    [ordered],
  );
  const occludersFor = useMemo(() => {
    const map = new Map<string, RefObject<THREE.Object3D>[]>();
    for (const c of ordered) {
      map.set(
        c.id,
        // drei's occlude type wants non-null refs but tolerates empty ones
        // at runtime; these refs fill in on first render.
        ordered
          .filter((o) => o.id !== c.id)
          .map((o) => meshRefs.get(o.id)!) as RefObject<THREE.Object3D>[],
      );
    }
    return map;
  }, [ordered, meshRefs]);

  const haloTexture = useHaloTexture();

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
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, []);

  const endDrag = useCallback(() => {
    setDraggingId(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, []);

  /**
   * Move the dragged sphere and let the web react: every other sphere
   * follows a fraction of the drag — direct prerequisites/dependents
   * noticeably more than the rest — so the network feels connected instead
   * of rigid. Any sphere the dragged one presses into is still pushed out to
   * the minimum separation, so overlaps never appear. Dropped spheres stay
   * put.
   */
  const NEIGHBOR_FOLLOW = 0.26; // connected spheres: follow strongly
  const OTHERS_FOLLOW = 0.07; // the rest of the web: subtle sympathy motion
  const moveNode = useCallback(
    (id: string, next: Vec3) => {
      setPositions((prev) => {
        const from = prev[id];
        const dx = from ? next[0] - from[0] : 0;
        const dy = from ? next[1] - from[1] : 0;
        const dz = from ? next[2] - from[2] : 0;
        const neighbors = adjacency.get(id);
        const map: Record<string, Vec3> = {};
        for (const [nid, p] of Object.entries(prev)) {
          if (nid === id) continue;
          const w = neighbors?.has(nid) ? NEIGHBOR_FOLLOW : OTHERS_FOLLOW;
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
            }
          }
        }
        return map;
      });
    },
    [adjacency],
  );

  return (
    <div
      className={cn(
        "relative h-[62dvh] min-h-96 w-full overflow-hidden lg:h-auto",
        className,
      )}
    >
      {/* The canvas is absolutely positioned so WebGL sizes from this
          element's resolved box instead of a percentage of an indefinite
          flex height (which collapses the canvas to its intrinsic size). */}
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
        />
        {ordered.map((concept) => (
          <ConceptNode
            key={concept.id}
            concept={concept}
            position={positions[concept.id] ?? [0, 0, 0]}
            best={mastery[concept.id] ?? 0}
            selected={selectedId === concept.id}
            dragging={draggingId === concept.id}
            meshRef={meshRefs.get(concept.id)!}
            occluders={occludersFor.get(concept.id)!}
            haloTexture={haloTexture}
            onSelectNode={onSelect}
            onHoverNode={setHoveredId}
            onDragStart={beginDrag}
            onDrag={moveNode}
            onDragEnd={endDrag}
          />
        ))}
      </Canvas>

      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border bg-background/85 px-3 py-1 text-[11px] whitespace-nowrap text-muted-foreground shadow-sm backdrop-blur">
        Drag spheres to arrange · drag the background to rotate · scroll to zoom
      </div>

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
  );
}
