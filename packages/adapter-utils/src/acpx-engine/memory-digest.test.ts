import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderMemoryDigestNote } from "./execute.js";

describe("renderMemoryDigestNote", () => {
  let agentHome: string;

  beforeEach(async () => {
    agentHome = await fs.mkdtemp(path.join(os.tmpdir(), "memory-digest-"));
  });

  afterEach(async () => {
    await fs.rm(agentHome, { recursive: true, force: true });
  });

  async function writeDigest(content: string) {
    await fs.mkdir(path.join(agentHome, "memory"), { recursive: true });
    await fs.writeFile(path.join(agentHome, "memory", "DIGEST.md"), content);
  }

  it("is off unless the agent opts in", async () => {
    await writeDigest("Client ACME prefers Portuguese reports.");
    expect(await renderMemoryDigestNote({}, { AGENT_HOME: agentHome })).toBe("");
    expect(await renderMemoryDigestNote({ memoryDigest: "yes" }, { AGENT_HOME: agentHome })).toBe("");
  });

  it("injects the saved digest with update guidance", async () => {
    await writeDigest("Client ACME prefers Portuguese reports.\n");
    const note = await renderMemoryDigestNote({ memoryDigest: true }, { AGENT_HOME: agentHome });
    expect(note).toContain("## Memory digest");
    expect(note).toContain("Client ACME prefers Portuguese reports.");
    expect(note).toContain("$AGENT_HOME/memory/DIGEST.md");
    expect(note).toContain("under 6000 characters");
  });

  it("tells a first run that no digest exists yet", async () => {
    const note = await renderMemoryDigestNote({ memoryDigest: true }, { AGENT_HOME: agentHome });
    expect(note).toContain("(empty: no digest saved yet)");
  });

  it("caps an oversized digest", async () => {
    await writeDigest("x".repeat(500));
    const note = await renderMemoryDigestNote({ memoryDigest: true, memoryDigestMaxChars: 100 }, { AGENT_HOME: agentHome });
    expect(note).toContain(`${"x".repeat(100)}\n[digest truncated at 100 characters]`);
    expect(note).not.toContain("x".repeat(101));
  });

  it("does nothing without an agent home", async () => {
    expect(await renderMemoryDigestNote({ memoryDigest: true }, {})).toBe("");
  });
});
