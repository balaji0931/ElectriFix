import type { ErrorRequestHandler } from "express";
import { HttpError } from "../http-error.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  void next;
  const isMalformedJson = error instanceof SyntaxError && "body" in error;
  if (error instanceof HttpError) {
    return response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }
  const statusCode = isMalformedJson
    ? 400
    : error.statusCode === 503
      ? 503
      : 500;
  const code = statusCode === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR";

  if (isMalformedJson) {
    return response.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: "Malformed JSON request body",
        timestamp: new Date().toISOString(),
      },
    });
  }

  response.status(statusCode).json({
    error: {
      code,
      message:
        statusCode === 503
          ? "Database is unavailable"
          : "An unexpected error occurred",
      timestamp: new Date().toISOString(),
    },
  });
};
