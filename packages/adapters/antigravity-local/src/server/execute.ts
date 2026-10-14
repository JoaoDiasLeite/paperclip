import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  DEFAULT_PAPERCLIP_CONVERSATION_PROMPT_TEMPLATE,
  ensureAbsoluteDirectory,
  ensurePathInEnv,
  hydrateFreshSessionHandoff,
  joinPromptSections,
  parseObject,
  readPaperclipIssueWorkModeFromContext,
  refreshPaperclipWorkspaceEnvForExecution,
  renderMemoryDigestNote,
  renderTemplate,
  runChildProcess,
  selectInitialCommunicationGuidance,
  selectPaperclipPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_MODEL, type } from "../index.js";
import {
  isAgyAuthRequiredError,
  isAgyUnknownConversationError,
  parseAgyStreamJson,
  type AgyParsedRun,
} from "./parse.js";

// Linux limits a single argv string to 128 KiB; the prompt travels as one argument.
const MAX_PROMPT_CHARS = 120_000;

function readTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const command = asString(config.command, "agy");
  const model = asString(config.model, DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const effort = asString(config.effort, "").trim();
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);
  const extraArgs = asStringArray(config.extraArgs);
  // Print mode cannot answer permission prompts, so headless runs auto-approve unless disabled.
  const skipPermissions = config.dangerouslySkipPermissions !== false;

  // Working directory: Paperclip's workspace first, then the configured cwd.
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const agentHome = asString(workspaceContext.agentHome, "");
  const configuredCwd = asString(config.cwd, "");
  const preferConfigured = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = preferConfigured ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  // Environment: Paperclip identity, wake context, workspace and the run's API token.
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {
    ...buildPaperclipEnv(agent),
    ...buildRuntimeToolsEnv(ctx.runtimeTools),
    PAPERCLIP_RUN_ID: runId,
  };
  const wakeTaskId = readTrimmed(context.taskId) ?? readTrimmed(context.issueId);
  const wakeReason = readTrimmed(context.wakeReason);
  const wakeCommentId = readTrimmed(context.wakeCommentId) ?? readTrimmed(context.commentId);
  const approvalId = readTrimmed(context.approvalId);
  const approvalStatus = readTrimmed(context.approvalStatus);
  const linkedIssueIds = Array.isArray(context.issueIds)
    ? context.issueIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const issueWorkMode = readPaperclipIssueWorkModeFromContext(context);
  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (issueWorkMode) env.PAPERCLIP_ISSUE_WORK_MODE = issueWorkMode;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (linkedIssueIds.length > 0) env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds.join(",");
  refreshPaperclipWorkspaceEnvForExecution({
    env,
    envConfig,
    workspaceCwd: effectiveWorkspaceCwd,
    workspaceSource,
    workspaceId: asString(workspaceContext.workspaceId, ""),
    workspaceRepoUrl: asString(workspaceContext.repoUrl, ""),
    workspaceRepoRef: asString(workspaceContext.repoRef, ""),
    workspaceHints: Array.isArray(context.paperclipWorkspaces)
      ? context.paperclipWorkspaces.filter(
          (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
        )
      : [],
    agentHome,
    executionTargetIsRemote: false,
    executionCwd: cwd,
  });
  if (authToken) env.PAPERCLIP_API_KEY = authToken;

  const runtimeEnv = Object.fromEntries(
    Object.entries(ensurePathInEnv({ ...process.env, ...env })).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const loggedEnv = buildInvocationEnvForLogs(env, { runtimeEnv, includeRuntimeKeys: ["HOME"], resolvedCommand: command });

  // agy has no system-prompt flag, so managed instructions lead the first prompt of a conversation.
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  const resolvedInstructionsPath = instructionsFilePath ? path.resolve(cwd, instructionsFilePath) : "";
  const commandNotes: string[] = [];
  let instructions = "";
  if (resolvedInstructionsPath) {
    try {
      instructions =
        `${(await fs.readFile(resolvedInstructionsPath, "utf8")).trim()}\n\n` +
        `The above agent instructions were loaded from ${resolvedInstructionsPath}. ` +
        `Resolve any relative file references from ${path.dirname(resolvedInstructionsPath)}/.`;
      commandNotes.push(`Loaded agent instructions from ${resolvedInstructionsPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog("stderr", `[paperclip] Warning: could not read agent instructions file "${resolvedInstructionsPath}": ${reason}\n`);
      commandNotes.push(`Configured instructionsFilePath ${resolvedInstructionsPath}, but file could not be read.`);
    }
  }

  const customPromptTemplate = asString(config.promptTemplate, "");
  const promptTemplate =
    customPromptTemplate.trim().length > 0
      ? customPromptTemplate
      : context.conversationMode === true
        ? DEFAULT_PAPERCLIP_CONVERSATION_PROMPT_TEMPLATE
        : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE;
  const bootstrapPromptTemplate = asString(config.bootstrapPromptTemplate, "");
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const memoryDigestNote = await renderMemoryDigestNote(config, env);

  // Resume the stored conversation only in the same working directory.
  const stored = parseObject(runtime.sessionParams);
  const storedConversationId = readTrimmed(stored.sessionId) ?? readTrimmed(runtime.sessionId);
  const storedCwd = readTrimmed(stored.cwd);
  const canResume = Boolean(storedConversationId) && (!storedCwd || path.resolve(storedCwd) === path.resolve(cwd));
  if (storedConversationId && !canResume) {
    commandNotes.push(`Stored conversation ${storedConversationId} belongs to ${storedCwd}; starting fresh in ${cwd}.`);
  }

  const runAttempt = async (resumeId: string | null) => {
    const resumed = resumeId !== null;
    await hydrateFreshSessionHandoff(ctx, { resumedSession: resumed });
    const sections = selectPaperclipPromptSections(context, { resumedSession: resumed, includeCommunicationGuidance: false });
    const bootstrapPrompt =
      !resumed && bootstrapPromptTemplate.trim().length > 0 ? renderTemplate(bootstrapPromptTemplate, templateData).trim() : "";
    const heartbeatPrompt = resumed && sections.wakePrompt.length > 0 ? "" : renderTemplate(promptTemplate, templateData);
    const sessionHandoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();
    const instructionsSection = resumed ? "" : instructions;
    let prompt = joinPromptSections([
      instructionsSection,
      bootstrapPrompt,
      selectInitialCommunicationGuidance(context, { resumedSession: resumed }),
      sections.wakePrompt,
      sessionHandoffNote,
      memoryDigestNote,
      sections.taskContextNote,
      heartbeatPrompt,
    ]);
    if (prompt.length > MAX_PROMPT_CHARS) {
      await onLog("stderr", `[paperclip] Prompt truncated from ${prompt.length} to ${MAX_PROMPT_CHARS} characters.\n`);
      prompt = prompt.slice(0, MAX_PROMPT_CHARS);
    }

    const args = ["--output-format", "stream-json", "--model", model];
    if (effort) args.push("--effort", effort);
    if (skipPermissions) args.push("--dangerously-skip-permissions");
    if (resumeId) args.push("--conversation", resumeId);
    if (agentHome && path.resolve(agentHome) !== path.resolve(cwd)) args.push("--add-dir", agentHome);
    args.push(...extraArgs, "--print", prompt);

    if (onMeta) {
      await onMeta({
        adapterType: type,
        command,
        cwd,
        commandNotes,
        commandArgs: [...args.slice(0, -1), `<prompt: ${prompt.length} chars>`],
        env: loggedEnv,
        prompt,
        promptMetrics: {
          promptChars: prompt.length,
          instructionsChars: instructionsSection.length,
          bootstrapPromptChars: bootstrapPrompt.length,
          wakePromptChars: sections.wakePrompt.length,
          sessionHandoffChars: sessionHandoffNote.length,
          memoryDigestChars: memoryDigestNote.length,
          taskContextChars: sections.taskContextNote.length,
          heartbeatPromptChars: heartbeatPrompt.length,
        },
        context,
      });
    }

    const proc = await runChildProcess(runId, command, args, { cwd, env, timeoutSec, graceSec, onLog, onSpawn });
    return { proc, parsed: parseAgyStreamJson(proc.stdout) };
  };

  let attempt = await runAttempt(canResume ? storedConversationId : null);
  let clearSession = false;
  const failed = (run: { proc: { exitCode: number | null; timedOut: boolean }; parsed: AgyParsedRun }) =>
    !run.proc.timedOut && ((run.proc.exitCode ?? 0) !== 0 || run.parsed.errors.length > 0);
  if (canResume && failed(attempt)) {
    const text = `${attempt.parsed.errors.join("\n")}\n${attempt.proc.stderr}`;
    if (isAgyUnknownConversationError(text)) {
      await onLog("stderr", `[paperclip] agy could not resume conversation ${storedConversationId}; retrying fresh.\n`);
      attempt = await runAttempt(null);
      clearSession = true;
    }
  }

  const { proc, parsed } = attempt;
  const diagnostics = `${parsed.errors.join("\n")}\n${proc.stderr}`;
  const parsedError = parsed.errors.find((message) => message.trim().length > 0) ?? "";
  const exitCode = (proc.exitCode ?? 0) === 0 && parsedError ? 1 : proc.exitCode;
  const succeeded = !proc.timedOut && (exitCode ?? 0) === 0;
  const authRequired = !succeeded && isAgyAuthRequiredError(diagnostics);
  const conversationId = parsed.conversationId;

  return {
    exitCode,
    signal: proc.signal,
    timedOut: proc.timedOut,
    errorMessage: succeeded
      ? null
      : authRequired
        ? "agy is not signed in on this host. Run `agy` once interactively as the Paperclip service user."
        : parsedError || firstNonEmptyLine(proc.stderr) || `agy exited with code ${proc.exitCode ?? -1}`,
    errorCode: authRequired ? "antigravity_auth_required" : (proc.errorCode ?? null),
    usage: {
      inputTokens: parsed.usage.inputTokens,
      cachedInputTokens: parsed.usage.cachedInputTokens,
      outputTokens: parsed.usage.outputTokens + parsed.usage.thinkingTokens,
    },
    sessionId: conversationId,
    sessionParams: conversationId ? { sessionId: conversationId, cwd } : null,
    sessionDisplayId: conversationId,
    provider: "google",
    biller: "google",
    billingType: "subscription_included",
    model: parsed.model ?? model,
    costUsd: null,
    resultJson: { status: parsed.status, numTurns: parsed.numTurns, thinkingTokens: parsed.usage.thinkingTokens },
    summary: parsed.finalMessage ?? "",
    clearSession: clearSession && !conversationId,
  };
}
