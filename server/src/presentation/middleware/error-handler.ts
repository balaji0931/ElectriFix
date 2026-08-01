import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  void next;
  const statusCode = error.statusCode === 503 ? 503 : 500;
  const code = statusCode === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR";

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
