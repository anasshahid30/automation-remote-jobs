export function formatDate(value: string | null, timezone = "Asia/Karachi") {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function dateTimeForInput(value: string | null, timezone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (name: string) => parts.find((part) => part.type === name)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function compensation(job: {
  salary_min_original: number | null;
  salary_max_original: number | null;
  salary_min_annual: number | null;
  salary_max_annual: number | null;
  salary_period: string;
  salary_currency: string | null;
}) {
  const min = job.salary_min_original ?? job.salary_min_annual;
  const max = job.salary_max_original ?? job.salary_max_annual;
  if (min == null && max == null) return "Compensation undisclosed";
  const amount =
    min != null && max != null
      ? `${min.toLocaleString()}–${max.toLocaleString()}`
      : min != null
        ? `from ${min.toLocaleString()}`
        : `up to ${max!.toLocaleString()}`;
  const period = {
    hourly: "hour",
    monthly: "month",
    annual: "year",
    unknown: "period unknown",
  }[job.salary_period];
  return `${job.salary_currency ?? "Currency unknown"} ${amount} / ${period}`;
}
import { statusLabels } from "./schemas";

export function eventLabel(event: { event_type: string; details: unknown }) {
  const details =
    event.details && typeof event.details === "object"
      ? (event.details as Record<string, unknown>)
      : {};
  const label = (value: unknown) =>
    typeof value === "string"
      ? (statusLabels[value] ?? value.replaceAll("_", " "))
      : "Unknown";
  if (event.event_type === "status_changed")
    return `${label(details.previous_status)} → ${label(details.status)}`;
  if (event.event_type === "record_created")
    return `Record created · ${label(details.status)}`;
  if (event.event_type === "record_updated")
    return `Record edited · ${label(details.status)}`;
  return event.event_type.replaceAll("_", " ");
}
