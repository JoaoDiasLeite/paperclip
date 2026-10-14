import type { ProviderQuotaResult } from "@paperclipai/shared";
import { fetchAllQuotaWindows } from "./quota-windows.js";

/**
 * Subscription quota guard: stop starting new agent runs once a provider's
 * subscription usage window (for example the Claude 5-hour session or the
 * weekly window) passes a configured percentage, so the subscription keeps
 * headroom for its human owner. Work is deferred, not paused: the next wake
 * after the window resets runs normally.
 *
 * Off unless PAPERCLIP_QUOTA_GUARD_PERCENT is set to a number from 1 to 100.
 * Provider errors fail open, so a quota API outage never stops the company.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

const PROVIDER_BY_ADAPTER: Record<string, string> = {
  claude_local: "anthropic",
  codex_local: "openai",
};

type QuotaFetcher = () => Promise<ProviderQuotaResult[]>;

let cached: { fetchedAt: number; results: ProviderQuotaResult[] } | null = null;
let inFlight: Promise<ProviderQuotaResult[]> | null = null;

export function quotaGuardThresholdPercent(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.PAPERCLIP_QUOTA_GUARD_PERCENT?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 100) return null;
  return value;
}

async function quotaResults(now: number, fetcher: QuotaFetcher): Promise<ProviderQuotaResult[]> {
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.results;
  if (!inFlight) {
    inFlight = fetcher()
      .then((results) => {
        cached = { fetchedAt: now, results };
        return results;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Returns a human-readable block reason, or null when the agent may start. */
export async function subscriptionQuotaBlockReason(
  adapterType: string,
  options: { env?: NodeJS.ProcessEnv; now?: number; fetcher?: QuotaFetcher } = {},
): Promise<string | null> {
  const threshold = quotaGuardThresholdPercent(options.env);
  if (threshold === null) return null;
  const provider = PROVIDER_BY_ADAPTER[adapterType];
  if (!provider) return null;

  let results: ProviderQuotaResult[];
  try {
    results = await quotaResults(options.now ?? Date.now(), options.fetcher ?? fetchAllQuotaWindows);
  } catch {
    return null;
  }

  const providerResult = results.find((result) => result.provider === provider);
  if (!providerResult?.ok) return null;
  const hot = providerResult.windows.find(
    (window) => typeof window.usedPercent === "number" && window.usedPercent >= threshold,
  );
  if (!hot) return null;
  const resets = hot.resetsAt ? ` until it resets at ${hot.resetsAt}` : "";
  return `Subscription quota guard: ${provider} "${hot.label}" is at ${hot.usedPercent}% (limit ${threshold}%); new runs are deferred${resets}.`;
}

export function resetSubscriptionQuotaGuardCacheForTests() {
  cached = null;
  inFlight = null;
}
