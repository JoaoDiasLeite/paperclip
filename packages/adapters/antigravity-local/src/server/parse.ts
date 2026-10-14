/** Parser for `agy --print --output-format stream-json` output (one JSON event per line). */

export interface AgyUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface AgyParsedRun {
  conversationId: string | null;
  model: string | null;
  status: string | null;
  finalMessage: string | null;
  numTurns: number | null;
  usage: AgyUsage;
  errors: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function readUsage(raw: unknown): AgyUsage | null {
  const usage = asRecord(raw);
  if (!usage) return null;
  return {
    inputTokens: asCount(usage.input_tokens),
    cachedInputTokens: asCount(usage.cache_read_tokens),
    outputTokens: asCount(usage.output_tokens),
    thinkingTokens: asCount(usage.thinking_tokens),
  };
}

export function parseAgyStreamJson(stdout: string): AgyParsedRun {
  const parsed: AgyParsedRun = {
    conversationId: null,
    model: null,
    status: null,
    finalMessage: null,
    numTurns: null,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
    errors: [],
  };
  // Per-step usage, summed only if the final result carries none.
  const stepUsage: AgyUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  let resultUsage: AgyUsage | null = null;
  const textByStep = new Map<number, string>();

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let event: Record<string, unknown> | null;
    try {
      event = asRecord(JSON.parse(trimmed));
    } catch {
      continue;
    }
    if (!event) continue;

    const kind = event.event;
    if (kind === "init") {
      parsed.conversationId ??= typeof event.conversation_id === "string" ? event.conversation_id : null;
      const init = asRecord(event.init);
      if (init && typeof init.model === "string") parsed.model = init.model;
    } else if (kind === "step_update") {
      const step = asRecord(event.step_update);
      if (!step) continue;
      parsed.conversationId ??= typeof step.conversation_id === "string" ? step.conversation_id : null;
      if (step.step_type === "agent_response" && typeof step.text_delta === "string") {
        const index = typeof step.step_index === "number" ? step.step_index : -1;
        textByStep.set(index, (textByStep.get(index) ?? "") + step.text_delta);
      }
      if (step.state === "DONE") {
        const usage = readUsage(step.usage);
        if (usage) {
          stepUsage.inputTokens += usage.inputTokens;
          stepUsage.cachedInputTokens += usage.cachedInputTokens;
          stepUsage.outputTokens += usage.outputTokens;
          stepUsage.thinkingTokens += usage.thinkingTokens;
        }
      }
      if (typeof step.error === "string" && step.error.trim()) parsed.errors.push(step.error.trim());
    } else if (kind === "result") {
      const result = asRecord(event.result);
      if (!result) continue;
      parsed.conversationId = typeof result.conversation_id === "string" ? result.conversation_id : parsed.conversationId;
      parsed.status = typeof result.status === "string" ? result.status : null;
      if (typeof result.response === "string") parsed.finalMessage = result.response.trim();
      if (typeof result.num_turns === "number") parsed.numTurns = result.num_turns;
      resultUsage = readUsage(result.usage);
      if (typeof result.error === "string" && result.error.trim()) parsed.errors.push(result.error.trim());
    } else if (kind === "error") {
      const message = typeof event.message === "string" ? event.message : JSON.stringify(event.error ?? event);
      parsed.errors.push(message);
    }
  }

  parsed.usage = resultUsage ?? stepUsage;
  if (parsed.finalMessage === null && textByStep.size > 0) {
    parsed.finalMessage = [...textByStep.values()].join("\n\n").trim() || null;
  }
  if (parsed.status && parsed.status !== "SUCCESS" && parsed.errors.length === 0) {
    parsed.errors.push(`agy finished with status ${parsed.status}`);
  }
  return parsed;
}

/** True when agy could not resume the stored conversation, so the run should retry fresh. */
export function isAgyUnknownConversationError(text: string): boolean {
  return /conversation[^\n]{0,80}(not found|does not exist|unknown|invalid)|no such conversation/i.test(text);
}

/** True when agy is not signed in on this host. */
export function isAgyAuthRequiredError(text: string): boolean {
  return /please sign in|not signed in|sign in to|login required|unauthenticated/i.test(text);
}
