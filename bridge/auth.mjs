import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./providers.mjs";

const SESSION = "__Host-mouva-video";
const LOGIN = "__Host-mouva-video-login";
const sha = value => createHash("sha256").update(value).digest("hex");
const equal = (a, b) => typeof a === "string" && typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookies = req => Object.fromEntries((req.headers.cookie || "").split(";").map(part => {
  const i = part.indexOf("=");
  return [part.slice(0, i).trim(), part.slice(i + 1)];
}));
const cookie = (name, value, seconds) => `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
function httpsURL(value, name, originOnly = true) {
  let u;
  try { u = new URL(value); } catch { throw new Error(`${name} must be configured with an HTTPS URL.`); }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || (originOnly && u.pathname !== "/"))
    throw new Error(`${name} must be an HTTPS ${originOnly ? "origin" : "URL"} without credentials or query parameters.`);
  return originOnly ? u.origin : u.href;
}
export function authConfig(env = process.env) {
  const authMode = env.MOUVA_AUTH_MODE || "local";
  if (!["local", "mouva"].includes(authMode)) throw new Error("MOUVA_AUTH_MODE must be local or mouva.");
  if (authMode === "local") return { authMode };
  if ((env.MOUVA_SESSION_SECRET || "").length < 32) throw new Error("MOUVA_SESSION_SECRET needs at least 32 random characters.");
  return {
    authMode,
    sessionSecret: env.MOUVA_SESSION_SECRET,
    frontendOrigin: httpsURL(env.MOUVA_FRONTEND_ORIGIN, "MOUVA_FRONTEND_ORIGIN"),
    loginOrigin: httpsURL(env.MOUVA_LOGIN_ORIGIN, "MOUVA_LOGIN_ORIGIN"),
    identityUrl: httpsURL(env.MOUVA_IDENTITY_URL, "MOUVA_IDENTITY_URL", false),
  };
}
export class VideoAuth {
  constructor(config, { identityFetch = fetch, now = Date.now } = {}) {
    this.config = config;
    this.fetch = identityFetch;
    this.now = now;
    this.directory = path.join(config.dataDir, "auth", "handoffs");
    this.attempts = [];
    this.pending = 0;
  }
  async init() {
    if (this.config.authMode !== "mouva") return this;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.clean();
    return this;
  }
  async clean() {
    const files = await readdir(this.directory);
    for (const file of files) {
      const target = path.join(this.directory, file);
      if ((await stat(target).catch(() => null))?.mtimeMs < this.now() - 120000)
        await unlink(target).catch(() => {});
    }
  }
  checkOrigin(req, origins, required = false) {
    if (!req.headers.origin && !required) return;
    if (!origins.includes(req.headers.origin)) throw new ApiError(403, "This website cannot make that request.");
  }
  start(req, res) {
    this.checkOrigin(req, [this.config.frontendOrigin], true);
    const verifier = randomBytes(32).toString("base64url");
    res.setHeader("Set-Cookie", cookie(LOGIN, verifier, 600));
    return { loginUrl: `${this.config.loginOrigin}/video?challenge=${sha(verifier)}` };
  }
  async handoff(req, body) {
    this.checkOrigin(req, [this.config.loginOrigin], true);
    const bearer = req.headers.authorization;
    if (typeof bearer !== "string" || !/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer))
      throw new ApiError(401, "Sign in to Mouva to continue.");
    if (!/^[a-f0-9]{64}$/.test(body?.challenge || "")) throw new ApiError(400, "Restart video sign-in.");
    this.attempts = this.attempts.filter(t => t > this.now() - 60000);
    if (this.pending >= 8 || this.attempts.length >= 120) throw new ApiError(429, "Please wait a moment before signing in again.");
    this.attempts.push(this.now());
    this.pending++;
    let identity;
    try {
      const response = await this.fetch(this.config.identityUrl, {
        headers: { Authorization: bearer, Accept: "application/json" },
        signal: AbortSignal.timeout(10000), redirect: "error",
      });
      if (response.status === 401 || response.status === 403) throw new ApiError(401, "Sign in to Mouva to continue.");
      if (!response.ok) throw new ApiError(503, "Mouva sign-in is temporarily unavailable.");
      identity = await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "Mouva sign-in is temporarily unavailable.");
    } finally { this.pending--; }
    const id = identity?.user?.id;
    if ((typeof id !== "string" && typeof id !== "number") || !String(id).length || String(id).length > 200)
      throw new ApiError(401, "Mouva did not confirm this account.");
    await this.clean();
    if ((await readdir(this.directory)).length >= 1000) throw new ApiError(429, "Please try signing in again shortly.");
    const code = randomBytes(32).toString("base64url");
    await writeFile(path.join(this.directory, sha(code) + ".json"), JSON.stringify({
      ownerId: sha(this.config.identityUrl + "\n" + id),
      accountId: String(id),
      challenge: body.challenge, expiresAt: this.now() + 60000,
    }), { flag: "wx", mode: 0o600 });
    return { launchUrl: this.config.frontendOrigin + "/#handoff=" + code };
  }
  sign(payload) {
    const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return value + "." + createHmac("sha256", this.config.sessionSecret).update(value).digest("base64url");
  }
  session(req) {
    const raw = cookies(req)[SESSION] || "";
    if (raw.length > 1024) return null;
    const [value, signature, extra] = raw.split(".");
    if (!value || !signature || extra || !equal(signature, createHmac("sha256", this.config.sessionSecret).update(value).digest("base64url"))) return null;
    try {
      const payload = JSON.parse(Buffer.from(value, "base64url").toString());
      if (payload.v !== 1 || !/^[a-f0-9]{64}$/.test(payload.ownerId) || !Number.isFinite(payload.exp) || payload.exp <= this.now()) return null;
      return { ownerId: payload.ownerId, expiresAt: payload.exp,
        ...(typeof payload.accountId === "string" && payload.accountId.length <= 200 ? { accountId: payload.accountId } : {}) };
    } catch { return null; }
  }
  async exchange(req, res, body) {
    this.checkOrigin(req, [this.config.frontendOrigin], true);
    const code = body?.code, verifier = cookies(req)[LOGIN];
    if (!/^[A-Za-z0-9_-]{43}$/.test(code || "") || !/^[A-Za-z0-9_-]{43}$/.test(verifier || ""))
      throw new ApiError(401, "This sign-in link has expired. Start again from Mouva.");
    const file = path.join(this.directory, sha(code) + ".json");
    let data;
    try { data = JSON.parse(await readFile(file, "utf8")); } catch { throw new ApiError(401, "This sign-in link has expired or was already used."); }
    if (data.expiresAt <= this.now() || !equal(data.challenge, sha(verifier))) throw new ApiError(401, "This sign-in belongs to another browser or has expired.");
    // Atomic rename ensures only one exchange succeeds, including across restarts.
    const claimed = file + "." + randomBytes(12).toString("hex");
    try { await rename(file, claimed); } catch { throw new ApiError(401, "This sign-in link has already been used."); }
    await unlink(claimed);
    const expiresAt = this.now() + 8 * 3600000;
    res.setHeader("Set-Cookie", [
      cookie(SESSION, this.sign({ v: 1, ownerId: data.ownerId, accountId: data.accountId, exp: expiresAt }), 8 * 3600),
      cookie(LOGIN, "", 0),
    ]);
    return { ownerId: data.ownerId, expiresAt };
  }
  logout(req, res) {
    this.checkOrigin(req, [this.config.frontendOrigin], true);
    res.setHeader("Set-Cookie", [cookie(SESSION, "", 0), cookie(LOGIN, "", 0)]);
    return { ok: true };
  }
  owner(req) {
    if (this.config.authMode === "mouva") {
      const session = this.session(req);
      if (!session) throw new ApiError(401, "Sign in to Mouva to continue.", "AUTH_REQUIRED");
      if (req.headers["x-mouva-workspace"] !== session.ownerId)
        throw new ApiError(401, "Your account changed. Sign in again in this tab.", "SESSION_CHANGED");
      this.checkOrigin(req, [this.config.frontendOrigin], !["GET", "HEAD"].includes(req.method));
      return session.ownerId;
    }
    if (this.config.accessToken && !equal(req.headers.authorization, "Bearer " + this.config.accessToken))
      throw new ApiError(401, "Enter the workspace access token in Server connection.");
    if (!this.config.accessToken && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || ""))
      throw new ApiError(403, "Invalid local host.");
    this.checkOrigin(req, [this.config.publicOrigin, new URL(this.config.renderOrigin).origin,
      "http://127.0.0.1:5173", "http://localhost:5173", "http://" + req.headers.host]);
    return "local";
  }
}
