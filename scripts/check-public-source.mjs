import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Print paths and finding types only; never print a matched credential.
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["provider API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["frontend secret", /^\s*VITE_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s#\r\n]+/m],
];
const configured = new Set();
for (const file of [".env", ".env.ai", ".env.local", ".env.production", "provider.env", "video.env"]) {
  if (!existsSync(file)) continue;
  for (const [name, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(name) && value.length >= 12) configured.add(value);
  }
}
const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(Boolean);
const findings = [];
for (const file of files) {
  if (/(^|\/)(?:\.env(?:\..+)?|[^/]+\.env|[^/]+\.(?:pem|key|p12|pfx))$/.test(file) && !/\.example$/.test(file))
    findings.push({ file, reason: "private environment or credential file" });
  if (/^(?:\.artifacts|runtime|deliverables|\.mouva-ai)\//.test(file))
    findings.push({ file, reason: "private runtime or artifact" });
  if (!existsSync(file)) continue;
  const buffer = readFileSync(file);
  if ([...configured].some(value => buffer.includes(Buffer.from(value)))) findings.push({ file, reason: "configured secret" });
  if (buffer.includes(0)) continue;
  const source = buffer.toString("utf8");
  for (const [reason, pattern] of patterns) if (pattern.test(source)) findings.push({ file, reason });
}
if (findings.length) {
  console.error("Public source check failed. Remove private data before pushing:");
  for (const { file, reason } of findings) console.error(`- ${file}: ${reason}`);
  process.exitCode = 1;
} else {
  console.log(`Public source check passed (${files.length} tracked files).`);
}
