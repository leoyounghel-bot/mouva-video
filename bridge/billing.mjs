import { ApiError } from "./providers.mjs";

export function billingConfig(env, authMode) {
  if (authMode !== "mouva") return { billingMode: "local" };
  const billingUrl = (env.MOUVA_BILLING_URL || "").replace(/\/$/, "");
  const billingSecret = env.MOUVA_BILLING_SECRET || "";
  if (billingUrl) {
    const url = new URL(billingUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("MOUVA_BILLING_URL must be a fixed HTTPS service URL.");
  }
  return { billingMode: "mouva", billingUrl, billingSecret };
}
const codes = {
  AI_CREDIT_LIMIT_REACHED: "Your shared Mouva balance is too low. Check your credits and subscription.",
  VIDEO_QUOTE_CHANGED: "The price has changed. Review the updated quote before generating.",
  VIDEO_OPERATION_SETTLED: "This request has already finished. Open its saved result.",
};
export class VideoBilling {
  constructor(config, { billingFetch = fetch } = {}) { this.config = config; this.fetch = billingFetch; }
  get hosted() { return this.config.billingMode === "mouva"; }
  get ready() { return !this.hosted || !!(this.config.billingUrl && this.config.billingSecret?.length >= 32); }
  async call(action, body) {
    if (!this.ready) throw new ApiError(503, "Shared Mouva billing is not connected yet.", "BILLING_UNAVAILABLE");
    try {
      const response = await this.fetch(this.config.billingUrl + "/" + action, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.config.billingSecret },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new ApiError(response.status,
        codes[result.code] || "Your Mouva credits could not be checked. Please try again.", result.code || "BILLING_UNAVAILABLE");
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "Your Mouva credits could not be checked. Please try again.", "BILLING_UNAVAILABLE");
    }
  }
  async quote(spec) {
    if (!this.hosted) return { version: "local", credits: 0, product: "mouvie", spec, mode: "local" };
    return { ...await this.call("quote", { spec }), mode: "mouva" };
  }
  async balance(userId) {
    return this.hosted ? this.call("balance", { userId }) : { credits: null, reservedCredits: 0, history: [], mode: "local" };
  }
  async reserve(userId, operationId, spec, approval) {
    if (!this.hosted) return { quote: await this.quote(spec), reserved: false };
    if (!userId) throw new ApiError(401, "Sign in again to connect your shared Mouva balance.", "AUTH_REQUIRED");
    return this.call("reserve", { userId, operationId, spec, version: approval?.version, maxCredits: approval?.maxCredits });
  }
  async settle(userId, operationId, outcome) {
    return this.hosted ? this.call("settle", { userId, operationId, outcome }) : { outcome, chargedCredits: 0 };
  }
}
export const productionBillingSpec = input => ({
  mode: input.mode, seconds: input.scene.duration, resolution: input.resolution,
  reviseScene: input.reviseScene,
});
