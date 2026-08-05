import type { AiSummaryProvider } from "../application/ai-summary-service.js";

export interface OpenRouterSummaryConfiguration {
  readonly apiKey: string | undefined;
  readonly model: string | undefined;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

/** Thin OpenRouter adapter. It returns null for every non-successful outcome. */
export class OpenRouterSummaryProvider implements AiSummaryProvider {
  constructor(private readonly configuration: OpenRouterSummaryConfiguration) {}

  async generate(prompt: string): Promise<string | null> {
    const { apiKey, model, timeoutMs } = this.configuration;
    if (!apiKey || !model) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `${this.configuration.baseUrl.replace(/\/+$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return null;
      }
      const responseBody = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = responseBody.choices?.[0]?.message?.content;
      return typeof content === "string" && content.trim().length > 0
        ? content.trim()
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
