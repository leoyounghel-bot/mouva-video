import { approveGeneration } from "./native/billing";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./context";
import { Modal, Field, Icon, Photo } from "./Primitives";
import { text as copy, currentLanguage } from "./i18n";
import { uid } from "./demo";
import { studioAI, type AIStatus, type ImageRound } from "./native/api";
import { addCanvasItem, connectNodes, positionOf } from "./canvas/model";
import type { Asset } from "./types";
import { workspaceKey } from "./auth/session";
import "./images.css";

const presets = [
  ["1:1", 1024, 1024],
  ["16:9", 1024, 576],
  ["9:16", 576, 1024],
  ["4:3", 1024, 768],
  ["3:4", 768, 1024],
] as const;
const pending = (round: ImageRound) =>
  ["queued", "running"].includes(round.status);
function errorText(message: string) {
  const known: Record<string, [string, string]> = {
    "Image generation is not configured yet.": [
      "图片生成服务尚未连接，请检查服务设置。",
      "Image generation is not connected yet. Check service settings.",
    ],
    "Image generation failed. Please try again.": [
      "图片生成失败，可以保留描述再试一次。",
      "Image generation failed. Keep your prompt and try again.",
    ],
    "Image generation was interrupted. Start a new round.": [
      "图片生成已中断，已完成的图片仍然保留。请重新生成。",
      "Image generation was interrupted. Completed images are preserved. Start a new round.",
    ],
    "The image provider could not generate this request.": [
      "图片服务无法完成这次请求，请调整描述后重试。",
      "The image provider could not generate this request. Adjust your prompt and try again.",
    ],
    "The image provider returned an invalid result.": [
      "图片服务返回了无效结果，请重新生成。",
      "The image provider returned an invalid result. Please try again.",
    ],
    "Please wait for the current image round to finish.": [
      "请等待当前图片生成完成。",
      "Please wait for the current image round to finish.",
    ],
  };
  return known[message] ? copy(...known[message]) : message;
}
async function referenceData(asset: Asset) {
  if (!asset.url)
    throw new Error(
      copy("参考图片无法读取。", "The reference image could not be loaded."),
    );
  const response = await fetch(asset.url);
  if (!response.ok)
    throw new Error(
      copy("参考图片无法读取。", "The reference image could not be loaded."),
    );
  const blob = await response.blob();
  if (
    !/^image\/(png|jpeg|webp)$/.test(blob.type) ||
    blob.size > 5 * 1024 * 1024
  )
    throw new Error(
      copy(
        "参考图需为 PNG、JPEG 或 WebP，单张不超过 5 MB。",
        "Use PNG, JPEG or WebP references, up to 5 MB each.",
      ),
    );
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        new Error(
          copy(
            "参考图片无法读取。",
            "The reference image could not be loaded.",
          ),
        ),
      );
    reader.readAsDataURL(blob);
  });
}
export function ImageDialog() {
  const w = useWorkspace();
  const live = useRef(w);
  live.current = w;
  const draftKey = workspaceKey("mouva-image-draft-" + w.project.id);
  const [initial] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) || "{}");
    } catch {
      return {};
    }
  });
  const [prompt, setPrompt] = useState(
    typeof initial?.prompt === "string" ? initial.prompt.slice(0, 4000) : "",
  );
  const [ratio, setRatio] = useState(
    presets.some((p) => p[0] === initial?.ratio) ? initial.ratio : "16:9",
  );
  const [count, setCount] = useState(
    [1, 2, 4].includes(initial?.count) ? initial.count : 2,
  );
  const [references, setReferences] = useState<string[]>(
    Array.isArray(initial?.references)
      ? initial.references
          .filter(
            (id: unknown) =>
              typeof id === "string" &&
              w.project.assets.some((a) => a.id === id && a.kind === "image"),
          )
          .slice(0, 4)
      : [],
  );
  const [rounds, setRounds] = useState<ImageRound[]>([]);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState("");
  const [loading, setLoading] = useState(true);
  const active = useRef(true);
  const locked = useRef(false);
  const submission = useRef<{ key: string; requestId: string } | null>(null);
  const savingLock = useRef(false);
  const projectId = w.project.id;
  const imageAssets = w.project.assets.filter(
    (a) => a.kind === "image" && a.url,
  );
  const hasPending = rounds.some(pending);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ prompt, ratio, count, references }),
      );
    } catch {}
  }, [draftKey, prompt, ratio, count, references]);
  async function check() {
    setError("");
    setLoading(true);
    try {
      const [service, saved] = await Promise.all([
        studioAI.status(),
        studioAI.images(projectId),
      ]);
      if (!active.current) return;
      setStatus(service);
      setRounds(saved);
    } catch (reason: any) {
      if (active.current) setError(reason.message);
    } finally {
      if (active.current) setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void check();
    return () => {
      active.current = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!hasPending) return;
    let disposed = false,
      polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const saved = await studioAI.images(projectId);
        if (!disposed && active.current) {
          setRounds(saved);
          setError("");
        }
      } catch (reason: any) {
        if (!disposed && active.current) setError(reason.message);
      } finally {
        polling = false;
      }
    }, 1800);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [hasPending, projectId]);
  async function generate() {
    if (locked.current || hasPending || !prompt.trim() || !status?.imageReady)
      return;
    locked.current = true;
    setSubmitting(true);
    setError("");
    try {
      const [, width, height] = presets.find((p) => p[0] === ratio)!;
      const selected = references
        .map((id) => imageAssets.find((a) => a.id === id))
        .filter((a): a is Asset => !!a);
      const referenceImages = await Promise.all(selected.map(referenceData));
      const billingApproval = await approveGeneration({
        kind: "image",
        width,
        height,
        count,
      });
      if (billingApproval === null) return;
      const key = JSON.stringify([
        projectId,
        prompt.trim(),
        width,
        height,
        count,
        references,
      ]);
      if (submission.current?.key !== key)
        submission.current = { key, requestId: uid() };
      const round = await studioAI.generateImages({
        requestId: submission.current.requestId,
        projectId,
        prompt: prompt.trim(),
        width,
        height,
        count,
        referenceImages,
        ...(billingApproval ? { billingApproval } : {}),
      });
      submission.current = null;
      if (active.current)
        setRounds((list) => [round, ...list.filter((r) => r.id !== round.id)]);
    } catch (reason: any) {
      if (active.current) setError(errorText(reason.message));
    } finally {
      locked.current = false;
      if (active.current) setSubmitting(false);
    }
  }
  const savedAsset = (round: ImageRound, index: number) =>
    w.project.assets.find(
      (a) => a.generation?.roundId === round.id && a.generation.index === index,
    );
  async function adopt(
    round: ImageRound,
    index: number,
    destination: "assets" | "shot" | "canvas",
  ) {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(`${round.id}:${index}`);
    setError("");
    try {
      if (live.current.project.id !== projectId) return;
      let asset = live.current.project.assets.find(
        (a) =>
          a.generation?.roundId === round.id && a.generation.index === index,
      );
      if (!asset) {
        const candidate = round.candidates.find((c) => c.index === index)!;
        const response = await fetch(candidate.url!);
        if (!response.ok)
          throw new Error(
            copy(
              "图片读取失败，请重试。",
              "The image could not be loaded. Please try again.",
            ),
          );
        const blob = await response.blob();
        if (live.current.project.id !== projectId || !active.current) return;
        const extension =
          blob.type === "image/jpeg"
            ? "jpg"
            : blob.type === "image/webp"
              ? "webp"
              : "png";
        const [imported] = await live.current.upload([
          new File(
            [blob],
            `mouva-image-${round.id.slice(0, 8)}-${index + 1}.${extension}`,
            { type: blob.type },
          ),
        ]);
        if (!imported)
          throw new Error(
            copy(
              "图片保存失败，请重试。",
              "The image could not be saved. Please try again.",
            ),
          );
        asset = imported;
        live.current.update((p) => {
          const found = p.assets.find((a) => a.id === imported.id);
          if (found)
            found.generation = {
              roundId: round.id,
              index,
              prompt: round.prompt,
              width: round.width,
              height: round.height,
            };
        }, "Save generated image");
      }
      if (live.current.project.id !== projectId) return;
      if (destination === "shot") {
        live.current.attachAssets(live.current.shot.id, [asset.id]);
        live.current.notify(
          copy(
            "已保存到素材库，并加入当前镜头参考。",
            "Saved to assets and attached as a reference to the current shot.",
          ),
        );
      } else if (destination === "canvas") {
        const assetId = asset.id,
          shotId = live.current.shot.id;
        live.current.update((p) => {
          const at = positionOf(p, shotId);
          const node = addCanvasItem(
            p,
            "image",
            { x: at.x - 440, y: at.y },
            undefined,
            assetId,
          );
          connectNodes(p, node, shotId);
        }, "Add generated image to canvas");
        live.current.setSection("create");
        live.current.setView("canvas");
        live.current.setModal(null);
      } else
        live.current.notify(
          copy("图片已保存到素材库。", "Image saved to assets."),
        );
    } catch (reason: any) {
      if (active.current) setError(reason.message);
    } finally {
      savingLock.current = false;
      if (active.current) setSaving("");
    }
  }
  async function cancel(round: ImageRound) {
    try {
      await studioAI.cancelImages(round.id);
      if (active.current) setRounds(await studioAI.images(projectId));
    } catch (reason: any) {
      if (active.current) setError(reason.message);
    }
  }
  return (
    <Modal
      wide
      title={copy("图片生成", "Image generation")}
      subtitle={copy(
        "先探索画面，再让它动起来。",
        "Explore a frame. Then bring it to life.",
      )}
      onClose={() => w.setModal(null)}
    >
      <div className="mw-image-lab">
        <section
          className="mw-image-brief"
          aria-label={copy("图片生成设置", "Image generation settings")}
        >
          <Field label={copy("画面描述", "Image prompt")}>
            <textarea
              rows={5}
              maxLength={4000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={copy(
                "例如：清晨的海边咖啡馆，暖色光线，电影感构图…",
                "For example: a seaside café at dawn, warm light, cinematic composition…",
              )}
            />
          </Field>
          <div className="mw-image-settings">
            <Field label={copy("画面比例", "Aspect ratio")}>
              <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                {presets.map(([name]) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label={copy("候选数量", "Candidates")}>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[1, 2, 4].map((n) => (
                  <option key={n} value={n}>
                    {copy(`${n} 张`, `${n} image${n > 1 ? "s" : ""}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mw-image-reference-heading">
            <strong>{copy("参考图片", "Reference images")}</strong>
            <span>{references.length}/4</span>
          </div>
          <p className="mw-help">
            {copy(
              "可选。使用已有图片探索变化，保留人物、构图或风格。",
              "Optional. Explore variations using existing images to guide the subject, composition or style.",
            )}
          </p>
          {imageAssets.length ? (
            <div className="mw-image-references">
              {imageAssets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  aria-pressed={references.includes(asset.id)}
                  disabled={
                    references.length >= 4 && !references.includes(asset.id)
                  }
                  onClick={() =>
                    setReferences((ids) =>
                      ids.includes(asset.id)
                        ? ids.filter((id) => id !== asset.id)
                        : [...ids, asset.id],
                    )
                  }
                >
                  {asset.image && (
                    <Photo media={asset.image} label={asset.name} />
                  )}
                  <span>{asset.name}</span>
                  {references.includes(asset.id) && (
                    <Icon name="check" size={15} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mw-image-empty-reference">
              {copy(
                "导入人物或风格图片，即可用于参考。",
                "Import a subject or style image to use it as a reference.",
              )}
            </p>
          )}
          <button
            className="mw-secondary full"
            onClick={() => {
              w.setSection("assets");
              w.setModal(null);
            }}
          >
            <Icon name="upload" size={15} />
            {copy("去素材库导入参考图", "Import references in assets")}
          </button>
          {!loading && !status?.imageReady && (
            <div className="mw-image-service" role="status">
              <strong>
                {copy("图片服务尚未连接", "Image service is not connected")}
              </strong>
              <p>
                {copy(
                  "连接后即可在这里生成图片。",
                  "Connect the image service to generate here.",
                )}
              </p>
              <button
                className="mw-text-button"
                onClick={() => w.setModal("ai-settings")}
              >
                {copy("打开服务设置", "Open service settings")}
              </button>
              <button className="mw-text-button" onClick={() => void check()}>
                {copy("重新检查", "Check again")}
              </button>
            </div>
          )}
          {error && (
            <p className="mw-form-error" role="alert">
              {errorText(error)}
            </p>
          )}
          <button
            className="mw-primary full"
            disabled={
              loading ||
              submitting ||
              hasPending ||
              !status?.imageReady ||
              !prompt.trim()
            }
            onClick={() => void generate()}
          >
            <Icon name="spark" size={16} />
            {copy(
              submitting
                ? "正在提交…"
                : hasPending
                  ? "正在生成候选…"
                  : rounds.length
                    ? "再生成一组"
                    : "生成图片",
              submitting
                ? "Submitting…"
                : hasPending
                  ? "Generating candidates…"
                  : rounds.length
                    ? "Generate another round"
                    : "Generate images",
            )}
          </button>
          <p className="mw-help">
            {copy(
              "每次生成保留为独立候选；采用后保存到素材库，原镜头仍然保留。",
              "Each round keeps its own candidates. Adopt an image to save it to assets while preserving your shot.",
            )}
          </p>
        </section>
        <section
          className="mw-image-results"
          aria-label={copy("图片候选", "Image candidates")}
          aria-live="polite"
        >
          <header>
            <h3>{copy("探索你的下一帧", "Find your next frame")}</h3>
            <button
              className="mw-text-button"
              onClick={() => void check()}
              disabled={loading}
            >
              {copy("刷新", "Refresh")}
            </button>
          </header>
          {!rounds.length && (
            <div className="mw-image-empty">
              <Icon name="image" size={36} />
              <h3>
                {copy("把想象，变成画面。", "Turn an idea into an image.")}
              </h3>
              <p>
                {copy(
                  "描述画面，生成几张候选，选出值得继续的一张。",
                  "Describe a frame, explore a few candidates, and choose one to take further.",
                )}
              </p>
            </div>
          )}
          {rounds.map((round) => (
            <article className="mw-image-round" key={round.id}>
              <header>
                <div>
                  <strong>{round.prompt}</strong>
                  <small>
                    {round.width} × {round.height} ·{" "}
                    {new Date(round.createdAt).toLocaleString(
                      currentLanguage() === "zh" ? "zh-CN" : "en-US",
                    )}
                  </small>
                </div>
                {pending(round) ? (
                  <button
                    className="mw-text-button"
                    onClick={() => void cancel(round)}
                  >
                    {copy("停止生成", "Stop generation")}
                  </button>
                ) : (
                  <button
                    className="mw-text-button"
                    onClick={() => {
                      setPrompt(round.prompt);
                      setRatio(
                        presets.find(
                          (p) => p[1] === round.width && p[2] === round.height,
                        )?.[0] || "16:9",
                      );
                    }}
                  >
                    {copy("复用描述", "Reuse prompt")}
                  </button>
                )}
              </header>
              {round.error && (
                <p className="mw-form-error">{errorText(round.error)}</p>
              )}
              <div className="mw-image-candidates">
                {round.candidates.map((candidate) => (
                  <div className="mw-image-candidate" key={candidate.index}>
                    <div
                      className="mw-image-preview"
                      style={{ aspectRatio: `${round.width}/${round.height}` }}
                    >
                      {candidate.url ? (
                        <img
                          src={candidate.url}
                          alt={copy(
                            `候选图片 ${candidate.index + 1}`,
                            `Image candidate ${candidate.index + 1}`,
                          )}
                        />
                      ) : (
                        <div>
                          {["queued", "running"].includes(candidate.status) ? (
                            <>
                              <i className="mw-native-spinner" />
                              <span>
                                {copy(
                                  candidate.status === "queued"
                                    ? "等待生成"
                                    : "正在生成",
                                  candidate.status === "queued"
                                    ? "Queued"
                                    : "Generating",
                                )}
                              </span>
                            </>
                          ) : (
                            <>
                              <Icon
                                name={
                                  candidate.status === "failed"
                                    ? "close"
                                    : "image"
                                }
                              />
                              <span>
                                {copy(
                                  candidate.status === "failed"
                                    ? "生成失败"
                                    : "已停止",
                                  candidate.status === "failed"
                                    ? "Generation failed"
                                    : "Stopped",
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {candidate.error && (
                      <p className="mw-image-candidate-error">
                        {errorText(candidate.error)}
                      </p>
                    )}
                    {candidate.url && (
                      <div className="mw-image-candidate-actions">
                        <button
                          className="mw-primary"
                          disabled={
                            !!saving || !!savedAsset(round, candidate.index)
                          }
                          onClick={() =>
                            void adopt(round, candidate.index, "assets")
                          }
                        >
                          <Icon name="check" size={14} />
                          {copy(
                            savedAsset(round, candidate.index)
                              ? "已保存"
                              : saving === `${round.id}:${candidate.index}`
                                ? "保存中…"
                                : "保存到素材库",
                            savedAsset(round, candidate.index)
                              ? "Saved"
                              : saving === `${round.id}:${candidate.index}`
                                ? "Saving…"
                                : "Save to assets",
                          )}
                        </button>
                        <button
                          className="mw-secondary"
                          disabled={!!saving}
                          onClick={() =>
                            void adopt(round, candidate.index, "shot")
                          }
                        >
                          {copy("用作镜头参考", "Use as shot reference")}
                        </button>
                        <button
                          className="mw-text-button"
                          disabled={!!saving}
                          onClick={() =>
                            void adopt(round, candidate.index, "canvas")
                          }
                        >
                          {copy("添加到画布", "Add to canvas")}
                          <Icon name="arrow" size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </Modal>
  );
}
