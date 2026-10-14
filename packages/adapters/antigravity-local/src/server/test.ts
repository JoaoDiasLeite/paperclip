import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_MODEL } from "../index.js";
import { parseAgyModels, runAgy } from "./models.js";
import { isAgyAuthRequiredError } from "./parse.js";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const command = asString(ctx.config.command, "agy");
  const model = asString(ctx.config.model, DEFAULT_MODEL);

  try {
    const { stdout } = await runAgy(command, ["--version"], 20_000);
    checks.push({ level: "info", message: `Antigravity CLI ${stdout.trim()} detected`, code: "agy_detected" });
  } catch (err) {
    checks.push({
      level: "error",
      message: `Could not run "${command} --version": ${err instanceof Error ? err.message : String(err)}`,
      hint: "Install the Antigravity CLI and make sure it is on the Paperclip service PATH.",
      code: "agy_missing",
    });
  }

  if (!checks.some((check) => check.level === "error")) {
    try {
      const { stdout, stderr } = await runAgy(command, ["models"]);
      const available = parseAgyModels(stdout);
      if (available.length === 0 && isAgyAuthRequiredError(`${stdout}\n${stderr}`)) {
        checks.push({
          level: "error",
          message: "agy is not signed in for the Paperclip service user.",
          hint: "Run `agy` once interactively as that user and sign in with the Google account.",
          code: "agy_auth_required",
        });
      } else if (!available.some((entry) => entry.id === model)) {
        checks.push({
          level: "warn",
          message: `Model "${model}" is not in \`agy models\` (${available.map((entry) => entry.id).join(", ") || "none"}).`,
          code: "agy_model_unavailable",
        });
      } else {
        checks.push({ level: "info", message: `Signed in; model "${model}" is available.`, code: "agy_ready" });
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      checks.push({
        level: isAgyAuthRequiredError(text) ? "error" : "warn",
        message: `Could not list agy models: ${text}`,
        code: isAgyAuthRequiredError(text) ? "agy_auth_required" : "agy_models_failed",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: checks.some((check) => check.level === "error")
      ? "fail"
      : checks.some((check) => check.level === "warn")
        ? "warn"
        : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
