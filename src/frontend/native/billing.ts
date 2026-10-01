import { currentLanguage } from "../i18n";
import { studioAI } from "./api";
import "./billing.css";
export type BillingApproval = { version: string; maxCredits: number };
/** The user reviews a server-owned quote before any paid provider dispatch. */
export async function approveGeneration(
  spec: unknown,
  candidateCount = 1,
  signal?: AbortSignal,
): Promise<BillingApproval | null | undefined> {
  signal?.throwIfAborted();
  const status = await studioAI.status();
  if (!status.billingEnabled) return undefined;
  if (
    !Number.isInteger(candidateCount) ||
    candidateCount < 1 ||
    candidateCount > 4
  )
    throw new Error("Invalid candidate count.");
  const [quote, balance] = await Promise.all([
    studioAI.billingQuote(spec),
    studioAI.billingBalance(),
  ]);
  const total = quote.credits * candidateCount;
  if (
    !Number.isSafeInteger(quote.credits) ||
    quote.credits < 0 ||
    !Number.isSafeInteger(total) ||
    typeof quote.version !== "string" ||
    !Number.isFinite(balance.credits) ||
    balance.credits < 0
  )
    throw new Error("The billing quote is unavailable. Please try again.");
  signal?.throwIfAborted();
  const displayedCount =
    (spec as { kind?: string; count?: number })?.kind === "image"
      ? (spec as { count: number }).count
      : candidateCount;
  const unitCredits = total / displayedCount;
  const zh = currentLanguage() === "zh";
  const copy = (en: string, cn: string) => (zh ? cn : en);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "studio-billing-review";
    const heading = document.createElement("h2");
    heading.textContent = copy("Review this generation", "确认本轮生成");
    const amount = document.createElement("p");
    amount.className = "studio-billing-amount";
    amount.textContent = copy(
      `${total.toLocaleString()} credits`,
      `${total.toLocaleString()} 积分`,
    );
    const details = document.createElement("p");
    details.textContent = copy(
      `${unitCredits} credits × ${displayedCount} ${displayedCount === 1 ? "candidate" : "candidates"}. Available: ${balance.credits.toLocaleString()} credits.`,
      `${unitCredits} 积分 × ${displayedCount} 个候选。可用余额：${balance.credits.toLocaleString()} 积分。`,
    );
    const note = document.createElement("p");
    note.textContent = copy(
      "Credits are reserved before generation. Each candidate costs credits; adopting a version does not cost extra. Confirmed failures release unused credits.",
      "提交前预留积分，每个候选独立计费；采纳版本不再扣费。确认失败后释放未使用的积分。",
    );
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = copy("Cancel", "取消");
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "studio-billing-accept";
    const sufficient = balance.credits >= total;
    accept.disabled = !sufficient;
    accept.textContent = sufficient
      ? copy("Generate", "确认生成")
      : copy("Insufficient credits", "积分不足");
    const actions = document.createElement("div");
    actions.append(cancel, accept);
    const abort = () => finish(null);
    const finish = (result: BillingApproval | null) => {
      signal?.removeEventListener("abort", abort);
      dialog.remove();
      resolve(result);
    };
    signal?.addEventListener("abort", abort, { once: true });
    cancel.onclick = () => finish(null);
    accept.onclick = () =>
      finish({ version: quote.version, maxCredits: quote.credits });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.append(heading, amount, details, note, actions);
    document.body.append(dialog);
    if (signal?.aborted) finish(null);
    else dialog.showModal();
  });
}
