import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderQuotaResult } from "@paperclipai/shared";
import {
  quotaGuardThresholdPercent,
  resetSubscriptionQuotaGuardCacheForTests,
  resolveSubscriptionQuotaFallback,
  subscriptionQuotaBlockReason,
} from "../services/subscription-quota-guard.ts";

const env = { PAPERCLIP_QUOTA_GUARD_PERCENT: "75" } as NodeJS.ProcessEnv;

function anthropic(usedPercent: number | null, label = "Current session"): ProviderQuotaResult {
  return {
    provider: "anthropic",
    ok: true,
    windows: [
      { label, usedPercent, resetsAt: "2026-10-14T15:00:00Z", valueLabel: null, detail: null },
      { label: "Extra usage", usedPercent: null, resetsAt: null, valueLabel: "Not enabled", detail: null },
    ],
  } as ProviderQuotaResult;
}

describe("subscription quota guard", () => {
  beforeEach(() => {
    resetSubscriptionQuotaGuardCacheForTests();
  });

  it("is off unless a valid threshold is configured", async () => {
    const fetcher = vi.fn(async () => [anthropic(99)]);
    expect(quotaGuardThresholdPercent({} as NodeJS.ProcessEnv)).toBeNull();
    expect(quotaGuardThresholdPercent({ PAPERCLIP_QUOTA_GUARD_PERCENT: "0" } as NodeJS.ProcessEnv)).toBeNull();
    expect(quotaGuardThresholdPercent({ PAPERCLIP_QUOTA_GUARD_PERCENT: "abc" } as NodeJS.ProcessEnv)).toBeNull();
    expect(await subscriptionQuotaBlockReason("claude_local", { env: {} as NodeJS.ProcessEnv, fetcher })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks a subscription agent once any window reaches the threshold", async () => {
    const reason = await subscriptionQuotaBlockReason("claude_local", {
      env,
      fetcher: async () => [anthropic(80, "Current week (all models)")],
    });
    expect(reason).toContain('anthropic "Current week (all models)" is at 80% (limit 75%)');
    expect(reason).toContain("2026-10-14T15:00:00Z");
  });

  it("allows runs under the threshold and ignores windows without a percentage", async () => {
    expect(await subscriptionQuotaBlockReason("claude_local", { env, fetcher: async () => [anthropic(74)] })).toBeNull();
  });

  it("only looks at the provider behind the agent's adapter", async () => {
    const fetcher = async () => [anthropic(95)];
    expect(await subscriptionQuotaBlockReason("codex_local", { env, fetcher })).toBeNull();
    expect(await subscriptionQuotaBlockReason("http", { env, fetcher })).toBeNull();
  });

  it("fails open when the provider quota lookup errors", async () => {
    expect(
      await subscriptionQuotaBlockReason("claude_local", {
        env,
        fetcher: async () => [{ provider: "anthropic", ok: false, error: "timeout", windows: [] } as ProviderQuotaResult],
      }),
    ).toBeNull();
    resetSubscriptionQuotaGuardCacheForTests();
    expect(
      await subscriptionQuotaBlockReason("claude_local", {
        env,
        fetcher: async () => {
          throw new Error("network down");
        },
      }),
    ).toBeNull();
  });

  it("caches quota lookups for five minutes", async () => {
    const fetcher = vi.fn(async () => [anthropic(10)]);
    await subscriptionQuotaBlockReason("claude_local", { env, fetcher, now: 1_000_000 });
    await subscriptionQuotaBlockReason("claude_local", { env, fetcher, now: 1_000_000 + 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("subscription quota fallback", () => {
  beforeEach(() => {
    resetSubscriptionQuotaGuardCacheForTests();
  });

  const config = {
    model: "claude-sonnet-5",
    instructionsFilePath: "/agents/athena/AGENTS.md",
    memoryDigest: true,
    timeoutSec: 1800,
    claudeDeniedTools: ["Task"],
    quotaFallback: { adapterType: "antigravity_local", model: "claude-sonnet-4-6", config: { effort: "medium" } },
  };

  it("plans a run on the fallback adapter when the primary subscription is hot", async () => {
    const plan = await resolveSubscriptionQuotaFallback("claude_local", config, { env, fetcher: async () => [anthropic(90)] });
    expect(plan?.adapterType).toBe("antigravity_local");
    expect(plan?.reason).toContain("is at 90%");
    expect(plan?.config).toEqual({
      instructionsFilePath: "/agents/athena/AGENTS.md",
      memoryDigest: true,
      timeoutSec: 1800,
      model: "claude-sonnet-4-6",
      effort: "medium",
    });
  });

  it("does nothing when the primary has headroom or no fallback is configured", async () => {
    expect(await resolveSubscriptionQuotaFallback("claude_local", config, { env, fetcher: async () => [anthropic(10)] })).toBeNull();
    resetSubscriptionQuotaGuardCacheForTests();
    const { quotaFallback: _unused, ...withoutFallback } = config;
    expect(await resolveSubscriptionQuotaFallback("claude_local", withoutFallback, { env, fetcher: async () => [anthropic(90)] })).toBeNull();
  });

  it("drops the primary's AI connection identity from the carried env", async () => {
    const withEnv = {
      ...config,
      env: {
        HOME: "/tmp/paperclip-ai-x",
        XDG_CONFIG_HOME: "/tmp/paperclip-ai-x/config",
        CLAUDE_CONFIG_DIR: "/tmp/paperclip-ai-x/provider",
        CLAUDE_CODE_OAUTH_TOKEN: "secret",
        COMPANY_REGION: "PT",
      },
    };
    const plan = await resolveSubscriptionQuotaFallback("claude_local", withEnv, { env, fetcher: async () => [anthropic(90)] });
    expect(plan?.config.env).toEqual({ COMPANY_REGION: "PT" });
  });

  it("does not fall back onto a provider that is also over the threshold", async () => {
    const hotBoth = async () => [
      anthropic(90),
      { provider: "openai", ok: true, windows: [{ label: "5h limit", usedPercent: 95, resetsAt: null, valueLabel: null, detail: null }] } as ProviderQuotaResult,
    ];
    const toCodex = { ...config, quotaFallback: { adapterType: "codex_local" } };
    expect(await resolveSubscriptionQuotaFallback("claude_local", toCodex, { env, fetcher: hotBoth })).toBeNull();
  });
});
