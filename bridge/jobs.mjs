import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  ApiError,
  generateScene,
  createVideo,
  getVideo,
  normalizeVideo,
  videoPayload,
} from "./providers.mjs";
import { planProduction } from "./orchestrator.mjs";
import { renderReference } from "./render.mjs";
import { validateScene, sceneKey } from "../src/frontend/native/schema.ts";
const active = (s) => ["queued", "running"].includes(s);
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function validateProduction(input) {
  if (!input || typeof input !== "object")
    throw new ApiError(400, "Invalid production request.");
  for (const k of ["requestId", "projectId", "shotId"])
    if (
      typeof input[k] !== "string" ||
      !/^[-a-zA-Z0-9_]{1,100}$/.test(input[k])
    )
      throw new ApiError(400, "Invalid " + k + ".");
  if (!["scene", "reference", "finish"].includes(input.mode))
    throw new ApiError(
      400,
      "Choose an editable scene, motion reference or finished shot.",
    );
  if (!Array.isArray(input.assets) || input.assets.length > 32)
    throw new ApiError(400, "Invalid scene assets.");
  let size = 0;
  const ids = new Set();
  for (const a of input.assets) {
    if (
      !a ||
      typeof a.id !== "string" ||
      ids.has(a.id) ||
      typeof a.name !== "string" ||
      a.name.length > 160 ||
      !["image", "model"].includes(a.kind) ||
      typeof a.url !== "string" ||
      !/^data:(image\/(png|jpeg|webp)|model\/gltf-binary|application\/octet-stream);base64,[A-Za-z0-9+/=]+$/.test(
        a.url,
      )
    )
      throw new ApiError(
        400,
        "Pack scene images and GLB assets as supported data URLs.",
      );
    ids.add(a.id);
    size += a.url.length;
  }
  if (size > 28 * 1024 * 1024)
    throw new ApiError(413, "Scene assets exceed 20 MB.");
  try {
    validateScene(input.scene, ids);
  } catch (e) {
    throw new ApiError(400, e.message, "INVALID_SCENE");
  }
  if (
    !Number.isInteger(input.scene.duration) ||
    input.scene.duration < 4 ||
    input.scene.duration > 30
  )
    throw new ApiError(400, "Connected shots need 4–30 whole seconds.");
  if (!["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(input.ratio))
    throw new ApiError(400, "Invalid shot aspect ratio.");
  for (const k of ["instruction", "finishPrompt"])
    if (typeof input[k] !== "string" || input[k].length > 8000)
      throw new ApiError(400, "Invalid " + k + ".");
  if (input.mode === "finish" && !input.finishPrompt.trim())
    throw new ApiError(400, "Describe the finished shot.");
  if (input.reviseScene && !input.instruction.trim())
    throw new ApiError(400, "Describe the scene revision.");
  if (typeof input.reviseScene !== "boolean")
    throw new ApiError(400, "Choose whether to revise the source scene.");
  if (input.scope !== undefined && !["scene", "object"].includes(input.scope))
    throw new ApiError(400, "Choose a scene or object scope.");
  if (
    input.scope === "object" &&
    !input.scene.objects.some((o) => o.id === input.objectId)
  )
    throw new ApiError(400, "The selected object no longer exists.");
  if (
    input.sceneOrigin !== undefined &&
    !["new", "existing"].includes(input.sceneOrigin)
  )
    throw new ApiError(400, "Invalid scene origin.");
  if (
    input.sceneOrigin === "new" &&
    (!input.reviseScene || input.scope === "object")
  )
    throw new ApiError(
      400,
      "A new control scene must be designed before production.",
    );
  for (const key of ["baseTakeId", "parentJobId"])
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" ||
        !/^[-a-zA-Z0-9_]{1,160}$/.test(input[key]))
    )
      throw new ApiError(400, "Invalid " + key + ".");
  videoPayload(
    {
      prompt: input.finishPrompt || "Reference",
      duration: input.scene.duration,
      resolution: input.resolution,
      ratio: input.ratio,
      operation: "generate",
    },
    { seedanceModel: "validation" },
  );
  return input;
}
export function requireCapabilities(input, config) {
  if (input.mode !== "finish" && !input.reviseScene) return;
  if (!config.anthropicKey)
    throw new ApiError(
      503,
      "Set ANTHROPIC_API_KEY on the server.",
      "CLAUDE_NOT_CONFIGURED",
    );
  if (input.mode !== "finish") return;
  if (!config.arkKey)
    throw new ApiError(
      503,
      "Set ARK_API_KEY on the server.",
      "SEEDANCE_NOT_CONFIGURED",
    );
  if (!config.publicOrigin && !config.uploadUrl)
    throw new ApiError(
      503,
      "Set MOUVA_PUBLIC_ORIGIN to the public HTTPS server address, or configure MOUVA_MEDIA_UPLOAD_URL. Seedance must be able to fetch the reference video.",
      "PUBLISHER_NOT_CONFIGURED",
    );
}
export class JobStore {
  constructor(config, deps = {}) {
    this.config = config;
    this.deps = {
      plan: planProduction,
      scene: generateScene,
      render: renderReference,
      createVideo,
      getVideo,
      fetcher: fetch,
      ...deps,
    };
    this.records = new Map();
    this.controllers = new Map();
    this.busy = false;
    this.closing = false;
  }
  async init() {
    await mkdir(path.join(this.config.dataDir, "jobs"), { recursive: true });
    for (const f of await readdir(path.join(this.config.dataDir, "jobs"))) {
      if (!f.endsWith(".json")) continue;
      let r;
      try {
        r = JSON.parse(
          await readFile(path.join(this.config.dataDir, "jobs", f), "utf8"),
        );
      } catch {
        continue;
      }
      this.records.set(r.id, r);
      if (active(r.status) && !r.remoteTaskId && r.status === "running") {
        r.status = "failed";
        r.error = r.submitting
          ? "Server restarted during Seedance submission. Check the provider console before retrying to avoid a duplicate charge."
          : "Server restarted during this stage. The saved scene and completed reference are preserved; submit a new job to continue.";
        await this.save(r);
      }
    }
    this.kick();
    return this;
  }
  jobDir(id) {
    return path.join(this.config.dataDir, "media", id);
  }
  async save(r) {
    r.updatedAt = new Date().toISOString();
    const dest = path.join(this.config.dataDir, "jobs", r.id + ".json"),
      tmp = dest + "." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(r), "utf8");
    await rename(tmp, dest);
  }
  public(r) {
    const {
      id,
      projectId,
      shotId,
      kind,
      status,
      stage,
      phase,
      progress,
      error,
      scene,
      sourceSceneKey,
      referenceUrl,
      outputUrl,
      createdAt,
      updatedAt,
      plan,
      remoteTaskId,
      renderInfo,
    } = r;
    return {
      id,
      projectId,
      shotId,
      kind,
      status,
      stage,
      phase,
      progress,
      error,
      scene,
      sourceSceneKey,
      referenceUrl,
      outputUrl,
      createdAt,
      updatedAt,
      provider: "pipeline",
      mode: r.input.mode,
      sourceReady: r.sourceReady === true || r.status === "succeeded",
      baseTakeId: r.input.baseTakeId,
      parentJobId: r.input.parentJobId,
      instruction: r.input.instruction,
      scope: r.input.scope || "scene",
      objectId: r.input.objectId,
      events: r.events,
      plan: plan
        ? {
            summary: plan.summary,
            continuityNotes: plan.continuityNotes,
            orchestrator: "codex",
          }
        : undefined,
      remoteTaskId,
      renderInfo,
    };
  }
  get(id, ownerId) {
    const r = this.records.get(id);
    if (!r || (ownerId !== undefined && (r.ownerId || "local") !== ownerId)) throw new ApiError(404, "Production job not found.");
    return r;
  }
  list(projectId, ownerId = "local") {
    return [...this.records.values()]
      .filter((r) => r.projectId === projectId && (r.ownerId || "local") === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map((r) => this.public(r));
  }
  async create(input, ownerId = "local") {
    validateProduction(input);
    const hash = digest(input),
      previous = [...this.records.values()].find(
        (r) => r.input.requestId === input.requestId && (r.ownerId || "local") === ownerId,
      );
    if (previous) {
      if (previous.requestHash !== hash)
        throw new ApiError(
          409,
          "This request ID was already used for different content.",
        );
      return this.public(previous);
    }
    if (input.parentJobId) {
      const parent = this.records.get(input.parentJobId);
      if (
        !parent ||
        (parent.ownerId || "local") !== ownerId ||
        parent.projectId !== input.projectId ||
        parent.shotId !== input.shotId
      )
        throw new ApiError(
          400,
          "The source production does not belong to this shot.",
        );
    }
    requireCapabilities(input, this.config);
    if ([...this.records.values()].filter((r) => active(r.status)).length >= 25)
      throw new ApiError(429, "The production queue is full. Try again later.");
    const id = randomUUID(),
      r = {
        id,
        ownerId,
        input: structuredClone(input),
        requestHash: hash,
        projectId: input.projectId,
        shotId: input.shotId,
        kind: "generate",
        status: "queued",
        stage:
          input.mode === "finish" || input.reviseScene
            ? "orchestrate"
            : "reference",
        phase: "Waiting for server worker",
        scene: structuredClone(input.scene),
        sourceSceneKey: sceneKey(input.scene),
        mediaToken: randomBytes(32).toString("hex"),
        publishUntil: Date.now() + 72 * 3600000,
        createdAt: new Date().toISOString(),
        events: [],
      };
    this.records.set(id, r);
    try {
      await this.save(r);
    } catch (e) {
      this.records.delete(id);
      throw e;
    }
    this.kick();
    return this.public(r);
  }
  kick() {
    if (this.busy || this.closing) return;
    this.busy = true;
    queueMicrotask(async () => {
      try {
        for (const r of this.records.values()) {
          if (this.closing) break;
          if (active(r.status)) await this.run(r);
        }
      } finally {
        this.busy = false;
        if (
          !this.closing &&
          [...this.records.values()].some((r) => active(r.status))
        )
          this.kick();
      }
    });
  }
  async stage(r, stage, phase) {
    r.stage = stage;
    r.phase = phase;
    delete r.progress;
    r.events.push({ stage, phase, at: new Date().toISOString() });
    await this.save(r);
  }
  async publish(r, signal) {
    if (this.deps.publish)
      return this.deps.publish(r, { config: this.config, signal });
    if (this.config.uploadUrl) {
      const form = new FormData();
      const bytes = await readFile(
        path.join(this.jobDir(r.id), "reference.mp4"),
      );
      form.append(
        "file",
        new Blob([bytes], { type: "video/mp4" }),
        "reference.mp4",
      );
      form.append("jobId", r.id);
      const response = await this.deps.fetcher(this.config.uploadUrl, {
        method: "POST",
        headers: this.config.uploadToken
          ? { Authorization: "Bearer " + this.config.uploadToken }
          : {},
        body: form,
        signal,
        redirect: "error",
      });
      const data = await response.json();
      if (
        !response.ok ||
        typeof data.url !== "string" ||
        !data.url.startsWith("https://")
      )
        throw new ApiError(
          502,
          "Media publisher must return an HTTPS URL as {url}.",
          "PUBLISH_FAILED",
        );
      return data.url;
    }
    return this.config.publicOrigin + r.referenceUrl;
  }
  async run(r) {
    const ctl = new AbortController();
    this.controllers.set(r.id, ctl);
    const signal = AbortSignal.any([
      ctl.signal,
      AbortSignal.timeout(this.config.jobTimeoutMs || 3600000),
    ]);
    const ctx = { config: this.config, fetcher: this.deps.fetcher, signal };
    try {
      r.status = "running";
      await this.save(r);
      await mkdir(this.jobDir(r.id), { recursive: true });
      if (!r.remoteTaskId) {
        if (r.input.mode === "finish" || r.input.reviseScene) {
          await this.stage(r, "orchestrate", "Codex · planning the shot");
          r.plan = await this.deps.plan(r.input, ctx);
          await this.save(r);
          if (r.input.reviseScene) {
            await this.stage(
              r,
              "scene",
              "Claude · building the editable scene",
            );
            const result = await this.deps.scene(
              {
                scene: r.scene,
                assets: r.input.assets,
                prompt: r.plan.sceneInstruction,
                scope: r.input.scope || "scene",
                objectId: r.input.objectId,
                sceneOrigin: r.input.sceneOrigin || "existing",
              },
              ctx,
            );
            r.scene = result.scene;
            validateScene(r.scene, new Set(r.input.assets.map((a) => a.id)));
            r.sourceSceneKey = sceneKey(r.scene);
            r.sourceReady = true;
            await this.save(r);
          }
        }
        signal.throwIfAborted();
        r.sourceReady = true;
        await this.save(r);
        if (r.input.mode === "scene") {
          r.status = "succeeded";
          await this.stage(r, "complete", "Editable 3D scene ready for review");
          return;
        }
        await this.stage(
          r,
          "reference",
          "Three.js · rendering the motion reference",
        );
        r.renderInfo = await this.deps.render({
          scene: r.scene,
          assets: r.input.assets,
          ratio: r.input.ratio,
          output: path.join(this.jobDir(r.id), "reference.mp4"),
          ...ctx,
          onProgress: async (progress) => {
            if (!signal.aborted) {
              r.progress = progress;
              await this.save(r);
            }
          },
        });
        signal.throwIfAborted();
        r.referenceUrl =
          "/api/ai/media/" + r.id + "/reference.mp4?token=" + r.mediaToken;
        await this.save(r);
        if (r.input.mode === "reference") {
          r.status = "succeeded";
          await this.stage(r, "complete", "Motion reference ready");
          return;
        }
        await this.stage(r, "publish", "Publishing the motion reference");
        r.publishedReference = await this.publish(r, signal);
        await this.save(r);
        signal.throwIfAborted();
        await this.stage(
          r,
          "video",
          "Seedance 2.5 · submitting the referenced shot",
        );
        r.submitting = true;
        await this.save(r);
        const task = await this.deps.createVideo(
          {
            projectId: r.projectId,
            shotId: r.shotId,
            prompt:
              "Use reference video 1 for shot composition, object movement, camera path and timing. Preserve subject identity and readable text. " +
              r.plan.finishPrompt,
            duration: r.scene.duration,
            resolution: r.input.resolution,
            ratio: r.input.ratio,
            operation: "generate",
            generateAudio: r.input.generateAudio !== false,
            references: [{ type: "video", url: r.publishedReference }],
          },
          ctx,
        );
        r.remoteTaskId = task.id;
        r.submitting = false;
        await this.save(r);
      }
      while (true) {
        signal.throwIfAborted();
        let raw;
        try {
          raw = await this.deps.getVideo(r.remoteTaskId, ctx);
        } catch (e) {
          if ([429, 502, 504].includes(e.status)) {
            r.pollErrors = (r.pollErrors || 0) + 1;
            if (r.pollErrors > 20) throw e;
            r.phase = "Seedance · reconnecting to task";
            await this.save(r);
            await delay(this.config.pollMs || 5000, undefined, { signal });
            continue;
          }
          throw e;
        }
        const task = normalizeVideo(raw, r);
        r.providerStatus = task.status;
        r.phase = task.phase;
        r.pollErrors = 0;
        await this.save(r);
        if (task.status === "succeeded") {
          if (!task.outputUrl?.startsWith("https://"))
            throw new ApiError(502, "Seedance returned no HTTPS video URL.");
          await this.stage(r, "video", "Saving the finished video");
          r.providerOutputUrl = task.outputUrl;
          await this.save(r);
          if (this.deps.download)
            await this.deps.download(
              task.outputUrl,
              path.join(this.jobDir(r.id), "final.mp4"),
              signal,
            );
          else
            await this.download(
              task.outputUrl,
              path.join(this.jobDir(r.id), "final.mp4"),
              signal,
            );
          r.outputUrl =
            "/api/ai/media/" + r.id + "/final.mp4?token=" + r.mediaToken;
          r.status = "succeeded";
          await this.stage(r, "complete", "Finished shot ready for review");
          break;
        }
        if (["failed", "cancelled"].includes(task.status)) {
          r.status = task.status;
          r.error = task.error || "Seedance task " + task.status;
          await this.save(r);
          break;
        }
        await delay(this.config.pollMs || 5000, undefined, { signal });
      }
    } catch (e) {
      if (this.closing && r.remoteTaskId && r.status !== "cancelled") {
        r.status = "queued";
        r.phase = "Paused for server restart; provider task retained";
        await this.save(r);
      } else if (r.status !== "cancelled") {
        r.status = "failed";
        r.error = r.submitting
          ? "Seedance submission was interrupted; its acceptance is uncertain. Check the provider console before submitting another job."
          : signal.aborted
            ? "Production interrupted or timed out. Completed artifacts have been preserved."
            : String(e.message || "Production failed.").slice(0, 600);
        for (const key of [
          this.config.anthropicKey,
          this.config.arkKey,
          this.config.accessToken,
          this.config.uploadToken,
        ])
          if (key) r.error = r.error.split(key).join("[redacted]");
        await this.save(r);
      }
    } finally {
      this.controllers.delete(r.id);
    }
  }
  async download(url, output, signal) {
    const res = await this.deps.fetcher(url, { signal, redirect: "error" });
    if (!res.ok || !res.body)
      throw new ApiError(
        502,
        "Could not save the Seedance output. The provider URL is retained on the server.",
      );
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > 250 * 1024 * 1024) {
        await res.body.cancel().catch(() => {});
        throw new ApiError(502, "Provider output exceeds the 250 MB limit.");
      }
      chunks.push(chunk);
    }
    if (size < 100) throw new ApiError(502, "Provider output was empty.");
    const tmp = output + ".part";
    await writeFile(tmp, Buffer.concat(chunks));
    await rename(tmp, output);
  }
  async cancel(id, ownerId = "local") {
    const r = this.get(id, ownerId);
    if (!active(r.status)) return this.public(r);
    if (r.submitting)
      throw new ApiError(
        409,
        "Submission is in progress; wait for the provider task ID.",
      );
    if (r.remoteTaskId) {
      const data = await this.deps.getVideo(r.remoteTaskId, {
        config: this.config,
        fetcher: this.deps.fetcher,
        signal: AbortSignal.timeout(20000),
      });
      if (data.status !== "queued")
        throw new ApiError(
          409,
          "Seedance can cancel queued tasks only. This task has already started.",
        );
      await this.deps.getVideo(
        r.remoteTaskId,
        {
          config: this.config,
          fetcher: this.deps.fetcher,
          signal: AbortSignal.timeout(20000),
        },
        true,
      );
    }
    r.status = "cancelled";
    r.phase = "Cancelled";
    await this.save(r);
    this.controllers.get(id)?.abort();
    return this.public(r);
  }
  async close() {
    this.closing = true;
    for (const ctl of this.controllers.values()) ctl.abort();
    while (this.busy) await delay(25);
  }
}
