export type ConversationRecord = {
  id: string;
  role: "user" | "assistant";
  text: string;
  shot?: string;
  shotId?: string;
  state?: "applied" | "pending" | "error" | "submitted" | "cancelled" | "stale";
  jobIds?: string[];
  restored?: boolean;
};
type Store = Pick<Storage, "getItem" | "setItem">;
const states = ["applied", "pending", "error", "submitted", "cancelled", "stale"];

function records(value: unknown): ConversationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-40).flatMap((item) => {
    if (!item || typeof item.id !== "string" || item.id.length > 160 ||
        !["user", "assistant"].includes(item.role) || typeof item.text !== "string") return [];
    // Restore context only. Never restore executable plans or commands from storage.
    return [{
      id: item.id, role: item.role, text: item.text.slice(0, 8000),
      ...(typeof item.shot === "string" ? { shot: item.shot.slice(0, 300) } : {}),
      ...(typeof item.shotId === "string" ? { shotId: item.shotId.slice(0, 160) } : {}),
      ...(states.includes(item.state) ? { state: item.state } : {}),
      ...(Array.isArray(item.jobIds) ? {
        jobIds: item.jobIds.filter((id: unknown) => typeof id === "string" && id.length <= 160).slice(0, 4),
      } : {}),
    }];
  });
}

export function readConversation(store: Store, key: string) {
  try {
    const raw = store.getItem(key);
    if (!raw || raw.length > 400000) return { messages: [], draft: "" };
    const saved = JSON.parse(raw);
    return {
      messages: records(saved?.messages).map(message => ({
        ...message, restored: true,
        ...(message.state === "pending" ? { state: "stale" as const } : {}),
      })),
      draft: typeof saved?.draft === "string" ? saved.draft.slice(0, 4000) : "",
    };
  } catch { return { messages: [], draft: "" }; }
}

export function saveConversation(
  store: Store, key: string, messages: ConversationRecord[], draft: string, busy: boolean,
) {
  try {
    const saved = records(messages);
    const last = saved.at(-1);
    if (busy && last?.role === "assistant" && !last.state) {
      last.state = "cancelled";
      last.text = "此请求被页面刷新中断，请检查任务状态后继续。";
    }
    store.setItem(key, JSON.stringify({ messages: saved, draft: draft.slice(0, 4000) }));
  } catch { /* A full or unavailable browser store must not block editing. */ }
}
