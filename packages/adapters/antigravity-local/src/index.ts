export const type = "antigravity_local";
export const label = "Antigravity CLI (agy)";
export const DEFAULT_MODEL = "gemini-3.8-flash-medium";

/**
 * Models listed by `agy models` for a Google AI Pro subscription (October 2026).
 * The server also refreshes this list from the CLI at runtime.
 */
export const models = [
  { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
  { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
];

export const agentConfigurationDoc = `# antigravity_local configuration

Runs the agent with the Google Antigravity CLI (\`agy\`) in print mode on this host, billed to the
Google account signed in to \`agy\` (for example a Google AI Pro subscription).

Use when: you want an agent on a Google AI subscription, or a second subscription quota
alongside Claude/Codex agents.
Don't use when: the host has no signed-in \`agy\` (run \`agy\` once interactively as the
Paperclip service user), or you need a remote/sandboxed execution target (local only).

Core fields:
- model: an id from \`agy models\` (default ${DEFAULT_MODEL})
- effort: low | medium | high (optional)
- cwd: working directory when Paperclip provides none
- instructionsFilePath: managed AGENTS.md, prepended to the prompt
- timeoutSec / graceSec: run time limit and shutdown grace
- command: agy binary (default "agy" on PATH)
- extraArgs: extra CLI flags
- memoryDigest / memoryDigestMaxChars: inject $AGENT_HOME/memory/DIGEST.md, as for ACPX agents

Sessions resume with \`agy --conversation <id>\` while the working directory is unchanged.
Token usage is reported to Paperclip as subscription_included (no per-token charge).
`;

export { createServerAdapter } from "./server/index.js";
