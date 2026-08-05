import type { ApiErrorCode } from "../domain/contracts.js";

export class HttpError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 422,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
