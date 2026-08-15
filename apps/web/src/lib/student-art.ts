import type { Mode } from "@/lib/types";

/**
 * A separately cut-out arm sprite animated paper-doll style (same rig as
 * image-based Lottie characters: the arm sits behind the body and rotates
 * around a shoulder pivot). All geometry is expressed as percentages of the
 * base portrait so it survives any display size.
 */
export interface WavingArm {
  src: string;
  /** CSS offsets/size of the sprite relative to the base portrait box. */
  left: string;
  top: string;
  width: string;
  /** transform-origin inside the sprite = the shoulder pivot. */
  origin: string;
  /** Native sprite pixel size (for next/image). */
  naturalWidth: number;
  naturalHeight: number;
}

export interface StudentArt {
  /** Transparent body render (arm removed when `arm` is present). */
  image: string;
  arm?: WavingArm;
}

/**
 * Portrait art per student. Students without an entry fall back to their
 * mode icon (picker) or the generic SVG student (session screen).
 * Lily's geometry was measured on the 736×981 master portrait.
 */
export const STUDENT_ART: Partial<Record<Mode, StudentArt>> = {
  beginner: {
    image: "/avatars/lily-body.png",
    arm: {
      src: "/avatars/lily-arm.png",
      left: "66.033%",
      top: "56.065%",
      width: "11.957%",
      origin: "21.6% 17.7%",
      naturalWidth: 88,
      naturalHeight: 254,
    },
  },
};
