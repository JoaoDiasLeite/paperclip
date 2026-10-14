-- Budget incidents and quota-guard deferrals since the last alert run (:'since').
-- Used by alerts.sh; one line per event, newest last.
SELECT format('%s budget %s on %s: %s of %s (%s)',
              CASE i.threshold_type WHEN 'hard' THEN 'HARD STOP' ELSE 'Warning' END,
              p.metric, coalesce(a.name, i.scope_type), i.amount_observed, i.amount_limit,
              CASE WHEN i.threshold_type = 'hard' THEN 'agent paused' ELSE 'at warn threshold' END)
FROM budget_incidents i
JOIN budget_policies p ON p.id = i.policy_id
LEFT JOIN agents a ON a.id = i.scope_id AND i.scope_type = 'agent'
WHERE i.created_at > :'since'
UNION ALL
SELECT format('Quota guard deferred %s run(s) for %s: %s', count(*), a.name, max(w.error))
FROM agent_wakeup_requests w
JOIN agents a ON a.id = w.agent_id
WHERE w.status = 'skipped'
  AND w.reason = 'budget.blocked'
  AND w.error LIKE 'Subscription quota guard%'
  AND w.requested_at > :'since'
GROUP BY a.name;
