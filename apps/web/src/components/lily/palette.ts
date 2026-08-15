/**
 * Lily's canonical colour identity, sampled from the reference portrait
 * (`/avatars/lily.png`, the 736x981 master render).
 *
 * This is the single source of truth for "is this still Lily?". Both the
 * procedural stand-in figure and any future `lily.glb` are checked against
 * it, so nobody has to re-guess her palette from memory. Changing a value
 * here changes the character — treat it as a design decision, not a tweak.
 */
export const LILY_PALETTE = {
  /** Warm pale skin. */
  skin: "#f7d4bd",
  skinShade: "#e7b195",
  /** Red-orange hair — her single most recognisable feature. */
  hair: "#ee5a2a",
  hairDark: "#d1421a",
  hairLight: "#f97a45",
  /** Small blue-violet ties at the base of each ponytail. */
  hairTie: "#6c63d8",
  /** Large expressive blue eyes. */
  eyeWhite: "#ffffff",
  iris: "#2b9ad8",
  irisDeep: "#14689f",
  pupil: "#101f2b",
  lash: "#3a2016",
  brow: "#dd4a1e",
  /** Freckles across the nose and cheeks. */
  freckle: "#cf7351",
  cheek: "#f2977f",
  /** Friendly smile. */
  mouth: "#7c2b32",
  mouthInner: "#5e1d24",
  /** Yellow jacket. */
  jacket: "#f8c22c",
  jacketShade: "#dda616",
  /** Purple shirt under the jacket (collar + cuffs). */
  shirt: "#a97bd6",
  shirtShade: "#8f61bd",
  /** Red skirt. */
  skirt: "#c4392c",
  skirtShade: "#a52c22",
  /** White socks with a blue stripe. */
  sock: "#f5f5f8",
  sockStripe: "#6fb3de",
  /** Purple shoes. */
  shoe: "#9c6fd6",
  shoeShade: "#7f52ba",
  /** The two grey pom-poms on the jacket drawstrings. */
  pompom: "#dcdce2",
  drawstring: "#efefef",
  /** Zipper hardware. */
  metal: "#b9b9c2",
} as const;

export type LilyPalette = typeof LILY_PALETTE;
