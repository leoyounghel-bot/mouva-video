import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("public-source guard accepts empty examples and rejects private files and credentials without printing values", () => {
  const root = mkdtempSync(join(tmpdir(), "mouva-public-source-"));
  const script = fileURLToPath(new URL("../scripts/check-public-source.mjs", import.meta.url));
  const check = () => spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  const add = (...files) => execFileSync("git", ["add", ...files], { cwd: root });
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(join(root, ".env.ai.example"), "GEMINI_API_KEY=\nMOUVA_SESSION_SECRET=\n");
    add(".env.ai.example");
    assert.equal(check().status, 0);

    const token = "AIza" + "A".repeat(35); // Synthetic, structurally valid fixture.
    writeFileSync(join(root, "leaked.ts"), `export const key = ${JSON.stringify(token)};\n`);
    add("leaked.ts");
    let result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /leaked\.ts: Google API key/);
    assert.ok(!result.stderr.includes(token));
    execFileSync("git", ["rm", "--cached", "leaked.ts"], { cwd: root });

    writeFileSync(join(root, "provider.env"), "PROVIDER_KEY=\n");
    add("provider.env");
    result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /provider\.env: private environment/);
    execFileSync("git", ["rm", "--cached", "provider.env"], { cwd: root });

    const custom = "synthetic-secret-" + "Z".repeat(24);
    writeFileSync(join(root, ".env.ai"), `CUSTOM_API_KEY=${custom}\n`);
    writeFileSync(join(root, "leaked.ts"), `export const value = ${JSON.stringify(custom)};\n`);
    add("leaked.ts");
    result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /leaked\.ts: configured secret/);
    assert.ok(!result.stderr.includes(custom));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
