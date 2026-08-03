import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  void next;
  const isMalformedJson = error instanceof SyntaxError && "body" in error;
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
    },
  });
};
