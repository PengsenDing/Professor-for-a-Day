"use client";

import { UI } from "./intro-config";
import styles from "./intro.module.css";

type ClickAnywhereProps = {
  /** Kept mounted (for layout stability); becomes interactive when true. */
  visible: boolean;
  /** True once the exit transition is running — fades the hint out. */
  pressed: boolean;
  onClick: () => void;
};

/**
 * Full-screen advance target that replaced the START button: once the
 * title is fully written, a click (or tap) anywhere on the intro begins.
 * It stays a real <button> so Enter/Space and screen readers keep
 * working; the visible hint text sits where the button used to.
 * Clicks during the writing animation are ignored (pointer-events: none
 * until `visible`), preserving the reveal choreography.
 */
export const ClickAnywhere = ({
  visible,
  pressed,
  onClick,
}: ClickAnywhereProps) => {
  return (
    <button
      type="button"
      className={[
        styles.clickAnywhere,
        visible ? styles.clickAnywhereVisible : "",
        pressed ? styles.clickAnywherePressed : "",
      ].join(" ")}
      onClick={onClick}
      disabled={!visible || pressed}
      tabIndex={visible ? 0 : -1}
    >
      <span className={styles.clickHint}>{UI.clickHintLabel}</span>
    </button>
  );
};
