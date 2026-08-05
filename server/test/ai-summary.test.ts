import { describe, expect, it, vi } from "vitest";

import {
  AiSummaryService,
  buildIncidentSummaryPrompt,
} from "../src/application/ai-summary-service.js";
import { OpenRouterSummaryProvider } from "../src/infrastructure/openrouter-summary-provider.js";

const input = {
  faultType: "span" as const,
  topologySource: "RECORDED" as const,
  confidenceLevel: "HIGH" as const,
  affectedPoleCount: 2,
  pincode: "560001",
  evidence: {
    last_live_pole: "P-1",
    first_dark_pole: "P-2",
    fault_span: ["P-1", "P-2"] as [string, string],
    affected_poles: ["P-2", "P-3"],
    affected_pole_count: 2,
    topology_source: "RECORDED" as const,
    confidence_level: "HIGH" as const,
    confidence_reasons: [],
    coordinates: { lat: 12.9, lon: 77.5 },
    pincode: "560001",
    suppressed_sensors: [],
  },
};

describe("AI incident summaries", () => {
  it("maps only stable evidence into the prompt", () => {
    const prompt = buildIncidentSummaryPrompt(input);
    expect(prompt).toContain('"fault_type":"span"');
    expect(prompt).toContain('"last_live_pole":"P-1"');
    expect(prompt).not.toContain("OPENROUTER_API_KEY");
  });

  it("leaves summaries null when disabled or the provider fails", async () => {
    const provider = { generate: vi.fn().mockRejectedValue(new Error("down")) };
    await expect(
      new AiSummaryService(false, provider).generate(input),
    ).resolves.toBeNull();
    expect(provider.generate).not.toHaveBeenCalled();
    await expect(
      new AiSummaryService(true, provider).generate(input),
    ).resolves.toBeNull();
  });

  it("accepts only a valid non-empty OpenRouter completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "  Two poles are dark.  " } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterSummaryProvider({
      apiKey: "key",
      model: "model",
      baseUrl: "https://example.test/api/v1",
      timeoutMs: 50,
    });
    await expect(provider.generate("evidence")).resolves.toBe(
      "Two poles are dark.",
    );
    vi.unstubAllGlobals();
  });

  it("returns null for missing credentials, provider errors, and malformed responses", async () => {
    await expect(
      new OpenRouterSummaryProvider({
        apiKey: undefined,
        model: undefined,
        baseUrl: "https://example.test",
        timeoutMs: 1,
      }).generate("evidence"),
    ).resolves.toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const provider = new OpenRouterSummaryProvider({
      apiKey: "key",
      model: "model",
      baseUrl: "https://example.test",
      timeoutMs: 50,
    });
    await expect(provider.generate("evidence")).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns null when the provider exceeds the configured timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    const provider = new OpenRouterSummaryProvider({
      apiKey: "key",
      model: "model",
      baseUrl: "https://example.test",
      timeoutMs: 1,
    });
    await expect(provider.generate("evidence")).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
