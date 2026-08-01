import { describe, expect, it } from "vitest";

import { topologySources } from "../src/domain/contracts.js";

describe("domain test harness", () => {
  it("imports framework-independent contracts without infrastructure setup", () => {
    expect(topologySources).toContain("RECORDED");
  });
});
