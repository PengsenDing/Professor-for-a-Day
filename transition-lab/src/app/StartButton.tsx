import React from "react";
import { UI } from "../introConfig";

type StartButtonProps = {
  /** Kept mounted (for layout stability); fades in when this turns true. */
  visible: boolean;
  /** True once the exit transition is running — compresses the button. */
  pressed: boolean;
  onClick: () => void;
};

/**
 * The START button lives in the React layer, not in the Remotion
 * composition, so it stays clickable and accessible. Its look is defined
 * in intro.css (.start-button): off-white fill, thin ink border, and an
 * asymmetric border-radius that gives it a subtle hand-drawn wobble.
 */
export const StartButton: React.FC<StartButtonProps> = ({
  visible,
  pressed,
  onClick,
}) => {
  return (
    <div className="intro-actions">
      <button
        type="button"
        className={[
          "start-button",
          visible ? "is-visible" : "",
          pressed ? "is-pressed" : "",
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
