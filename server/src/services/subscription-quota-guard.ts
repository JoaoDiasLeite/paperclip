import type { ProviderQuotaResult } from "@paperclipai/shared";
import { AI_AUTH_ENV_KEYS } from "./ai-connection-runtime.js";
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

/**
 * Quota fallback (adapterConfig.quotaFallback): when the agent's own subscription is over the
 * quota-guard threshold, run this heartbeat on another adapter instead of deferring it, e.g.
 *   { "adapterType": "antigravity_local", "model": "claude-sonnet-4-6", "config": { ... } }
 * Instructions, memory digest, prompt templates, time limits, cwd and env carry over; adapter-
 * specific keys (models, tool lists, skills, sessions) do not.
 */
export interface QuotaFallbackPlan {
  reason: string;
  adapterType: string;
  config: Record<string, unknown>;
}

const FALLBACK_CARRY_KEYS = [
  "instructionsFilePath",
  "instructionsEntryFile",
  "instructionsBundleMode",
  "memoryDigest",
  "memoryDigestMaxChars",
  "promptTemplate",
  "bootstrapPromptTemplate",
  "timeoutSec",
  "graceSec",
  "cwd",
  "env",
] as const;

export function readQuotaFallback(
  config: Record<string, unknown> | null | undefined,
): { adapterType: string; model: string | null; config: Record<string, unknown> } | null {
  const raw = config?.quotaFallback;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const adapterType = typeof record.adapterType === "string" ? record.adapterType.trim() : "";
  if (!adapterType) return null;
  const model = typeof record.model === "string" && record.model.trim() ? record.model.trim() : null;
  const extra =
    typeof record.config === "object" && record.config !== null && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {};
  return { adapterType, model, config: extra };
}

/**
 * Returns a plan to run on the fallback adapter, or null to run (or defer) normally. A fallback
 * whose own provider is also over the threshold is not used, so both quotas keep their headroom.
 */
/**
 * The primary's env carries its AI connection identity: an isolated HOME/XDG home and provider
 * credentials injected by the AI connection runtime. The fallback CLI must use its own login, so
 * those keys are dropped and everything else (user env bindings) carries over.
 */
function withoutProviderIdentityEnv(env: Record<string, unknown>): Record<string, unknown> {
  const identityKeys = new Set<string>(["HOME", ...AI_AUTH_ENV_KEYS]);
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !identityKeys.has(key) && !key.startsWith("XDG_")),
  );
}

export async function resolveSubscriptionQuotaFallback(
  adapterType: string,
  config: Record<string, unknown> | null | undefined,
  options: { env?: NodeJS.ProcessEnv; now?: number; fetcher?: QuotaFetcher } = {},
): Promise<QuotaFallbackPlan | null> {
  const fallback = readQuotaFallback(config);
  if (!fallback || fallback.adapterType === adapterType) return null;
  const reason = await subscriptionQuotaBlockReason(adapterType, options);
  if (!reason) return null;
  if (await subscriptionQuotaBlockReason(fallback.adapterType, options)) return null;
  const carried: Record<string, unknown> = {};
  for (const key of FALLBACK_CARRY_KEYS) {
    if (config && key in config) carried[key] = config[key];
  }
  if (typeof carried.env === "object" && carried.env !== null && !Array.isArray(carried.env)) {
    carried.env = withoutProviderIdentityEnv(carried.env as Record<string, unknown>);
  }
  return {
    reason,
    adapterType: fallback.adapterType,
    config: { ...carried, ...(fallback.model ? { model: fallback.model } : {}), ...fallback.config },
  };
}

export function resetSubscriptionQuotaGuardCacheForTests() {
  cached = null;
  inFlight = null;
}
