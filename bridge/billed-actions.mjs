import { mkdir, readdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { ApiError } from "./providers.mjs";
import { estimateProviderCost, textUsage } from "./provider-cost.mjs";
/** Durable receipts for synchronous Agent calls; unresolved dispatch is never retried automatically. */
export class BilledActions {
  constructor(config, billing) {
    this.config = config;
    this.billing = billing;
    this.records = new Map();
    this.pending = new Map();
    this.directory = path.join(config.dataDir, "actions");
  }
  async init() {
    await mkdir(this.directory, { recursive: true });
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const record = JSON.parse(
        await readFile(path.join(this.directory, name), "utf8"),
      );
      if (record.status === "running") {
        record.status = "unknown";
        await this.save(record);
      }
      this.records.set(record.ownerId + ":" + record.requestId, record);
    }
    return this;
  }
  async save(record) {
    const destination = path.join(this.directory, record.id + ".json"),
      temporary = destination + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(record));
    await rename(temporary, destination);
  }
  result(ownerId, requestId) {
    const record = this.records.get(ownerId + ":" + requestId);
    if (!record)
      throw new ApiError(404, "This saved Agent request was not found.");
    return {
      status: record.status,
      settled: record.settlement?.settled === true,
      ...(record.status === "succeeded" ? { result: record.result } : {}),
    };
  }
  async reconcileBilling() {
    for (const record of this.records.values()) {
      if (
        !["succeeded", "failed", "unknown"].includes(record.status) ||
        record.settlement?.settled
      )
        continue;
      try {
        record.settlement = await this.billing.settle(
          record.accountId,
          "agent:" + record.requestId,
          {
            status:
              record.status === "succeeded"
                ? "succeeded"
                : record.status === "failed"
                  ? "not_dispatched"
                  : "unknown",
          },
        );
        await this.save(record);
      } catch {
        /* Keep the receipt for the next reconciliation pass. */
      }
    }
  }
  async close() {
    await Promise.allSettled([...this.pending.values()]);
  }
  async run(body, ownerId, accountId, execute) {
    if (!this.billing.enabled) return execute();
    if (
      typeof body.requestId !== "string" ||
      !/^[-a-zA-Z0-9_]{1,100}$/.test(body.requestId)
    )
      throw new ApiError(400, "An Agent request needs a request ID.");
    const key = ownerId + ":" + body.requestId;
    const content = {
      instruction: body.instruction,
      project: body.project,
      selectedShotId: body.selectedShotId,
      playhead: body.playhead,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex");
    const previous = this.records.get(key);
    if (previous && previous.hash !== hash)
      throw new ApiError(
        409,
        "This Agent request ID belongs to different content.",
      );
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.execute(
      previous,
      body,
      hash,
      ownerId,
      accountId,
      execute,
    );
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }
  async execute(previous, body, hash, ownerId, accountId, execute) {
    const record = previous || {
      id: randomUUID(),
      ownerId,
      accountId,
      requestId: body.requestId,
      hash,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const operationId = "agent:" + body.requestId;
    if (record.status === "unknown" || record.status === "failed")
      throw new ApiError(
        409,
        "This Agent request needs billing reconciliation before retrying.",
        "BILLING_RECONCILIATION_REQUIRED",
      );
    if (record.status === "succeeded") {
      if (!record.settlement?.settled) {
        record.settlement = await this.billing.settle(accountId, operationId, {
          status: "succeeded",
        });
        await this.save(record);
      }
      return record.result;
    }
    this.records.set(ownerId + ":" + body.requestId, record);
    await this.save(record);
    record.reservation = await this.billing.reserve(
      accountId,
      operationId,
      { kind: "agent" },
      body.billingApproval,
    );
    record.status = "running";
    await this.save(record);
    let result;
    try {
      result = await execute();
    } catch (error) {
      const notDispatched = ["GEMINI_NOT_CONFIGURED", "INVALID_INPUT"].includes(
        error.code,
      );
      record.status = notDispatched ? "failed" : "unknown";
      await this.save(record);
      record.settlement = await this.billing
        .settle(accountId, operationId, {
          status: notDispatched ? "not_dispatched" : "unknown",
        })
        .catch(() => undefined);
      await this.save(record);
      throw error;
    }
    record.result = { summary: result.summary, commands: result.commands };
    const usage = textUsage(result.usage);
    if (usage && result.model === "gemini-3.8-flash")
      record.providerCost = estimateProviderCost({
        kind: "text",
        model: result.model,
        ...usage,
      });
    record.status = "succeeded";
    await this.save(record);
    try {
      record.settlement = await this.billing.settle(accountId, operationId, {
        status: "succeeded",
      });
      await this.save(record);
    } catch {
      /* Deliver the saved edit plan; the durable receipt retries settlement. */
    }
    return record.result;
  }
}
