import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AdapterModel } from "@paperclipai/adapter-utils";

const execFileAsync = promisify(execFile);

/** Parse `agy models` output: one "id<TAB>label" line per model after a status line. */
export function parseAgyModels(stdout: string): AdapterModel[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 2 && /^[a-z0-9][a-z0-9.\-]*$/i.test(parts[0]!.trim()))
    .map(([id, label]) => ({ id: id!.trim(), label: label!.trim() || id!.trim() }));
}

export async function runAgy(command: string, args: string[], timeoutMs = 60_000) {
  return execFileAsync(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, env: process.env });
}

export async function listAgyModels(command = "agy"): Promise<AdapterModel[]> {
  const { stdout } = await runAgy(command, ["models"]);
  return parseAgyModels(stdout);
}
