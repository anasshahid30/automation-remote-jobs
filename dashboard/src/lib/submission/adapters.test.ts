import { describe, expect, it, vi } from "vitest";
import {
  executeAdapter,
  humanAssistedAdapter,
  type AttemptEvent,
  type AttemptStore,
  type DispatchPolicy,
  type Payload,
  type SubmissionAdapter,
} from "./adapters";
const now = new Date("2026-10-13T14:00:00Z");
const payload: Payload = {
  applicationId: "app",
  jobId: "job",
  packageId: "pack",
  sourceUrl: "https://example.test/job",
  digest: "snapshot",
};
const policy: DispatchPolicy = {
  killSwitch: false,
  sourceEnabled: true,
  providerAuthorized: true,
  approved: true,
  currentValidation: true,
};
function setup() {
  const claims = new Set<string>(),
    events: AttemptEvent[] = [];
  const store: AttemptStore = {
    reserve: vi.fn(async (key) => {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    }),
    record: vi.fn(async (event) => {
      events.push(event);
    }),
  };
  const adapter: SubmissionAdapter = {
    ...humanAssistedAdapter,
    id: "test-only",
    kind: "mock",
    submit_application: vi.fn(async () => ({
      status: 200,
      receipt: {
        reference: "synthetic-receipt",
        applicationKey: "key",
        jobId: "job",
        receivedAt: now.toISOString(),
      },
    })),
    verify_submission: (r) =>
      (r as { receipt?: ReturnType<SubmissionAdapter["verify_submission"]> })
        .receipt ?? null,
  };
  const args = {
    adapter,
    payload,
    key: "key",
    dryRun: false,
    store,
    policy: vi.fn(async () => policy),
    now: () => now,
  };
  return { args, adapter, store, events };
}
describe("submission adapter contract (mock provider only)", () => {
  it("dry runs never reserve, dispatch, or count a receipt even while globally paused", async () => {
    const { args, adapter, store, events } = setup();
    args.policy.mockResolvedValue({ ...policy, killSwitch: true });
    expect(await executeAdapter({ ...args, dryRun: true })).toEqual({
      state: "dry_run",
    });
    expect(adapter.submit_application).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
  it.each([
    "killSwitch",
    "sourceEnabled",
    "providerAuthorized",
    "approved",
    "currentValidation",
  ] as const)("blocks when %s disallows dispatch", async (field) => {
    const { args, adapter, store } = setup();
    args.policy.mockResolvedValue({
      ...policy,
      [field]: field === "killSwitch",
    });
    expect((await executeAdapter(args)).state).toBe("blocked");
    expect(adapter.submit_application).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });
  it("rechecks a kill switch after acquiring the durable claim", async () => {
    const { args, adapter } = setup();
    args.policy
      .mockResolvedValueOnce(policy)
      .mockResolvedValue({ ...policy, killSwitch: true });
    expect((await executeAdapter(args)).state).toBe("blocked");
    expect(adapter.submit_application).not.toHaveBeenCalled();
  });
  it("reserves one dispatch across concurrent retries", async () => {
    const { args, adapter, events } = setup();
    const results = await Promise.all([
      executeAdapter(args),
      executeAdapter(args),
    ]);
    expect(results.map((r) => r.state).sort()).toEqual([
      "duplicate",
      "verified",
    ]);
    expect(adapter.submit_application).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.state)).toEqual(["dispatching", "verified"]);
  });
  it.each([
    { status: 200 },
    {
      receipt: {
        reference: "x",
        applicationKey: "wrong",
        jobId: "job",
        receivedAt: now.toISOString(),
      },
    },
    {
      receipt: {
        reference: "x",
        applicationKey: "key",
        jobId: "wrong",
        receivedAt: now.toISOString(),
      },
    },
    {
      receipt: {
        reference: "",
        applicationKey: "key",
        jobId: "job",
        receivedAt: now.toISOString(),
      },
    },
    {
      receipt: {
        reference: "x",
        applicationKey: "key",
        jobId: "job",
        receivedAt: "2030-01-01T00:00:00Z",
      },
    },
    {
      receipt: {
        reference: "x",
        applicationKey: "key",
        jobId: "job",
        receivedAt: "2026-01-01T00:00:00Z",
      },
    },
    {
      receipt: {
        reference: "x",
        applicationKey: "key",
        jobId: "job",
        receivedAt: "invalid",
      },
    },
  ])(
    "never treats uncorrelated or missing receipt as submission success: %j",
    async (response) => {
      const { args, adapter } = setup();
      vi.mocked(adapter.submit_application).mockResolvedValue(response);
      expect((await executeAdapter(args)).state).toBe("uncertain");
      expect((await executeAdapter(args)).state).toBe("duplicate");
      expect(adapter.submit_application).toHaveBeenCalledTimes(1);
    },
  );
  it("a timeout blocks retries because the employer may have received the request", async () => {
    const { args, adapter, events } = setup();
    vi.mocked(adapter.submit_application).mockRejectedValue(
      new Error("timeout after send"),
    );
    expect((await executeAdapter(args)).state).toBe("uncertain");
    expect((await executeAdapter(args)).state).toBe("duplicate");
    expect(events.at(-1)?.failure?.kind).toBe("uncertain");
  });
  it.each(["rate_limited", "authentication", "rejected"] as const)(
    "records %s without automatic retry",
    async (kind) => {
      const { args, adapter } = setup();
      adapter.classify_error = () => ({ kind, retryAfterSeconds: 120 });
      vi.mocked(adapter.submit_application).mockRejectedValue(
        new Error("mock rejection"),
      );
      expect(await executeAdapter(args)).toEqual({
        state: "rejected",
        failure: { kind, retryAfterSeconds: 120 },
      });
      expect((await executeAdapter(args)).state).toBe("duplicate");
    },
  );
  it("stops before sending if durable audit storage fails", async () => {
    const { args, adapter, store } = setup();
    vi.mocked(store.record).mockRejectedValue(new Error("storage unavailable"));
    await expect(executeAdapter(args)).rejects.toThrow("storage unavailable");
    expect(adapter.submit_application).not.toHaveBeenCalled();
    expect((await executeAdapter(args)).state).toBe("duplicate");
  });
  it("retains the claim if storing a valid receipt fails after dispatch", async () => {
    const { args, adapter, store } = setup();
    vi.mocked(store.record)
      .mockResolvedValueOnce()
      .mockRejectedValue(new Error("storage unavailable"));
    await expect(executeAdapter(args)).rejects.toThrow("storage unavailable");
    expect((await executeAdapter(args)).state).toBe("duplicate");
    expect(adapter.submit_application).toHaveBeenCalledTimes(1);
  });
  it("the human adapter cannot dispatch or verify a provider receipt", async () => {
    const { args } = setup();
    expect(
      (await executeAdapter({ ...args, adapter: humanAssistedAdapter })).state,
    ).toBe("blocked");
    expect(
      humanAssistedAdapter.verify_submission({}, payload, "key"),
    ).toBeNull();
  });
  it.each([
    "http://example.test",
    "https://user:password@example.test",
    "javascript:alert(1)",
  ])("rejects unsafe form URLs %s", (sourceUrl) => {
    expect(
      humanAssistedAdapter.validate_application({ ...payload, sourceUrl }),
    ).not.toHaveLength(0);
  });
});
