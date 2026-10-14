import { describe, expect, it } from "vitest";
import { parseAgyModels } from "./models.js";
import { isAgyAuthRequiredError, isAgyUnknownConversationError, parseAgyStreamJson } from "./parse.js";

// Captured from `agy --print --output-format stream-json` 1.3.5 (tool list shortened).
const SUCCESS_RUN = [
  '{"event": "init", "conversation_id": "cd6db52a", "init": {"model": "gemini-3.8-flash-low", "cwd": "/tmp/agy-probe", "tools": ["run_command"]}}',
  '{"event": "step_update", "step_update": {"conversation_id": "cd6db52a", "step_index": 0, "state": "DONE", "step_type": "user_input"}}',
  '{"event": "step_update", "step_update": {"conversation_id": "cd6db52a", "step_index": 1, "state": "ACTIVE", "step_type": "agent_response", "text_delta": "OK"}}',
  '{"event": "step_update", "step_update": {"conversation_id": "cd6db52a", "step_index": 1, "state": "DONE", "step_type": "agent_response", "text_delta": "\\n", "duration_seconds": 2.7, "usage": {"input_tokens": 11818, "output_tokens": 1, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 11819}}}',
  '{"event": "result", "result": {"conversation_id": "cd6db52a", "status": "SUCCESS", "response": "OK\\n", "duration_seconds": 2.8, "num_turns": 1, "usage": {"input_tokens": 11818, "output_tokens": 1, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 11819}}}',
].join("\n");

describe("parseAgyStreamJson", () => {
  it("reads conversation, model, final message and usage from a successful run", () => {
    expect(parseAgyStreamJson(SUCCESS_RUN)).toEqual({
      conversationId: "cd6db52a",
      model: "gemini-3.8-flash-low",
      status: "SUCCESS",
      finalMessage: "OK",
      numTurns: 1,
      usage: { inputTokens: 11818, cachedInputTokens: 0, outputTokens: 1, thinkingTokens: 0 },
      errors: [],
    });
  });

  it("sums per-step usage and joins streamed text when the result event is missing", () => {
    const partial = [
      '{"event": "step_update", "step_update": {"conversation_id": "c1", "step_index": 1, "state": "DONE", "step_type": "agent_response", "text_delta": "Hello", "usage": {"input_tokens": 100, "output_tokens": 5, "thinking_tokens": 7, "cache_read_tokens": 40}}}',
      '{"event": "step_update", "step_update": {"conversation_id": "c1", "step_index": 3, "state": "DONE", "step_type": "agent_response", "text_delta": "World", "usage": {"input_tokens": 50, "output_tokens": 2, "thinking_tokens": 0, "cache_read_tokens": 60}}}',
      "not json at all",
    ].join("\n");
    const parsed = parseAgyStreamJson(partial);
    expect(parsed.conversationId).toBe("c1");
    expect(parsed.finalMessage).toBe("Hello\n\nWorld");
    expect(parsed.usage).toEqual({ inputTokens: 150, cachedInputTokens: 100, outputTokens: 7, thinkingTokens: 7 });
  });

  it("reports a non-success status as an error", () => {
    const failed = '{"event": "result", "result": {"conversation_id": "c2", "status": "CANCELLED", "num_turns": 0}}';
    expect(parseAgyStreamJson(failed).errors).toEqual(["agy finished with status CANCELLED"]);
  });
});

describe("agy error detection", () => {
  it("recognises sign-in and unknown-conversation failures", () => {
    expect(isAgyAuthRequiredError("Error: Please sign in to view available models.")).toBe(true);
    expect(isAgyAuthRequiredError("rate limited")).toBe(false);
    expect(isAgyUnknownConversationError("Error: conversation 1234 not found")).toBe(true);
    expect(isAgyUnknownConversationError("tool failed")).toBe(false);
  });
});

describe("parseAgyModels", () => {
  it("parses id and label columns and skips the status line", () => {
    const output = "Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n";
    expect(parseAgyModels(output)).toEqual([
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
    ]);
  });
});
