-- One line per agent for yesterday's token usage (used by daily-report.sh).
SELECT format('%s: %s runs, in %sk, cache %sk, out %sk (~$%s API eq.)',
              agent_name, runs, round(input_tokens / 1000.0), round(cached_input_tokens / 1000.0),
              round(output_tokens / 1000.0), api_equivalent_usd)
FROM aurelfront.daily_agent_tokens
WHERE day = current_date - 1
ORDER BY agent_name;
