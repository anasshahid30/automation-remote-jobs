import { describe, expect, it } from "vitest";
import {
  importBatchSchema,
  importPayload,
  normalizeListing,
} from "./normalization";
describe("manual import normalization", () => {
  it("removes tracking parameters and sorts identity parameters", () =>
    expect(
      normalizeListing(
        "https://EXAMPLE.test/jobs/?z=2&utm_source=x&a=1#description",
      ).canonical_url,
    ).toBe("https://example.test/jobs?a=1&z=2"));
  it("preserves meaningful query IDs and SPA hash routes", () => {
    expect(
      normalizeListing("https://example.test/?job=123#/jobs/456").canonical_url,
    ).toContain("job=123#/jobs/456");
    expect(
      normalizeListing("https://example.test/?job=124").canonical_url,
    ).not.toBe(normalizeListing("https://example.test/?job=123").canonical_url);
  });
  it.each([
    "https://boards.greenhouse.io/acme/jobs/123?utm_source=x",
    "https://boards.greenhouse.io/embed/job_app?for=acme&token=123",
    "https://job-boards.greenhouse.io/acme/jobs/123",
  ])("recognizes equivalent Greenhouse identity", (url) =>
    expect(normalizeListing(url)).toEqual({
      canonical_url: "https://job-boards.greenhouse.io/acme/jobs/123",
      source_platform: "greenhouse",
      external_job_id: "acme:123",
    }),
  );
  it("deduplicates Lever application links without assuming company IDs are global", () => {
    expect(
      normalizeListing("https://jobs.lever.co/acme/abc/apply?lever-source=x")
        .external_job_id,
    ).toBe("acme:abc");
    expect(
      normalizeListing("https://jobs.lever.co/other/abc").external_job_id,
    ).toBe("other:abc");
  });
  it("recognizes LinkedIn and Wellfound URLs without contacting either", () => {
    expect(
      normalizeListing("https://linkedin.com/jobs/view/backend-123456/")
        .canonical_url,
    ).toBe("https://www.linkedin.com/jobs/view/123456");
    expect(
      normalizeListing("https://wellfound.com/jobs/123-backend")
        .external_job_id,
    ).toBe("123");
  });
  it("rejects source conflicts, credentials and non-HTTPS links", () => {
    expect(() =>
      normalizeListing("https://jobs.lever.co/acme/abc", "greenhouse"),
    ).toThrow();
    expect(() =>
      normalizeListing("https://jobs.lever.co/acme/abc", "lever", "different"),
    ).toThrow();
    expect(() =>
      normalizeListing("https://user:secret@example.test/job"),
    ).toThrow();
    expect(() => normalizeListing("http://example.test/job")).toThrow();
  });
  it("bounds batches and rejects extra fields", () => {
    const row = {
      url: "https://example.test/job",
      company: "Fixture",
      title: "Fixture",
      description: "Synthetic fixture",
    };
    expect(importBatchSchema.safeParse(Array(21).fill(row)).success).toBe(
      false,
    );
    expect(
      importBatchSchema.safeParse([{ ...row, user_id: "foreign" }]).success,
    ).toBe(false);
    expect(importPayload(importBatchSchema.parse([row]))[0].description).toBe(
      row.description,
    );
  });
});
