import type { ErrorCode } from "./types";

/** Error carrying the contract's ErrorEnvelope code (packages/shared/openapi.yaml). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: ErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
