import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { ApiError } from "./providers.mjs";

const maximumBytes = 20 * 1024 * 1024;
const sizes = new Set([
  "1024x1024",
  "1024x576",
  "576x1024",
  "1024x768",
  "768x1024",
]);
export function imageConfiguration(env = process.env) {
  return {
    imageKey: (env.DEEPINFRA_API_KEY || "").trim(),
    imageModel:
      (env.AI_DEFAULT_IMAGE_MODEL || "").trim() ||
      "black-forest-labs/FLUX-2-klein-9b",
  };
}
export function imageData(value) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((maximumBytes * 4) / 3) + 100
  )
    throw new ApiError(400, "Invalid image data.", "INVALID_IMAGE");
  const payload = value.replace(/^data:image\/(?:png|jpeg|webp);base64,/, "");
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload))
    throw new ApiError(400, "Invalid image data.", "INVALID_IMAGE");
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length || bytes.length > maximumBytes)
    throw new ApiError(400, "Invalid image data.", "INVALID_IMAGE");
  const type = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP"
        ? "webp"
        : null;
  if (!type) throw new ApiError(400, "Invalid image data.", "INVALID_IMAGE");
  return {
    bytes,
    type,
    url: `data:image/${type};base64,${bytes.toString("base64")}`,
  };
}
export function validateImageInput(input) {
  if (
    !input ||
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 4000 ||
    typeof input.projectId !== "string" ||
    !/^[\w-]{1,160}$/.test(input.projectId) ||
    typeof input.requestId !== "string" ||
    !/^[\w-]{1,160}$/.test(input.requestId) ||
    !sizes.has(`${input.width}x${input.height}`) ||
    ![1, 2, 4].includes(input.count) ||
    !Array.isArray(input.referenceImages) ||
    input.referenceImages.length > 4
  )
    throw new ApiError(
      400,
      "Invalid image generation request.",
      "INVALID_IMAGE_REQUEST",
    );
  const referenceImages = input.referenceImages.map(
    (value) => imageData(value).url,
  );
  if (
    referenceImages.reduce((sum, value) => sum + value.length, 0) >
    28 * 1024 * 1024
  )
    throw new ApiError(
      413,
      "Reference images are too large.",
      "IMAGE_REFERENCES_TOO_LARGE",
    );
  return {
    projectId: input.projectId,
    requestId: input.requestId,
    prompt: input.prompt.trim(),
    width: input.width,
    height: input.height,
    count: input.count,
    referenceImages,
  };
}
async function boundedJson(response) {
  if (Number(response.headers.get("content-length")) > maximumBytes * 1.4) {
    await response.body?.cancel();
    throw new ApiError(
      502,
      "The image provider returned an invalid result.",
      "INVALID_IMAGE_OUTPUT",
    );
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new ApiError(
      502,
      "The image provider returned an invalid result.",
      "INVALID_IMAGE_OUTPUT",
    );
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximumBytes * 1.4) {
        await reader.cancel();
        throw new ApiError(
          502,
          "The image provider returned an invalid result.",
          "INVALID_IMAGE_OUTPUT",
        );
      }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "The image provider returned an invalid result.",
      "INVALID_IMAGE_OUTPUT",
    );
  } finally {
    reader.releaseLock();
  }
}
export async function generateImage(
  input,
  { config, signal, fetcher = fetch },
) {
  const body = {
    prompt: input.prompt,
    width: input.width,
    height: input.height,
    output_format: "png",
  };
  input.referenceImages.forEach((value, index) => {
    body[`input_image_${index + 1}`] = value;
  });
  const response = await fetcher(
    "https://api.deepinfra.com/v1/inference/" +
      config.imageModel.split("/").map(encodeURIComponent).join("/"),
    {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: "Bearer " + config.imageKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(
      response.status === 429 ? 429 : 502,
      "Image generation failed. Please try again.",
      "IMAGE_PROVIDER_FAILED",
    );
  }
  const result = await boundedJson(response);
  if (
    !Array.isArray(result.images) ||
    result.images.length !== 1 ||
    !Array.isArray(result.nsfw_content_detected) ||
    result.nsfw_content_detected.length !== 1 ||
    typeof result.nsfw_content_detected[0] !== "boolean"
  )
    throw new ApiError(
      502,
      "The image provider returned an invalid result.",
      "INVALID_IMAGE_OUTPUT",
    );
  if (result.nsfw_content_detected[0])
    throw new ApiError(
      422,
      "The image provider could not generate this request.",
      "IMAGE_PROVIDER_BLOCKED",
    );
  try {
    return imageData(result.images[0]);
  } catch {
    throw new ApiError(
      502,
      "The image provider returned an invalid result.",
      "INVALID_IMAGE_OUTPUT",
    );
  }
}

export class ImageStore {
  constructor(config, deps = {}) {
    this.config = config;
    this.generate = deps.image || generateImage;
    this.fetcher = deps.fetcher || fetch;
    this.directory = path.join(config.dataDir, "images");
    this.records = new Map();
    this.pending = new Set();
    this.controllers = new Map();
    this.creating = new Set();
    this.tasks = new Set();
  }
  async init() {
    await mkdir(this.directory, { recursive: true });
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const record = JSON.parse(
        await readFile(path.join(this.directory, name), "utf8"),
      );
      if (["queued", "running"].includes(record.status)) {
        for (const candidate of record.candidates)
          if (["queued", "running"].includes(candidate.status))
            candidate.status = "failed";
        record.status = "failed";
        record.error = "Image generation was interrupted. Start a new round.";
        await this.save(record);
      }
      this.records.set(record.id, record);
    }
    return this;
  }
  async save(record) {
    const file = path.join(this.directory, record.id + ".json");
    const temporary = file + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(record));
    await rename(temporary, file);
  }
  public(record) {
    const { ownerId, token, ...result } = record;
    return {
      ...result,
      candidates: record.candidates.map((candidate) => ({
        ...candidate,
        ...(candidate.file
          ? {
              url:
                (this.config.publicOrigin || "") +
                `/api/ai/images/${record.id}/${candidate.file}?token=${token}`,
            }
          : {}),
        file: undefined,
      })),
    };
  }
  get(id, ownerId) {
    const record = this.records.get(id);
    if (!record || (ownerId && record.ownerId !== ownerId))
      throw new ApiError(404, "Image round not found.");
    return record;
  }
  list(projectId, ownerId) {
    return [...this.records.values()]
      .filter((r) => r.ownerId === ownerId && r.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40)
      .map((r) => this.public(r));
  }
  async create(raw, ownerId) {
    const input = validateImageInput(raw);
    const previous = [...this.records.values()].find(
      (r) => r.ownerId === ownerId && r.requestId === input.requestId,
    );
    if (previous) return this.public(previous);
    if (!this.config.imageKey)
      throw new ApiError(
        503,
        "Image generation is not configured yet.",
        "IMAGE_NOT_CONFIGURED",
      );
    const key = ownerId + ":" + input.requestId;
    if (
      this.creating.has(key) ||
      [...this.records.values()].filter(
        (r) =>
          r.ownerId === ownerId && ["queued", "running"].includes(r.status),
      ).length >= 2 ||
      this.pending.size >= 8
    )
      throw new ApiError(
        429,
        "Please wait for the current image round to finish.",
      );
    this.creating.add(key);
    try {
      const record = {
        id: randomUUID(),
        ownerId,
        token: randomBytes(32).toString("hex"),
        requestId: input.requestId,
        projectId: input.projectId,
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        model: this.config.imageModel,
        status: "queued",
        createdAt: new Date().toISOString(),
        candidates: Array.from({ length: input.count }, (_, index) => ({
          index,
          status: "queued",
        })),
      };
      this.records.set(record.id, record);
      this.pending.add(record.id);
      try {
        await this.save(record);
      } catch (error) {
        this.records.delete(record.id);
        this.pending.delete(record.id);
        throw error;
      }
      const task = this.run(record, input);
      this.tasks.add(task);
      void task.finally(() => this.tasks.delete(task));
      return this.public(record);
    } finally {
      this.creating.delete(key);
    }
  }
  async run(record, input) {
    const controller = new AbortController();
    this.controllers.set(record.id, controller);
    const timeout = setTimeout(() => controller.abort(), 240000);
    try {
      record.status = "running";
      await this.save(record);
      for (const candidate of record.candidates) {
        if (controller.signal.aborted) break;
        candidate.status = "running";
        await this.save(record);
        try {
          const result = await this.generate(input, {
            config: this.config,
            signal: controller.signal,
            fetcher: this.fetcher,
          });
          controller.signal.throwIfAborted();
          const checked = imageData(result.url);
          candidate.file = `${record.id}-${candidate.index}.${checked.type}`;
          await writeFile(
            path.join(this.directory, candidate.file),
            checked.bytes,
          );
          candidate.status = "succeeded";
        } catch (error) {
          candidate.status = controller.signal.aborted ? "cancelled" : "failed";
          candidate.error =
            error instanceof ApiError
              ? error.message
              : "Image generation failed. Please try again.";
        }
        await this.save(record);
      }
      for (const candidate of record.candidates)
        if (candidate.status === "queued") candidate.status = "cancelled";
      record.status = controller.signal.aborted
        ? "cancelled"
        : record.candidates.some((c) => c.status === "succeeded")
          ? "succeeded"
          : "failed";
      await this.save(record);
    } catch {
      record.status = "failed";
      record.error = "Image generation failed. Please try again.";
      await this.save(record).catch(() => {});
    } finally {
      clearTimeout(timeout);
      this.pending.delete(record.id);
      this.controllers.delete(record.id);
    }
  }
  async cancel(id, ownerId) {
    const record = this.get(id, ownerId);
    this.controllers.get(id)?.abort();
    return this.public(record);
  }
  async close() {
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled([...this.tasks]);
  }
  file(id, filename, token) {
    const record = this.get(id);
    if (
      typeof token !== "string" ||
      token.length !== 64 ||
      token !== record.token
    )
      throw new ApiError(401, "Invalid image link.");
    if (
      !record.candidates.some(
        (c) => c.status === "succeeded" && c.file === filename,
      )
    )
      throw new ApiError(404, "Image not found.");
    return path.join(this.directory, filename);
  }
}
