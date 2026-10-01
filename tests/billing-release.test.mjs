import test from "node:test";
import assert from "node:assert/strict";
import { VideoBilling } from "../bridge/billing.mjs";

const config = {
  billingMode: "mouva",
  billingUrl: "https://api.example/api/internal/studio-billing",
  billingSecret: "synthetic-service-secret-for-tests-only",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("billing follows the master epoch across cutovers and preserves reservation identity", async () => {
  let epoch = "101",
    healthReads = 0;
  const requests = [];
  const billing = new VideoBilling(config, {
    billingFetch: async (url, options) => {
      if (url === "https://api.example/api/health") {
        healthReads++;
        assert.equal(
          options.headers,
          undefined,
          "do not send the service secret to public health",
        );
        return json({
          releaseEpoch: epoch,
          writesOpen: true,
          trafficReady: true,
        });
      }
      requests.push({
        epoch: options.headers["X-Mouva-Release-Epoch"],
        body: options.body,
      });
      return options.headers["X-Mouva-Release-Epoch"] === epoch
        ? json({ reserved: true })
        : json({ code: "RELEASE_EPOCH_MISMATCH" }, 409);
    },
  });
  await billing.quote({ kind: "agent" });
  epoch = "102";
  await billing.reserve(
    "synthetic-user",
    "same-operation",
    { kind: "agent" },
    { version: "price-v2", maxCredits: 100 },
  );
  assert.equal(healthReads, 2);
  assert.deepEqual(
    requests.map((r) => r.epoch),
    ["101", "101", "102"],
  );
  assert.equal(requests[1].body, requests[2].body);
  assert.equal(JSON.parse(requests[2].body).operationId, "same-operation");
});

test("billing never retries uncertain failures or writes during master maintenance", async () => {
  let posts = 0;
  const billing = new VideoBilling(config, {
    billingFetch: async (_url, options) => {
      if (options.method === "GET")
        return json({
          releaseEpoch: "101",
          writesOpen: true,
          trafficReady: true,
        });
      posts++;
      return json({ code: "BILLING_UNAVAILABLE" }, 503);
    },
  });
  await assert.rejects(billing.quote({ kind: "agent" }), { status: 503 });
  assert.equal(posts, 1);
  const maintenance = new VideoBilling(config, {
    billingFetch: async (_url, options) => {
      assert.equal(options.method, "GET");
      return json({
        releaseEpoch: "102",
        writesOpen: false,
        trafficReady: false,
      });
    },
  });
  await assert.rejects(maintenance.quote({ kind: "agent" }), {
    code: "BILLING_UNAVAILABLE",
  });
});
