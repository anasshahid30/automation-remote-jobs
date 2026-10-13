import { describe, expect, it, vi } from "vitest";
import { createOpenAIClassifier, validateClassification } from "./ai";
const source =
  "Mid-level Backend Developer\nFully remote independent contract. US-only applicants.";
const suggestion = {
  role_category: "backend",
  seniority: "mid",
  employment_type: "contract",
  confidence: 0.8,
  citations: [
    { field: "role_category", quote: "Backend Developer" },
    { field: "seniority", quote: "Mid-level" },
    { field: "employment_type", quote: "independent contract" },
  ],
};
const config = {
  key: "synthetic-test-key-only",
  model: "gpt-4.1-mini",
  temperature: 0,
  retries: 1,
};
const response = (value: unknown) =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: { content: JSON.stringify(value), refusal: null },
      },
    ],
  });
describe("optional structured classification provider", () => {
  it("validates grounded suggestions and rejects extra eligibility instructions", () => {
    expect(validateClassification(suggestion, source).role_category).toBe(
      "backend",
    );
    expect(() =>
      validateClassification({ ...suggestion, decision: "ELIGIBLE" }, source),
    ).toThrow();
    expect(() =>
      validateClassification(
        {
          ...suggestion,
          citations: [{ field: "role_category", quote: "invented" }],
        },
        source,
      ),
    ).toThrow();
  });
  it("requires a citation for every known field", () =>
    expect(() =>
      validateClassification({ ...suggestion, citations: [] }, source),
    ).toThrow());
  it("calls the fixed provider endpoint with only public text and structured output", async () => {
    const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      expect(body.messages[1].content).toContain("US-only");
      expect(body.messages[1].content).not.toContain(config.key);
      expect(body.response_format.type).toBe("json_schema");
      expect(options?.redirect).toBe("error");
      return response(suggestion);
    });
    const result = await createOpenAIClassifier(config, request).classify(
      "Mid-level Backend Developer",
      source.split("\n")[1],
    );
    expect(result.role_category).toBe("backend");
    expect(request.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
  it("retries rate limiting within a bound", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(response(suggestion));
    await createOpenAIClassifier(config, request).classify(
      "Mid-level Backend Developer",
      source.split("\n")[1],
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("fails closed on invalid output, truncation and oversized responses", async () => {
    for (const result of [
      response({ ...suggestion, decision: "ELIGIBLE" }),
      Response.json({
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }),
      new Response("x".repeat(70000)),
    ])
      await expect(
        createOpenAIClassifier(
          config,
          vi.fn().mockResolvedValue(result),
        ).classify("Mid-level Backend Developer", source.split("\n")[1]),
      ).rejects.toThrow();
  });
  it("never echoes provider errors or keys", async () => {
    await expect(
      createOpenAIClassifier(
        config,
        vi.fn().mockResolvedValue(new Response(config.key, { status: 401 })),
      ).classify("Fixture", "Fixture"),
    ).rejects.toThrow("Classification provider rejected the request");
  });
});
