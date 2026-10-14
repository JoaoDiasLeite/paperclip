/**
 * Self-contained UI transcript parser for antigravity_local (Paperclip UI parser contract 1.0.0).
 * Zero imports: the host serves this file to the browser and evaluates it.
 * Input lines are agy `--output-format stream-json` events; Paperclip's own "[paperclip] ..." lines pass through.
 */

type TranscriptEntry =
  | { kind: "assistant"; ts: string; text: string }
  | { kind: "system"; ts: string; text: string }
  | { kind: "tool_call"; ts: string; name: string; input: unknown; toolUseId: string }
  | { kind: "tool_result"; ts: string; toolUseId: string; content: string; isError: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function describeUsage(raw: unknown): string {
  const usage = record(raw);
  if (!usage) return "";
  const parts = [
    `in ${usage.input_tokens ?? 0}`,
    `cache ${usage.cache_read_tokens ?? 0}`,
    `out ${usage.output_tokens ?? 0}`,
  ];
  if (typeof usage.thinking_tokens === "number" && usage.thinking_tokens > 0) parts.push(`thinking ${usage.thinking_tokens}`);
  return ` (${parts.join(", ")})`;
}

export function createStdoutParser() {
  const openTools = new Map<string, string>();

  function parseLine(line: string, ts: string): TranscriptEntry[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (!trimmed.startsWith("{")) return [{ kind: "system", ts, text: trimmed }];

    let event: Record<string, unknown> | null = null;
    try {
      event = record(JSON.parse(trimmed));
    } catch {
      return [{ kind: "system", ts, text: trimmed }];
    }
    if (!event) return [];

    if (event.event === "init") {
      const init = record(event.init);
      return [{ kind: "system", ts, text: `agy conversation ${String(event.conversation_id ?? "?")} · ${String(init?.model ?? "")}` }];
    }

    if (event.event === "step_update") {
      const step = record(event.step_update);
      if (!step) return [];
      const stepType = String(step.step_type ?? "");
      const stepKey = `${String(step.conversation_id ?? "")}:${String(step.step_index ?? "")}`;
      if (stepType === "user_input") return [];
      if (stepType === "agent_response") {
        return typeof step.text_delta === "string" && step.text_delta.trim()
          ? [{ kind: "assistant", ts, text: step.text_delta }]
          : [];
      }
      // Any other step is a tool or action: show its start once and its completion as a result.
      // agy 1.3 tool steps: { step_type: "tool", tool_name, tool_info: { name, parameters, output } }.
      const toolInfo = record(step.tool_info);
      const name = String(step.tool_name ?? toolInfo?.name ?? step.name ?? stepType ?? "step");
      const input = toolInfo?.parameters ?? step.input ?? step.args ?? {};
      if (step.state === "ACTIVE" && !openTools.has(stepKey)) {
        openTools.set(stepKey, name);
        return [{ kind: "tool_call", ts, name, input, toolUseId: stepKey }];
      }
      if (step.state === "DONE" || step.state === "ERROR" || step.state === "FAILED") {
        const entries: TranscriptEntry[] = [];
        if (!openTools.has(stepKey)) entries.push({ kind: "tool_call", ts, name, input, toolUseId: stepKey });
        openTools.delete(stepKey);
        const output = toolInfo?.output ?? toolInfo?.error ?? step.output ?? step.error ?? step.text_delta ?? "";
        entries.push({
          kind: "tool_result",
          ts,
          toolUseId: stepKey,
          content: typeof output === "string" ? output : JSON.stringify(output),
          isError: step.state !== "DONE",
        });
        return entries;
      }
      return [];
    }

    if (event.event === "result") {
      const result = record(event.result);
      return [
        {
          kind: "system",
          ts,
          text: `agy ${String(result?.status ?? "finished")} in ${String(result?.num_turns ?? "?")} turn(s)${describeUsage(result?.usage)}`,
        },
      ];
    }

    return [{ kind: "system", ts, text: trimmed }];
  }

  return {
    parseLine,
    reset() {
      openTools.clear();
    },
  };
}

const sharedParser = createStdoutParser();

export function parseStdoutLine(line: string, ts: string): TranscriptEntry[] {
  return sharedParser.parseLine(line, ts);
}
