-- AurelFront run metrics: one row per heartbeat run with token usage and wake reason.
-- Lives in its own schema so upstream Drizzle migrations never touch it.
CREATE SCHEMA IF NOT EXISTS aurelfront;

CREATE OR REPLACE VIEW aurelfront.run_metrics AS
SELECT
  r.id                                         AS run_id,
  r.company_id,
  r.agent_id,
  a.name                                       AS agent_name,
  r.invocation_source,
  w.reason                                     AS wake_reason,
  r.status,
  r.started_at,
  r.finished_at,
  EXTRACT(EPOCH FROM (r.finished_at - r.started_at))::int AS duration_sec,
  r.usage_json->>'model'                          AS model,
  COALESCE((r.usage_json->>'inputTokens')::bigint, 0)       AS input_tokens,
  COALESCE((r.usage_json->>'cachedInputTokens')::bigint, 0) AS cached_input_tokens,
  COALESCE((r.usage_json->>'outputTokens')::bigint, 0)      AS output_tokens,
  COALESCE((r.usage_json->>'costUsd')::numeric, 0)          AS api_equivalent_usd,
  r.usage_json->>'billingType'                    AS billing_type,
  (r.context_snapshot->>'issueId')::uuid          AS issue_id
FROM heartbeat_runs r
JOIN agents a ON a.id = r.agent_id
LEFT JOIN agent_wakeup_requests w ON w.id = r.wakeup_request_id;

-- Wakes that never reached a model call (zero tokens by construction).
CREATE OR REPLACE VIEW aurelfront.skipped_wakes AS
SELECT company_id, agent_id, source, reason, requested_at
FROM agent_wakeup_requests
WHERE status = 'skipped';

-- Daily totals per agent: the baseline the fork changes are measured against.
CREATE OR REPLACE VIEW aurelfront.daily_agent_tokens AS
SELECT
  date_trunc('day', started_at)::date AS day,
  agent_name,
  count(*)                                   AS runs,
  count(*) FILTER (WHERE status = 'succeeded') AS runs_succeeded,
  sum(input_tokens)                          AS input_tokens,
  sum(cached_input_tokens)                   AS cached_input_tokens,
  sum(output_tokens)                         AS output_tokens,
  round(sum(api_equivalent_usd), 2)          AS api_equivalent_usd
FROM aurelfront.run_metrics
WHERE started_at IS NOT NULL
GROUP BY 1, 2;
