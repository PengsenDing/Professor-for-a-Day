"use client";

import { UI } from "./intro-config";
import styles from "./intro.module.css";

type StartButtonProps = {
  /** Kept mounted (for layout stability); fades in when this turns true. */
  visible: boolean;
  /** True once the exit transition is running — compresses the button. */
  pressed: boolean;
  onClick: () => void;
};

/**
 * Minimal glass button: translucent fill, thin light border, soft glow.
 * Lives in the React layer (outside the Remotion composition) so it stays
 * clickable and accessible; its look is defined in intro.module.css.
 */
export const StartButton = ({ visible, pressed, onClick }: StartButtonProps) => {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={[
          styles.startButton,
          visible ? styles.startButtonVisible : "",
          pressed ? styles.startButtonPressed : "",
        ].join(" ")}
        onClick={onClick}
        disabled={!visible || pressed}
        tabIndex={visible ? 0 : -1}
      >
        {UI.startLabel}
      </button>
    </div>
  );
};
