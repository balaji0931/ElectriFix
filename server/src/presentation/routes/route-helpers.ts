import { z } from "zod";

import { HttpError } from "../http-error.js";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export function pagination(query: unknown, defaultLimit = 50) {
  const parsed = paginationSchema.safeParse(query);
  if (!parsed.success)
    throw new HttpError(400, "BAD_REQUEST", "Invalid pagination query");
  const limit =
    query && typeof query === "object" && "limit" in query
      ? parsed.data.limit
      : defaultLimit;
  const offset = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : 0;
  return { limit, offset };
}

export function page<T>(
  items: readonly T[],
  limit: number,
  offset: number,
  totalCount = true,
) {
  const data = items.slice(offset, offset + limit);
  const hasMore = offset + data.length < items.length;
  return {
    data,
    pagination: {
      next_cursor: hasMore ? encodeCursor(offset + data.length) : null,
      has_more: hasMore,
      ...(totalCount ? { total_count: items.length } : {}),
    },
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}
function decodeCursor(cursor: string): number {
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(offset) || offset < 0)
    throw new HttpError(400, "BAD_REQUEST", "Invalid cursor");
  return offset;
}
