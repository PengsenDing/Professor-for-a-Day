import * as THREE from "three";
import { LILY_PALETTE as P } from "./palette";

const TAU = Math.PI * 2;

/**
 * Lily's canonical height in scene units. The stand-in figure is authored to
 * it and any GLB is scaled to it, so the camera framing is the same either
 * way. Both bodies stand on y = 0.
 */
export const LILY_HEIGHT = 2.9;

/** Head radius. Every facial landmark is placed on this sphere. */
export const HEAD_R = 0.52;
/** Eyeball radius — deliberately large; the big eyes are Lily's signature. */
export const EYE_R = 0.152;
/** Distance from head centre to eyeball centre (controls the cartoon bulge). */
export const EYE_MOUNT_R = 0.4;
export const EYE_X = 0.205;
export const EYE_Y = 0.035;

/** Chest group height in world units; the head sits 1.02 above it. */
export const CHEST_Y = 1.34;
export const HEAD_LOCAL_Y = 1.02;

/**
 * The jacket silhouette as a lathe profile, in chest-local space:
 * `[radius, y]`, bottom hem first. Starting at radius 0 closes the hem so
 * the shell is never see-through from below.
 */
const JACKET_PROFILE: [number, number][] = [
  [0.0, -0.345],
  [0.5, -0.34],
  [0.495, -0.22],
  [0.478, -0.06],
  [0.452, 0.08],
  [0.415, 0.2],
  [0.355, 0.3],
  [0.265, 0.375],
  [0.14, 0.41],
  [0.0, 0.418],
];

/**
 * Jacket radius at a chest-local height — used to lay the zipper and the
 * pom-poms exactly on the curved surface instead of guessing a depth that
 * clips through it at some heights.
 */
export function jacketRadiusAt(y: number): number {
  const pts = JACKET_PROFILE;
  if (y <= pts[1][1]) return pts[1][0];
  for (let i = 1; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i];
    const [r1, y1] = pts[i + 1];
    if (y >= y0 && y <= y1) {
      const t = (y - y0) / (y1 - y0 || 1);
      return r0 + (r1 - r0) * t;
    }
  }
  return pts[pts.length - 1][0];
}

/** A spherical cap around +Y, `theta` radians wide. */
function cap(radius: number, theta: number, seg = 24) {
  return new THREE.SphereGeometry(radius, seg, Math.ceil(seg * 0.7), 0, TAU, 0, theta);
}

export type LilyGeometries = ReturnType<typeof buildGeometries>;
export type LilyMaterials = ReturnType<typeof buildMaterials>;

function buildGeometries() {
  return {
    head: new THREE.SphereGeometry(HEAD_R, 40, 28),
    ear: new THREE.SphereGeometry(0.09, 14, 10),
    nose: new THREE.SphereGeometry(0.052, 14, 10),

    eyeball: new THREE.SphereGeometry(EYE_R, 26, 20),
    iris: cap(EYE_R * 1.016, 0.68, 22),
    pupil: cap(EYE_R * 1.033, 0.33, 20),
    glint: cap(EYE_R * 1.05, 0.13, 14),
    lidUpper: cap(EYE_R * 1.072, Math.PI / 2, 22),
    // Slightly smaller so the two lids never end up coplanar when closed.
    lidLower: cap(EYE_R * 1.056, Math.PI / 2, 22),
    lash: new THREE.TorusGeometry(EYE_R * 1.072, 0.017, 8, 26),
    brow: new THREE.TorusGeometry(0.13, 0.026, 8, 16, Math.PI * 0.55),

    freckle: new THREE.SphereGeometry(0.019, 8, 6),
    cheek: new THREE.SphereGeometry(0.11, 16, 12),
    smile: new THREE.TorusGeometry(0.14, 0.022, 8, 22, Math.PI * 0.8),
    mouthInner: new THREE.SphereGeometry(0.115, 18, 14),

    // Tilted back 0.38rad by the figure, this cap width puts the hairline at
    // y ~= 0.40 on the head sphere: above the brows, below the crown.
    hairCap: cap(HEAD_R * 1.048, Math.PI * 0.342, 40),
    // The tilted cap alone can only sit high at the back; this fuller mass
    // behind it is what actually gives the back and sides their hair.
    hairBack: new THREE.SphereGeometry(0.5, 30, 22),
    bang: new THREE.SphereGeometry(0.17, 16, 12),
    spike: new THREE.ConeGeometry(0.11, 0.3, 14),
    tie: new THREE.TorusGeometry(0.075, 0.032, 10, 18),
    tail1: new THREE.SphereGeometry(0.23, 22, 16),
    tail2: new THREE.SphereGeometry(0.185, 20, 14),
    tail3: new THREE.SphereGeometry(0.125, 16, 12),
    tail4: new THREE.SphereGeometry(0.07, 12, 10),

    neck: new THREE.CylinderGeometry(0.145, 0.162, 0.22, 22),
    collar: new THREE.CylinderGeometry(0.2, 0.216, 0.14, 26),
    chestV: new THREE.SphereGeometry(0.17, 20, 14),
    jacket: new THREE.LatheGeometry(
      JACKET_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    ),
    hood: cap(0.3, Math.PI * 0.62, 24),
    pompom: new THREE.SphereGeometry(0.115, 20, 14),
    drawstring: new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8),
    zipTooth: new THREE.BoxGeometry(0.032, 0.075, 0.022),
    zipPull: new THREE.BoxGeometry(0.05, 0.07, 0.026),

    upperArm: new THREE.CapsuleGeometry(0.098, 0.19, 5, 16),
    foreArm: new THREE.CapsuleGeometry(0.088, 0.155, 5, 16),
    cuff: new THREE.CylinderGeometry(0.096, 0.096, 0.075, 18),
    hand: new THREE.SphereGeometry(0.098, 18, 14),

    skirt: new THREE.CylinderGeometry(0.38, 0.48, 0.3, 34),
    leg: new THREE.CapsuleGeometry(0.105, 0.1, 5, 16),
    sock: new THREE.CylinderGeometry(0.108, 0.118, 0.35, 20),
    sockStripe: new THREE.CylinderGeometry(0.121, 0.121, 0.032, 20),
    shoe: new THREE.SphereGeometry(0.15, 22, 16),
    sole: new THREE.SphereGeometry(0.148, 20, 12),
  };
}

/** Soft, slightly waxy toy materials — no metal, no sharp speculars. */
function std(color: string, roughness = 0.62, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness: 0,
    ...extra,
  });
}

function buildMaterials() {
  return {
    skin: std(P.skin, 0.66),
    skinShade: std(P.skinShade, 0.7),
    hair: std(P.hair, 0.55),
    hairDark: std(P.hairDark, 0.58),
    hairLight: std(P.hairLight, 0.52),
    hairTie: std(P.hairTie, 0.5),
    eyeWhite: std(P.eyeWhite, 0.28),
    iris: std(P.iris, 0.2, { emissive: new THREE.Color(P.irisDeep), emissiveIntensity: 0.18 }),
    pupil: std(P.pupil, 0.18),
    glint: std("#ffffff", 0.1, { emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.55 }),
    lash: std(P.lash, 0.45),
    brow: std(P.brow, 0.55),
    freckle: std(P.freckle, 0.7),
    cheek: std(P.cheek, 0.75, { transparent: true, opacity: 0.5 }),
    mouth: std(P.mouth, 0.5),
    mouthInner: std(P.mouthInner, 0.6),
    jacket: std(P.jacket, 0.72),
    jacketShade: std(P.jacketShade, 0.75),
    shirt: std(P.shirt, 0.72),
    shirtShade: std(P.shirtShade, 0.74),
    skirt: std(P.skirt, 0.72),
    sock: std(P.sock, 0.8),
    sockStripe: std(P.sockStripe, 0.78),
    shoe: std(P.shoe, 0.5),
    shoeShade: std(P.shoeShade, 0.55),
    // High roughness sells the fuzzy pom-poms without a texture.
    pompom: std(P.pompom, 0.98),
    drawstring: std(P.drawstring, 0.85),
    metal: std(P.metal, 0.3, { metalness: 0.6 }),
  };
}

export interface LilyAssets {
  geo: LilyGeometries;
  mat: LilyMaterials;
  dispose(): void;
}

/**
 * Builds one shared set of geometries and materials for a Lily figure.
 * Shared rather than per-mesh so ~70 meshes cost ~50 GPU resources, and
 * disposed explicitly because nothing here is owned by React's JSX tree.
 */
export function buildLilyAssets(): LilyAssets {
  const geo = buildGeometries();
  const mat = buildMaterials();
  return {
    geo,
    mat,
    dispose() {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => m.dispose());
    },
  };
}
