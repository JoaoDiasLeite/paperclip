import type { AdapterSessionCodec, ServerAdapterModule } from "@paperclipai/adapter-utils";
import { agentConfigurationDoc, models, type } from "../index.js";
import { execute } from "./execute.js";
import { listAgyModels } from "./models.js";
import { testEnvironment } from "./test.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Session state is the agy conversation id plus the working directory it belongs to. */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sessionId = readNonEmptyString(record.sessionId) ?? readNonEmptyString(record.conversationId);
    if (!sessionId) return null;
    const cwd = readNonEmptyString(record.cwd);
    return { sessionId, ...(cwd ? { cwd } : {}) };
  },
  serialize(params: Record<string, unknown> | null) {
    return params ? this.deserialize(params) : null;
  },
  getDisplayId(params: Record<string, unknown> | null) {
    return params ? readNonEmptyString(params.sessionId) : null;
  },
};

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    sessionCodec,
    models,
    listModels: () => listAgyModels(),
    agentConfigurationDoc,
    supportsLocalAgentJwt: true,
    supportsInstructionsBundle: true,
    instructionsPathKey: "instructionsFilePath",
  };
}

export { execute, testEnvironment };
