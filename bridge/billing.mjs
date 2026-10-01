import { ApiError } from "./providers.mjs";

export function billingConfig(env, authMode) {
  if (authMode !== "mouva") return { billingMode: "local" };
  const billingUrl = (env.MOUVA_BILLING_URL || "").replace(/\/$/, "");
  const billingSecret = env.MOUVA_BILLING_SECRET || "";
  if (billingUrl) {
    const url = new URL(billingUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("MOUVA_BILLING_URL must be a fixed HTTPS service URL.");
  }
  return {
    billingMode: "mouva",
    billingUrl,
    billingSecret,
    billingEnabled: env.MOUVA_MEDIA_BILLING_ENABLED === "true",
  };
}
const codes = {
  AI_CREDIT_LIMIT_REACHED:
    "Your shared Mouva balance is too low. Check your credits and subscription.",
  VIDEO_QUOTE_CHANGED:
    "The price has changed. Review the updated quote before generating.",
  VIDEO_OPERATION_SETTLED:
    "This request has already finished. Open its saved result.",
};
export class VideoBilling {
  constructor(config, { billingFetch = fetch } = {}) {
    this.config = config;
    this.fetch = billingFetch;
    this.releaseEpoch = null;
    this.releaseEpochExpiresAt = 0;
  }
  get hosted() {
    return this.config.billingMode === "mouva";
  }
  get enabled() {
    return this.hosted && this.config.billingEnabled === true;
  }
  get ready() {
    return (
      !this.hosted ||
      !!(this.config.billingUrl && this.config.billingSecret?.length >= 32)
    );
  }
  async call(action, body) {
    if (!this.ready)
      throw new ApiError(
        503,
        "Shared Mouva billing is not connected yet.",
        "BILLING_UNAVAILABLE",
      );
    try {
      const send = async () =>
        this.fetch(this.config.billingUrl + "/" + action, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.config.billingSecret,
            "X-Mouva-Release-Epoch": await this.currentReleaseEpoch(),
          },
          body: JSON.stringify(body),
        });
      let response = await send();
      let result = await response.json();
      // The master fence rejects stale epochs before a billing operation runs.
      // Refresh only that explicit rejection, retaining the operation identity.
      if (response.status === 409 && result.code === "RELEASE_EPOCH_MISMATCH") {
        this.releaseEpochExpiresAt = 0;
        response = await send();
        result = await response.json();
      }
      if (!response.ok)
        throw new ApiError(
          response.status,
          codes[result.code] ||
            "Your Mouva credits could not be checked. Please try again.",
          result.code || "BILLING_UNAVAILABLE",
        );
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "Your Mouva credits could not be checked. Please try again.",
        "BILLING_UNAVAILABLE",
      );
    }
  }
  async currentReleaseEpoch() {
    if (this.releaseEpoch && this.releaseEpochExpiresAt > Date.now())
      return this.releaseEpoch;
    const healthUrl = new URL("/api/health", this.config.billingUrl);
    const response = await this.fetch(healthUrl.href, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Master release health unavailable");
    const health = await response.json();
    if (
      typeof health.releaseEpoch !== "string" ||
      !health.releaseEpoch ||
      health.writesOpen !== true ||
      health.trafficReady !== true
    )
      throw new Error("Master billing write authority unavailable");
    this.releaseEpoch = health.releaseEpoch;
    this.releaseEpochExpiresAt = Date.now() + 30000;
    return this.releaseEpoch;
  }
  async quote(spec) {
    if (!this.hosted)
      return {
        version: "local",
        credits: 0,
        product: "mouva-studio",
        spec,
        mode: "local",
      };
    return { ...(await this.call("quote", { spec })), mode: "mouva" };
  }
  async balance(userId) {
    return this.hosted
      ? this.call("balance", { userId })
      : { credits: null, reservedCredits: 0, history: [], mode: "local" };
  }
  async reserve(userId, operationId, spec, approval) {
    if (!this.hosted) return { quote: await this.quote(spec), reserved: false };
    if (!userId)
      throw new ApiError(
        401,
        "Sign in again to connect your shared Mouva balance.",
        "AUTH_REQUIRED",
      );
    return this.call("reserve", {
      userId,
      operationId,
      spec,
      version: approval?.version,
      maxCredits: approval?.maxCredits,
    });
  }
  async settle(userId, operationId, outcome) {
    return this.hosted
      ? this.call("settle", { userId, operationId, outcome })
      : { outcome, chargedCredits: 0 };
  }
}
export const productionBillingSpec = (input) => ({
  kind: "production",
  mode: input.mode,
  seconds: input.scene.duration,
  resolution: input.resolution,
  ratio: input.ratio,
  reviseScene: input.reviseScene,
});
