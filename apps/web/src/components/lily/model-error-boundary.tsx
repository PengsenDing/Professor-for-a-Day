"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches a GLB that exists but cannot be parsed (truncated download, wrong
 * format, unsupported extension) and falls back instead of taking the page
 * down with it. Missing files are handled earlier, by `useModelAvailability`.
 */
export class ModelErrorBoundary extends Component<
  { fallback: ReactNode; onError?: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
