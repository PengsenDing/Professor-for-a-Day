"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Light/dark toggle. The current theme is the `dark` class on <html>
 * (applied before first paint by THEME_INIT_SCRIPT); toggling stores an
 * explicit choice that outranks the OS preference from then on. Both icons
 * are always rendered and CSS picks one, so the button hydrates without
 * reading the DOM.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Follow live OS theme changes only while the visitor has no explicit
  // choice stored.
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY) !== null) return;
      } catch {
        return;
      }
      document.documentElement.classList.toggle("dark", mediaQuery.matches);
    };
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode): the toggle still works for
      // this page view, it just won't persist.
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle dark mode"
      onClick={toggle}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );
}
