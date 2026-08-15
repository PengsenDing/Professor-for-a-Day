import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export const usePrefersReducedMotion = (): boolean => {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReduced(event.matches);
    };
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
};
