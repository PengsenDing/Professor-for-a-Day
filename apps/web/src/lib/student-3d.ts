import type { Mode } from "@/lib/types";

/**
 * Which students have a 3D character, and where their model lives.
 *
 * Adding Max or Sokrates later is an entry here plus their GLB — the picker
 * already branches on this registry, so no component changes are needed.
 * A student without an entry keeps the existing 2D portrait card.
 */
export interface Student3D {
  /** Public path to the GLB. Missing files fall back to the 3D stand-in. */
  modelUrl: string;
}

export const STUDENT_3D: Partial<Record<Mode, Student3D>> = {
  beginner: { modelUrl: "/models/lily.glb" },
};
