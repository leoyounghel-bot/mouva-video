import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateProviderCost,
  costBasedCredits,
  REFERENCE_CNY_PER_USD,
  meteredVideoCost,
  videoUsage,
  textUsage,
} from "../bridge/provider-cost.mjs";

test("video cost includes motion-reference input and every generated candidate", () => {
  const one = estimateProviderCost({
    kind: "video",
    seconds: 12,
    referenceSeconds: 12,
    resolution: "720p",
  });
  assert.equal(one.basis.completionTokensPerCandidate, 518400);
  assert.equal(one.basis.cnyPerMillionTokens, 42);
  assert.ok(Math.abs(one.usd - 21.7728 / REFERENCE_CNY_PER_USD) < 0.000001);
  const four = estimateProviderCost({
    kind: "video",
    seconds: 12,
    referenceSeconds: 12,
    resolution: "720p",
    count: 4,
  });
  assert.ok(Math.abs(four.usd - one.usd * 4) < 0.000004);
  assert.equal(four.basis.count, 4);
  assert.equal(one.basis.minimumTokenFloorVerified, false);
  assert.equal(one.basis.suitableForCheckout, false);
  assert.ok(costBasedCredits(four) >= costBasedCredits(one) * 4 - 3);
});

test("image cost scales with dimensions and count, and scheduled Gemini prices include thinking output", () => {
  assert.equal(
    estimateProviderCost({ kind: "image", width: 1024, height: 1024 }).usd,
    0.015,
  );
  assert.equal(
    estimateProviderCost({ kind: "image", width: 1024, height: 1024, count: 4 })
      .usd,
    0.06,
  );
  const spec = { kind: "text", inputTokens: 20_000, outputTokens: 10_000 };
  assert.equal(estimateProviderCost(spec, { date: "2026-10-01" }).usd, 0.0525);
  assert.equal(estimateProviderCost(spec, { date: "2027-01-01" }).usd, 0.105);
});

test("invalid cost inputs cannot underquote an operation", () => {
  for (const spec of [
    { kind: "video", seconds: 12, resolution: "720p", referenceSeconds: -1 },
    { kind: "video", seconds: 12, resolution: "720p", count: 100 },
    { kind: "video", seconds: 12, resolution: "4k" },
    { kind: "text", inputTokens: -1, outputTokens: 1 },
    { kind: "image", width: 0, height: 1024 },
    { kind: "video", seconds: 12, resolution: "toString" },
    { kind: "video", seconds: 12, resolution: "720p", ratio: "9:16" },
    { kind: "text", model: "unpriced-model", inputTokens: 1, outputTokens: 1 },
  ])
    assert.throws(() => estimateProviderCost(spec));
  assert.throws(() => costBasedCredits({ usdMicros: NaN }));
});

test("metered video cost uses provider tokens, and never fabricates missing usage", () => {
  const context = {
    model: "doubao-seedance-2-5-260628",
    resolution: "720p",
    hasVideoReference: true,
  };
  assert.equal(meteredVideoCost(undefined, context), undefined);
  assert.equal(meteredVideoCost({ completion_tokens: -1 }, context), undefined);
  assert.equal(
    meteredVideoCost(
      { completion_tokens: 600000 },
      { ...context, model: "custom" },
    ),
    undefined,
  );
  const cost = meteredVideoCost(
    { completion_tokens: 600000, private_prompt: "ignored" },
    context,
  );
  assert.equal(cost.estimated, false);
  assert.equal(cost.basis.cny, 25.2);
  assert.equal(cost.basis.private_prompt, undefined);
  assert.deepEqual(videoUsage({ completion_tokens: 600000, arbitrary: true }), {
    completion_tokens: 600000,
  });
});

test("cached input is discounted once while output already includes thinking", () => {
  const usage = textUsage({
    inputTokens: 20000,
    cachedInputTokens: 10000,
    outputTokens: 10000,
    secrets: "omitted",
  });
  assert.deepEqual(usage, {
    inputTokens: 20000,
    cachedInputTokens: 10000,
    outputTokens: 10000,
  });
  assert.equal(
    estimateProviderCost({ kind: "text", ...usage }, { date: "2026-10-01" })
      .usd,
    0.04575,
  );
  assert.equal(
    textUsage({ inputTokens: 1, cachedInputTokens: 2, outputTokens: 1 }),
    undefined,
  );
});
