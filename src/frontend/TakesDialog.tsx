import { t as tr } from "./i18n";
import { useState } from "react";
import { useWorkspace } from "./context";
import { Icon, Modal, Photo } from "./Primitives";
import { NativeViewport } from "./native/NativeViewport";
import { sceneThumbnail } from "./native/templates";
import type { Take } from "./types";
import "./takes.css";

const feedback = ["主体不一致", "动作不自然", "运镜太快", "画面有瑕疵"];
export function TakesDialog() {
  const w = useWorkspace(),
    shot = w.shot;
  const takes = shot.takes.filter(
    (t) =>
      t.videoUrl ||
      t.scene ||
      t.assetId ||
      (t.status === "succeeded" &&
        t.label !== "Reference" &&
        t.label !== "等待上传或生成"),
  );
  const [filter, setFilter] = useState("all");
  const [focused, setFocused] = useState(shot.viewingTakeId);
  const [compared, setCompared] = useState<string | null>(null);
  const selected = takes.find((t) => t.id === focused) || takes.at(-1);
  const other =
    compared !== selected?.id
      ? takes.find((t) => t.id === compared)
      : undefined;
  const visible = [...takes]
    .reverse()
    .filter((t) =>
      filter === "favorites"
        ? t.favorite
        : filter === "video"
          ? !!t.videoUrl
          : true,
    );
  const jobs = w.jobs.filter(
    (j) =>
      j.projectId === w.project.id &&
      j.shotId === shot.id &&
      j.kind !== "export" &&
      !takes.some((t) => t.id === j.id),
  );
  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  );
  function review(take: Take, patch: Partial<Take>) {
    w.update((p) => {
      const target = p.shots
        .find((s) => s.id === shot.id)
        ?.takes.find((t) => t.id === take.id);
      if (target) Object.assign(target, patch);
    }, "Review candidate");
  }
  function reroll() {
    if (!selected) {
      w.openDirector({ shotId: shot.id });
      return;
    }
    w.execute([
      {
        tool: "take.preview",
        targetId: shot.id,
        args: { takeId: selected.id },
      },
    ]);
    const brief = selected.instruction || shot.prompt;
    const note = selected.reviewNote?.trim();
    w.openDirector({
      shotId: shot.id,
      mode: "finish",
      reviseScene: false,
      referenceAssetIds: [
        ...new Set([
          ...(shot.referenceAssetIds || []),
          ...(selected.assetId &&
          w.project.assets.some(
            (a) => a.id === selected.assetId && a.kind === "image",
          )
            ? [selected.assetId]
            : []),
        ]),
      ],
      instruction: [brief, note ? "本轮重点修正：" + note : ""]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 8000),
    });
  }
  function preview(take: Take) {
    return take.videoUrl ? (
      <video
        key={take.id}
        src={take.videoUrl}
        controls
        playsInline
        preload="metadata"
      />
    ) : take.scene ? (
      <NativeViewport
        key={take.id}
        scene={take.scene}
        assets={w.project.assets}
        time={Math.min(2, take.scene.duration)}
      />
    ) : (
      <Photo media={take.image} label={tr(take.label)} />
    );
  }
  return (
    <Modal
      title={tr("候选卡组")}
      subtitle={shot.title + tr(" · 每次尝试都有价值，挑一张你真正满意的。")}
      onClose={() => w.setModal(null)}
      wide
    >
      <div className="mw-take-lab">
        <div className="mw-take-summary">
          <div>
            <span className="mw-take-eyebrow">
              {tr("EXPLORE · COMPARE · KEEP")}
            </span>
            <h3>
              {tr("好镜头，值得多试一次")}
              <span>✦</span>
            </h3>
            <p>
              {tr(
                selected?.scene
                  ? "保留构图与运镜，探索不同的视频表现。"
                  : "先确定源场景，再探索不同的视频表现。",
              )}
              {tr("采用前，当前剪辑始终保留。")}
            </p>
          </div>
          <div className="mw-take-stat">
            <strong>
              {takes
                .filter((t) => t.videoUrl)
                .length.toString()
                .padStart(2, "0")}
            </strong>
            <span>{tr("视频候选")}</span>
          </div>
        </div>
        <div className="mw-take-layout">
          <section className="mw-take-collection" aria-label={tr("候选版本")}>
            <div
              className="mw-take-filter"
              role="group"
              aria-label={tr("筛选候选")}
            >
              {[
                ["all", "全部版本"],
                ["video", "视频"],
                ["favorites", "已收藏"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => {
                    setFilter(id);
                    if (
                      (id === "video" && !selected?.videoUrl) ||
                      (id === "favorites" && !selected?.favorite)
                    ) {
                      const next = [...takes]
                        .reverse()
                        .find((t) =>
                          id === "video" ? !!t.videoUrl : t.favorite,
                        );
                      if (next) setFocused(next.id);
                    }
                  }}
                >
                  {tr(label)}
                  {id === "favorites" && (
                    <span>{tr(takes.filter((t) => t.favorite).length)}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mw-take-card-grid">
              {visible.map((take) => (
                <article
                  key={take.id}
                  className={
                    "mw-take-card " +
                    (selected?.id === take.id ? "selected" : "") +
                    (shot.adoptedTakeId === take.id ? " adopted" : "")
                  }
                >
                  <button
                    className="mw-take-card-preview"
                    aria-label={tr("预览 ") + tr(take.label)}
                    aria-pressed={selected?.id === take.id}
                    onClick={() => setFocused(take.id)}
                  >
                    <Photo
                      media={
                        take.scene
                          ? sceneThumbnail({
                              ...take.scene,
                              title: tr(take.scene.title),
                            })
                          : take.image
                      }
                      label={tr(take.label)}
                    />
                    <span className="mw-take-card-kind">
                      <Icon
                        name={
                          take.videoUrl ? "video" : take.scene ? "box" : "image"
                        }
                        size={12}
                      />
                      {tr(
                        take.videoUrl
                          ? take.scene
                            ? "视频 · 源场景封面"
                            : "视频"
                          : take.scene
                            ? "可编辑 3D"
                            : "素材",
                      )}
                    </span>
                    {shot.adoptedTakeId === take.id && (
                      <span className="mw-take-adopted">
                        <Icon name="check" size={12} />
                        {tr("已采用")}
                      </span>
                    )}
                  </button>
                  <div className="mw-take-card-info">
                    <div>
                      <strong>{tr(take.label)}</strong>
                      <small>
                        {tr(
                          take.candidateIndex
                            ? `${tr("本轮 ")}${take.candidateIndex} / ${take.candidateCount} · `
                            : "",
                        )}
                        {(
                          take.duration ??
                          take.scene?.duration ??
                          shot.duration
                        ).toFixed(1)}
                        {tr("s")}
                      </small>
                    </div>
                    <button
                      className={take.favorite ? "favorite" : ""}
                      aria-label={
                        (take.favorite ? tr("取消收藏 ") : tr("收藏 ")) +
                        tr(take.label)
                      }
                      aria-pressed={!!take.favorite}
                      onClick={() => review(take, { favorite: !take.favorite })}
                    >
                      <Icon name="spark" size={17} />
                    </button>
                  </div>
                  {take.reviewNote && (
                    <p className="mw-take-note">{take.reviewNote}</p>
                  )}
                </article>
              ))}
              {filter === "all" &&
                jobs.map((job) => (
                  <article
                    className={"mw-take-card mw-take-pending " + job.status}
                    key={job.id}
                  >
                    <div>
                      {job.status === "queued" || job.status === "running" ? (
                        <span className="mw-flow-spinner" />
                      ) : (
                        <Icon
                          name={job.status === "failed" ? "close" : "clock"}
                          size={24}
                        />
                      )}
                      <strong>
                        {tr(
                          job.status === "queued"
                            ? "等待揭晓"
                            : job.status === "running"
                              ? "正在生成"
                              : job.status === "failed"
                                ? "生成失败"
                                : job.status === "cancelled"
                                  ? "已取消"
                                  : "结果载入中",
                        )}
                      </strong>
                      <small>
                        {tr(
                          job.candidateIndex
                            ? `${tr("候选 ")}${job.candidateIndex} / ${job.candidateCount}`
                            : "生成任务",
                        )}
                      </small>
                    </div>
                    <p>{tr(job.error || job.phase)}</p>
                    <button onClick={() => w.setModal("jobs")}>
                      {tr("查看任务")}
                      <Icon name="arrow" size={13} />
                    </button>
                  </article>
                ))}
            </div>
            {!visible.length && !(filter === "all" && jobs.length) && (
              <div className="mw-take-empty">
                <Icon name="layers" size={38} />
                <strong>
                  {tr(
                    filter === "favorites"
                      ? "把心动的版本留在这里"
                      : "你的第一组候选，即将开始",
                  )}
                </strong>
                <p>
                  {tr(
                    filter === "favorites"
                      ? "点击卡片上的星标收藏，随时回来比较。"
                      : "先生成可编辑场景，再探索不同的视频候选。",
                  )}
                </p>
              </div>
            )}
          </section>
          <aside className="mw-take-review">
            <header>
              <strong>{tr(other ? "并排比较" : "查看这一版")}</strong>
              {activeJobs.length > 0 && (
                <span role="status">
                  {tr(activeJobs.length)}
                  {tr("个正在生成")}
                </span>
              )}
            </header>
            {selected ? (
              <>
                <div
                  className={
                    "mw-take-preview-panes " + (other ? "comparing" : "")
                  }
                >
                  <section>
                    {tr(preview(selected))}
                    <span>{tr(selected.label)}</span>
                  </section>
                  {other && (
                    <section>
                      {tr(preview(other))}
                      <span>{tr(other.label)}</span>
                    </section>
                  )}
                </div>
                <label className="mw-take-compare-select">
                  {tr("对比另一版")}
                  <select
                    aria-label={tr("对比另一版")}
                    value={other?.id || ""}
                    onChange={(e) => setCompared(e.target.value || null)}
                  >
                    <option value="">{tr("只看当前版本")}</option>
                    {takes
                      .filter((t) => t.id !== selected.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {tr(t.label)}
                          {tr(t.id === shot.adoptedTakeId ? " · 已采用" : "")}
                        </option>
                      ))}
                  </select>
                </label>
                <CandidateFeedback
                  key={selected.id}
                  take={selected}
                  onSave={(reviewNote) => review(selected, { reviewNote })}
                />
                <button
                  className="mw-take-adopt-button"
                  disabled={
                    selected.status !== "succeeded" ||
                    selected.id === shot.adoptedTakeId
                  }
                  onClick={() => {
                    if (
                      w.execute([
                        {
                          tool: "take.adopt",
                          targetId: shot.id,
                          args: { takeId: selected.id, fitDuration: true },
                        },
                      ])
                    )
                      w.notify("已采用这一版，可撤销。其他候选仍保留。");
                  }}
                >
                  <Icon name="check" size={17} />
                  {tr(
                    selected.id === shot.adoptedTakeId
                      ? "已在剪辑中"
                      : "采用这一版",
                  )}
                </button>
              </>
            ) : (
              <div className="mw-take-review-placeholder">
                <Icon name="play" size={36} />
                <p>{tr("候选完成后，在这里预览、比较和选择。")}</p>
              </div>
            )}
            <button className="mw-take-reroll-button" onClick={reroll}>
              <Icon name="spark" size={17} />
              {tr(
                selected
                  ? selected.scene
                    ? "以这一版为基础，再抽一组"
                    : "沿用描述，再抽一组"
                  : "生成第一组候选",
              )}
              <Icon name="arrow" size={16} />
            </button>
            <p className="mw-take-cost-note">
              {tr(
                "每个候选都是独立生成任务，可能产生模型费用。增加候选数量不会保证生成质量。",
              )}
            </p>
          </aside>
        </div>
      </div>
    </Modal>
  );
}

// Typing a review stays local to this field; save at the end of the edit so
// every keystroke does not clone the project or redraw the canvas.
function CandidateFeedback({
  take,
  onSave,
}: {
  take: Take;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(take.reviewNote || "");
  return (
    <div className="mw-take-feedback">
      <label htmlFor="take-review-note">{tr("下一轮，哪里需要更好？")}</label>
      <div>
        {feedback.map((item) => (
          <button
            key={item}
            onClick={() => {
              const next = note.includes(item)
                ? note
                : [note, item].filter(Boolean).join("；").slice(0, 1000);
              setNote(next);
              onSave(next);
            }}
          >
            {tr(item)}
          </button>
        ))}
      </div>
      <textarea
        id="take-review-note"
        value={note}
        maxLength={1000}
        placeholder={tr("例如：保留主体和构图，让镜头慢一点，修正手部动作…")}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note !== (take.reviewNote || "")) onSave(note);
        }}
      />
      <small>{tr("修正要求会带入下一轮描述；3D 场景可保持不变。")}</small>
    </div>
  );
}
