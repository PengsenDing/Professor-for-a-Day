/**
 * Dark mode plumbing shared by the server layout and client components.
 * The theme is the `dark` class on <html> (see the @custom-variant in
 * globals.css); an explicit choice persists in localStorage, and without
 * one the OS preference wins.
 */

export const THEME_STORAGE_KEY = "pfad-theme";

/**
 * Inline bootstrap injected as the first element of <body>: applies the
 * `dark` class before the first paint so a dark-mode visitor never sees a
 * white flash. Must stay dependency-free and parseable as a plain script.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var dark =
      stored === "dark" ||
      (stored !== "light" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();`;
