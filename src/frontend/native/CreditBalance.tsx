import { useEffect, useState } from "react";
import { currentLanguage, text } from "../i18n";
import { studioAI } from "./api";
import "./billing.css";
type Balance = Awaited<ReturnType<typeof studioAI.billingBalance>>;
/** Account-scoped billing receipts; provider prompts and credentials never enter this view. */
export function CreditBalance() {
  const [enabled, setEnabled] = useState(false),
    [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    studioAI
      .status()
      .then((s) => {
        if (alive) setEnabled(s.billingEnabled === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const refresh = () =>
      studioAI
        .billingBalance()
        .then((b) => {
          if (alive) {
            setBalance(b);
            setError(false);
          }
        })
        .catch(() => {
          if (alive) setError(true);
        });
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open]);
  const locale = currentLanguage() === "zh" ? "zh-CN" : "en";
  const number = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 3 });
  const activity = balance?.activity ?? balance?.history.map((row) => ({
    ...row, product: 'studio' as const, kind: row.spec.kind,
  })) ?? [];
  const operation = (kind: string) => ({
    text: text('AI 设计', 'AI design'), image: text('图片生成', 'Image generation'),
    agent: text('助手编辑', 'Agent editing'), scene: text('3D 场景', '3D scene'),
    reference: text('动作参考', 'Motion reference'), video: text('视频生成', 'Video generation'),
  }[kind] || text('镜头生成', 'Shot generation'));
  if (!enabled) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={text("积分与账单", "Credits and billing")}
      >
        {text("积分", "Credits")}
      </button>
      {open && (
        <dialog
          className="studio-billing-review studio-credit-history"
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          onCancel={() => setOpen(false)}
        >
          <h2>{text("积分与账单", "Credits and billing")}</h2>
          {error && (
            <p role="alert">
              {text(
                "余额暂时无法读取，请稍后重试。",
                "Your balance is unavailable. Please try again.",
              )}
            </p>
          )}
          {!balance && !error && (
            <p role="status">{text("正在加载…", "Loading…")}</p>
          )}
          {balance && (
            <>
              <p className="studio-billing-amount">
                {number(balance.credits)}{" "}
                <small>{text("可用积分", "available credits")}</small>
              </p>
              <p>
                {number(balance.reservedCredits)}{" "}
                {text(
                  "积分预留中。余额与 Mouva Design 共用。",
                  "credits reserved. Your balance is shared with Mouva Design.",
                )}
              </p>
              <a
                href="https://mouva.ai/pricing"
                target="_blank"
                rel="noopener noreferrer"
              >
                {text("套餐与订阅管理", "Plans and subscription management")} ↗
              </a>
              <h3>{balance.activity ? text("Design 与 Studio 消费记录", "Design & Studio activity") : text("Studio 消费记录", "Studio activity")}</h3>
              {!activity.length && (
                <p>
                  {text("暂无生成消费记录。", "No generation activity yet.")}
                </p>
              )}
              <ul>
                {activity.map((row) => (
                  <li key={row.operationId}>
                    <div>
                      <strong>
                        {row.product === 'design' ? 'Mouva Design' : 'Mouva Studio'} · {operation(row.kind)}
                      </strong>
                      <time>
                        {new Date(row.createdAt).toLocaleString(locale)}
                      </time>
                    </div>
                    <p>
                      {row.chargedCredits === null
                        ? `${number(row.reservedCredits)} ${text("积分预留中", "credits reserved")}`
                        : row.chargedCredits === 0 ? text('已释放', 'Released')
                          : `${number(row.chargedCredits)} ${text("积分已结算", "credits charged")}`}
                    </p>
                  </li>
                ))}
              </ul>
              <p>
                {text(
                  "提交结果不确定的任务会保留预留额度，完成对账后更新。",
                  "Uncertain submissions keep their reservation until reconciled.",
                )}
              </p>
            </>
          )}
          <div>
            <button onClick={() => setOpen(false)}>
              {text("关闭", "Close")}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
