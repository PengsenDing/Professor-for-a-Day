import "./index.css";
import React from "react";
import { Composition } from "remotion";
import { IntroAnimation } from "./remotion/IntroAnimation";
import { COMPOSITION } from "./introConfig";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION.id}
      component={IntroAnimation}
      durationInFrames={COMPOSITION.durationInFrames}
      fps={COMPOSITION.fps}
      width={COMPOSITION.width}
      height={COMPOSITION.height}
    />
  );
};
