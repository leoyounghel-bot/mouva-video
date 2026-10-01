// Public list prices checked 2026-10-01. Estimates are not provider invoices.
// https://docs.volcengine.com/docs/ark/model-pricing?lang=zh
// https://deepinfra.com/black-forest-labs/FLUX-2-klein-9b
// https://ai.google.dev/gemini-api/docs/pricing
export const COST_VERSION = "provider-list-prices-2026-10-01-v1";
export const REFERENCE_CNY_PER_USD = 7.613 / 1.1355; // ECB 2026-09-30.
const pixels = { "480p": 864 * 480, "720p": 1280 * 720, "1080p": 1920 * 1080 };
const integer = (value, name, maximum) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error(`Invalid ${name}.`);
  return value;
};
const positive = (value, name, maximum) => {
  if (!Number.isFinite(value) || value <= 0 || value > maximum)
    throw new Error(`Invalid ${name}.`);
  return value;
};
const usd = (value) => Math.ceil(value * 1_000_000);
export function videoUsage(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.completion_tokens) ||
    value.completion_tokens <= 0 ||
    value.completion_tokens > 100_000_000
  )
    return;
  return { completion_tokens: value.completion_tokens };
}
export function textUsage(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.inputTokens) ||
    value.inputTokens < 0 ||
    !Number.isSafeInteger(value.outputTokens) ||
    value.outputTokens < 0 ||
    value.inputTokens > 20_000_000 ||
    value.outputTokens > 20_000_000
  )
    return;
  const cachedInputTokens = value.cachedInputTokens ?? 0;
  if (
    !Number.isSafeInteger(cachedInputTokens) ||
    cachedInputTokens < 0 ||
    cachedInputTokens > value.inputTokens
  )
    return;
  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    cachedInputTokens,
  };
}

/** List-price COGS from metered provider usage, not the final invoice or a customer charge. */
export function meteredVideoCost(
  value,
  { model, resolution, hasVideoReference, cnyPerUsd = REFERENCE_CNY_PER_USD },
) {
  const usage = videoUsage(value);
  if (
    !usage ||
    model !== "doubao-seedance-2-5-260628" ||
    !Object.hasOwn(pixels, resolution) ||
    typeof hasVideoReference !== "boolean"
  )
    return;
  positive(cnyPerUsd, "exchange rate", 100);
  const rate =
    resolution === "1080p"
      ? hasVideoReference
        ? 46
        : 77
      : hasVideoReference
        ? 42
        : 70;
  const cny = (usage.completion_tokens * rate) / 1_000_000;
  const usdMicros = usd(cny / cnyPerUsd);
  return {
    version: COST_VERSION,
    estimated: false,
    source: "provider_usage_list_price",
    usdMicros,
    usd: usdMicros / 1_000_000,
    basis: {
      model,
      resolution,
      hasVideoReference,
      ...usage,
      cnyPerMillionTokens: rate,
      cny,
      cnyPerUsd,
    },
  };
}

export function estimateProviderCost(
  spec,
  { date = new Date(), cnyPerUsd = REFERENCE_CNY_PER_USD } = {},
) {
  positive(cnyPerUsd, "exchange rate", 100);
  let micros, basis;
  if (spec.kind === "video") {
    positive(spec.seconds, "video duration", 30);
    if (spec.model && spec.model !== "doubao-seedance-2-5-260628")
      throw new Error("Unpriced video model.");
    if (!Object.hasOwn(pixels, spec.resolution))
      throw new Error("Unsupported video resolution.");
    if (spec.ratio && spec.ratio !== "16:9")
      throw new Error("Only the 16:9 cost benchmark is verified.");
    const referenceSeconds = spec.referenceSeconds ?? 0;
    integer(referenceSeconds, "reference duration", 300);
    const count = spec.count ?? 1;
    if (![1, 2, 4].includes(count))
      throw new Error("Unsupported candidate count.");
    const hasReference = referenceSeconds > 0;
    const rate =
      spec.resolution === "1080p"
        ? hasReference
          ? 46
          : 77
        : hasReference
          ? 42
          : 70;
    // Benchmark is 16:9 at 24 fps. Provider token floors and other aspect
    // ratios can increase this estimate; billing quotes add a separate buffer.
    const completionTokens = Math.ceil(
      ((spec.seconds + referenceSeconds) * pixels[spec.resolution] * 24) / 1024,
    );
    const cny = ((completionTokens * rate) / 1_000_000) * count;
    micros = usd(cny / cnyPerUsd);
    basis = {
      model: "doubao-seedance-2-5-260628",
      completionTokensPerCandidate: completionTokens,
      cnyPerMillionTokens: rate,
      referenceSeconds,
      count,
      fps: 24,
      benchmarkRatio: "16:9",
      cny,
      cnyPerUsd,
      minimumTokenFloorVerified: !hasReference,
      suitableForCheckout: false,
    };
  } else if (spec.kind === "image") {
    if (spec.model && spec.model !== "black-forest-labs/FLUX-2-klein-9b")
      throw new Error("Unpriced image model.");
    integer(spec.width, "image width", 1920);
    integer(spec.height, "image height", 1920);
    if (spec.width < 128 || spec.height < 128)
      throw new Error("Unsupported image size.");
    const count = spec.count ?? 1;
    if (![1, 2, 4].includes(count))
      throw new Error("Unsupported candidate count.");
    micros = usd(
      ((((0.015 * spec.width) / 1024) * spec.height) / 1024) * count,
    );
    basis = {
      model: "black-forest-labs/FLUX-2-klein-9b",
      width: spec.width,
      height: spec.height,
      count,
    };
  } else if (spec.kind === "text") {
    const model = spec.model ?? "gemini-3.8-flash";
    if (!["gemini-3.8-flash", "gemini-3.7-flash"].includes(model))
      throw new Error("Unpriced text model.");
    const inputTokens = integer(spec.inputTokens, "input tokens", 20_000_000);
    const outputTokens = integer(
      spec.outputTokens,
      "output and thinking tokens",
      20_000_000,
    );
    const cachedInputTokens = integer(
      spec.cachedInputTokens ?? 0,
      "cached input tokens",
      inputTokens,
    );
    const instant = new Date(date).getTime();
    if (!Number.isFinite(instant)) throw new Error("Invalid price date.");
    const inputRate = instant < Date.UTC(2027, 0, 1) ? 0.75 : 1.5;
    const outputRate = inputRate * 5;
    micros = usd(
      ((inputTokens - cachedInputTokens) * inputRate +
        (cachedInputTokens * inputRate) / 10 +
        outputTokens * outputRate) /
        1_000_000,
    );
    basis = {
      model,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      inputUsdPerMillion: inputRate,
      outputUsdPerMillion: outputRate,
      cacheReadUsdPerMillion: inputRate / 10,
    };
  } else throw new Error("Unsupported provider cost kind.");
  return {
    version: COST_VERSION,
    estimated: true,
    usdMicros: micros,
    usd: micros / 1_000_000,
    basis,
  };
}

/** Explicit assumptions for review, never an automatic production price switch. */
export function costBasedCredits(
  estimate,
  {
    costBuffer = 1.25,
    markup = 4,
    creditRetailUsd = 0.01,
    overheadUsd = 0,
  } = {},
) {
  positive(costBuffer, "cost buffer", 10);
  positive(markup, "markup", 100);
  positive(creditRetailUsd, "credit value", 100);
  if (!Number.isFinite(overheadUsd) || overheadUsd < 0 || overheadUsd > 100)
    throw new Error("Invalid infrastructure overhead.");
  integer(estimate.usdMicros, "estimated cost", 1_000_000_000);
  return Math.ceil(
    (((estimate.usdMicros / 1_000_000) * costBuffer + overheadUsd) * markup) /
      creditRetailUsd,
  );
}
