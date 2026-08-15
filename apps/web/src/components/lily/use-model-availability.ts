"use client";

import { useEffect, useState } from "react";

export type ModelStatus = "probing" | "available" | "missing";

/**
 * Checks whether a GLB is actually servable before anything tries to parse it.
 *
 * `useGLTF` suspends and then throws when a file is absent, which turns a
 * perfectly ordinary "the asset hasn't been generated yet" into an error
 * boundary trip. A cheap HEAD request turns it into a fact we can branch on,
 * so the missing-model path is a normal render, not a caught exception.
 *
 * A dev server that answers 404s with an HTML page still counts as missing —
 * hence the content-type check.
 */
export function useModelAvailability(url: string | undefined): ModelStatus {
  // Stored with the url it describes, so a url change reads as "probing"
  // again without an effect writing state on the way through.
  const [probe, setProbe] = useState<{ url: string; status: ModelStatus } | null>(
    null,
  );

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    fetch(url, { method: "HEAD", cache: "force-cache" })
      .then((res) => {
        if (cancelled) return;
        const type = res.headers.get("content-type") ?? "";
        const length = Number(res.headers.get("content-length") ?? "1");
        const looksLikeAsset = !type.includes("text/html") && length > 0;
        setProbe({ url, status: res.ok && looksLikeAsset ? "available" : "missing" });
      })
      .catch(() => {
        if (!cancelled) setProbe({ url, status: "missing" });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return "missing";
  return probe?.url === url ? probe.status : "probing";
}
