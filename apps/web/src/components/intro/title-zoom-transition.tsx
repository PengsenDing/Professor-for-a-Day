"use client";

import { useState } from "react";
import { COMPOSITION, TITLE, ZOOM } from "./intro-config";
import { WRITE_END_FRAME } from "./handwriting-path";
import { HandwrittenTitle, TITLE_ASPECT } from "./handwritten-title";
import styles from "./intro.module.css";

/**
 * The cinematic exit: the finished handwritten title (same SVG component,
 * fully written, no tip) rendered at exactly the on-screen size and
 * position of the Player's title, so swapping the Player out for this
 * clone is pixel-invisible. The clone then flies toward the viewer —
 * scale accelerates past the viewport with soft motion blur while an
 * expanding glow wash covers the screen — driven by the CSS keyframes in
 * intro.module.css and the ZOOM config passed down as CSS variables.
 *
 * A DOM element (not the Player) does the zoom so the enlarged strokes
 * can overflow the real viewport on any aspect ratio without being
 * clipped by the 16:9 composition canvas.
 *
 * Only mounted after a click, so it never renders on the server.
 */
export const TitleZoomTransition = () => {
  // Locked once on mount: mid-transition resizes shouldn't re-anchor it.
  const [containScale] = useState(() =>
    Math.min(
      window.innerWidth / COMPOSITION.width,
      window.innerHeight / COMPOSITION.height,
    ),
  );

  const widthPx = TITLE.renderWidthPx * containScale;
  // The Player centers the title at TITLE.centerY on the 1080-unit canvas;
  // reproduce that offset relative to the viewport center.
  const offsetY = (TITLE.centerY - COMPOSITION.height / 2) * containScale;

  const zoomVars = {
    "--zoom-delay": `${ZOOM.pressMs}ms`,
    "--zoom-duration": `${ZOOM.durationMs}ms`,
    "--zoom-max-scale": String(ZOOM.maxScale),
    "--zoom-max-blur": `${ZOOM.maxBlurPx}px`,
  } as React.CSSProperties;

  return (
    <div className={styles.zoomLayer} style={zoomVars} aria-hidden="true">
      {/* Expanding glow wash: guarantees full coverage while the camera
          passes between strokes, and hides the page-reveal seam. */}
      <div className={styles.zoomGlow} />

      {/* The static offset lives on the wrapper: the keyframes animate the
          inner element's transform and would override an inline one. */}
      <div style={{ transform: `translateY(${offsetY}px)` }}>
        <div
          className={styles.zoomTitle}
          style={{ width: widthPx, height: widthPx * TITLE_ASPECT }}
        >
          <HandwrittenTitle
            frame={WRITE_END_FRAME + 999}
            widthPx={widthPx}
            showTip={false}
          />
        </div>
      </div>
    </div>
  );
};
