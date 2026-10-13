export type Payload = {
  applicationId: string;
  jobId: string;
  packageId: string;
  sourceUrl: string;
  digest: string;
};
export type Receipt = {
  reference: string;
  applicationKey: string;
  jobId: string;
  receivedAt: string;
};
export type Failure = {
  kind: "rejected" | "rate_limited" | "authentication" | "uncertain";
  retryAfterSeconds?: number;
};
export type AttemptState =
  | "reserved"
  | "dispatching"
  | "verified"
  | "rejected"
  | "uncertain"
  | "blocked";
export type AttemptEvent = {
  key: string;
  state: AttemptState;
  reference?: string;
  failure?: Failure;
};
export interface AttemptStore {
  reserve(key: string, digest: string): Promise<boolean>;
  record(event: AttemptEvent): Promise<void>;
}
export interface SubmissionAdapter {
  readonly id: string;
  readonly kind: "human_assisted" | "authorized_api" | "mock";
  validate_application(payload: Payload): string[];
  prepare_payload(payload: Payload): unknown;
  submit_application(
    payload: unknown,
    idempotencyKey: string,
  ): Promise<unknown>;
  verify_submission(
    response: unknown,
    payload: Payload,
    key: string,
  ): Receipt | null;
  classify_error(error: unknown): Failure;
  record_attempt(store: AttemptStore, event: AttemptEvent): Promise<void>;
}

export const humanAssistedAdapter: SubmissionAdapter = {
  id: "official-form-v1",
  kind: "human_assisted",
  validate_application(payload) {
    try {
      const url = new URL(payload.sourceUrl);
      return url.protocol === "https:" && !url.username && !url.password
        ? []
        : ["Use the official HTTPS application form."];
    } catch {
      return ["The official application URL is invalid."];
    }
  },
  prepare_payload(payload) {
    return { packageId: payload.packageId, sourceUrl: payload.sourceUrl };
  },
  async submit_application() {
    throw new Error("The candidate completes the official form.");
  },
  verify_submission() {
    return null;
  },
  classify_error() {
    return { kind: "uncertain" };
  },
  record_attempt(store, event) {
    return store.record(event);
  },
};

export type DispatchPolicy = {
  killSwitch: boolean;
  sourceEnabled: boolean;
  providerAuthorized: boolean;
  approved: boolean;
  currentValidation: boolean;
};
export type DispatchResult = {
  state: AttemptState | "dry_run" | "duplicate";
  reference?: string;
  failure?: Failure;
};

// No production API adapter is registered. Future adapters must supply verified documented
// permission and a durable atomic store; the mock implementation lives exclusively in tests.
export async function executeAdapter(args: {
  adapter: SubmissionAdapter;
  payload: Payload;
  key: string;
  dryRun: boolean;
  store: AttemptStore;
  policy: () => Promise<DispatchPolicy>;
  now?: () => Date;
}): Promise<DispatchResult> {
  const { adapter, payload, key, store } = args;
  const errors = adapter.validate_application(payload);
  const policy = await args.policy();
  if (errors.length || !policy.approved || !policy.currentValidation)
    return { state: "blocked" };
  adapter.prepare_payload(payload);
  if (args.dryRun) return { state: "dry_run" }; // No reservation, dispatch, receipt or network side effect.
  const allowed = (p: DispatchPolicy) =>
    !p.killSwitch &&
    p.sourceEnabled &&
    p.providerAuthorized &&
    p.approved &&
    p.currentValidation &&
    adapter.kind !== "human_assisted";
  if (!allowed(policy)) return { state: "blocked" };
  if (!(await store.reserve(key, payload.digest)))
    return { state: "duplicate" };
  // Check again after acquiring the durable claim. Never expire an uncertain claim to retry it.
  if (!allowed(await args.policy())) {
    await adapter.record_attempt(store, { key, state: "blocked" });
    return { state: "blocked" };
  }
  await adapter.record_attempt(store, { key, state: "dispatching" }); // Fail before sending if audit storage fails.
  let response: unknown;
  try {
    response = await adapter.submit_application(
      adapter.prepare_payload(payload),
      key,
    );
  } catch (error) {
    const failure = adapter.classify_error(error),
      state = failure.kind === "uncertain" ? "uncertain" : "rejected";
    await adapter.record_attempt(store, { key, state, failure });
    return { state, failure };
  }
  let receipt: Receipt | null = null;
  try {
    receipt = adapter.verify_submission(response, payload, key);
  } catch {
    /* Ambiguous provider data is not success. */
  }
  const received = receipt ? new Date(receipt.receivedAt).valueOf() : NaN,
    now = (args.now?.() ?? new Date()).valueOf();
  if (
    !receipt ||
    typeof receipt.reference !== "string" ||
    !receipt.reference.trim() ||
    receipt.applicationKey !== key ||
    receipt.jobId !== payload.jobId ||
    !Number.isFinite(received) ||
    received > now ||
    now - received > 86400000
  ) {
    await adapter.record_attempt(store, { key, state: "uncertain" });
    return { state: "uncertain" };
  }
  await adapter.record_attempt(store, {
    key,
    state: "verified",
    reference: receipt.reference,
  });
  return { state: "verified", reference: receipt.reference };
}
