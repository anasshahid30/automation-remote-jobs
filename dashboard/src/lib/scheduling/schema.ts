import { z } from "zod";
export const quotaSchema = z.object({
  timezone: z.string(),
  limit: z.number(),
  completed_today: z.number(),
  pending_handoffs: z.number(),
  remaining: z.number(),
  resets_at: z.string(),
});
export const metricsSchema = z.object({
  quota: quotaSchema,
  last_worker_seen: z.string().nullable(),
  worker_live: z.boolean(),
  queued: z.number(),
  running: z.number(),
  failed: z.number(),
  attention: z.number(),
  unique_jobs: z.number(),
  ineligible_jobs: z.number(),
  packages: z.number(),
  awaiting_approval: z.number(),
  uncertain: z.number(),
  responses: z.number(),
  interviews: z.number(),
  days: z.array(
    z.object({ day: z.string(), manual: z.number(), verified: z.number() }),
  ),
});
export const taskLabels: Record<string, string> = {
  queued: "Scheduled",
  running: "Checking",
  retry_wait: "Waiting to retry",
  ready: "Ready for your review",
  needs_attention: "Inputs need attention",
  done: "Dismissed",
  cancelled: "Cancelled",
  failed: "Stopped after an error",
  skipped: "No longer applicable",
};
export const resultLabels: Record<string, string> = {
  review_package:
    "Open the package and run the full dry check before a handoff.",
  inputs_need_review:
    "Review current eligibility, the package and any previous handoff. No submission was started.",
  follow_up_due:
    "Your follow-up is due. Review the employer response and decide what to do yourself.",
  obsolete: "The application or reminder date changed.",
  paused: "Processing paused. The task will wait for enabled controls.",
  lease_expired:
    "The worker did not finish within its lease. Only this local check can be retried.",
  temporary_database: "A temporary database problem delayed this task.",
  permanent_database:
    "A configuration or database error needs attention before rescheduling.",
  acknowledged: "You dismissed this reminder. No message was sent.",
  cancelled: "This local task was cancelled.",
};
