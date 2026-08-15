"use client";

import { useSyncExternalStore } from "react";

const subscribeToRootClass = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
};

/**
 * Whether dark mode is active right now, live-updating when the theme
 * toggles. For anything CSS can't cover — canvas textures, WebGL material
 * colors — where the `dark:` variant never reaches.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeToRootClass,
    () => document.documentElement.classList.contains("dark"),
    // Server snapshot: light; the bootstrap script has already set the real
    // class before hydration, so client snapshots are always correct.
    () => false,
  );
}
