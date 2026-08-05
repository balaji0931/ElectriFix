import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("preserves a DT filter while paging pole states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ pole_id: "P-001" }],
            pagination: { next_cursor: "next", has_more: true },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ pole_id: "P-002" }],
            pagination: { next_cursor: null, has_more: false },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const poles = await api.poleStates("DT-001");

    expect(poles).toHaveLength(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/poles/states?dtId=DT-001&limit=200",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/poles/states?dtId=DT-001&limit=200&cursor=next",
    );
  });
});
