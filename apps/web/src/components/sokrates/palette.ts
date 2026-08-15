/**
 * Sokrates' canonical colour identity.
 *
 * A stylized, friendly interpretation of the ancient Greek philosopher:
 * warm tanned skin, a readable silver-gray beard and brows, an off-white
 * robe with a gold hem, and a muted blue shawl over one shoulder. This is
 * the single source of truth for "is this still Sokrates?" — both the
 * procedural stand-in and any future `sokrates.glb` are checked against it.
 * Changing a value here changes the character — treat it as a design
 * decision, not a tweak.
 */
export const SOKRATES_PALETTE = {
  /** Warm, sun-touched Mediterranean skin. */
  skin: "#e9b98e",
  skinShade: "#d49c6e",
  /** Silver-gray beard, brows and side tufts — his most recognisable feature. */
  beard: "#b8bcc2",
  beardLight: "#d9dce0",
  beardDark: "#9aa0a8",
  /** Warm, intelligent brown eyes. */
  eyeWhite: "#ffffff",
  iris: "#8a5a30",
  irisDeep: "#5d3a1c",
  pupil: "#241812",
  /** Gentle blush that keeps the face warm rather than stern. */
  cheek: "#e09a72",
  /** A kind, slightly amused smile. */
  mouth: "#8a4038",
  mouthInner: "#5e2620",
  /** Off-white ancient Greek robe (chiton). */
  robe: "#f2ebdc",
  robeShade: "#ded2ba",
  /** Gold trim along the hem — minimal, classical, never gaudy. */
  trim: "#c9a24b",
  /** Muted blue shawl (himation) draped over one shoulder. */
  shawl: "#6f88a6",
  shawlShade: "#5a7290",
  /** Leather sandals. */
  sandal: "#8a5a33",
  sandalDark: "#6e4526",
} as const;

export type SokratesPalette = typeof SOKRATES_PALETTE;
