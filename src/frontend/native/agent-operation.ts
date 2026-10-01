export type OperationStorage = Pick<Storage, "getItem" | "setItem">;
const volatile = new Map<string, Record<string, string>>();
/** Retain only content digests and IDs, never instructions or media. */
export async function agentOperation(
  scope: string,
  body: unknown,
  storage?: OperationStorage,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const hash = Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const key = "mouva-agent-operations-v1:" + scope;
  let records: Record<string, string> = { ...volatile.get(key) };
  try {
    const parsed = JSON.parse(storage?.getItem(key) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      records = Object.fromEntries(
        Object.entries(parsed).filter(
          ([k, v]) =>
            /^[a-f0-9]{64}$/.test(k) &&
            typeof v === "string" &&
            /^[a-f0-9-]{36}$/.test(v),
        ),
      ) as Record<string, string>;
  } catch {
    /* Session fallback remains available. */
  }
  const previous = records[hash];
  const requestId = previous || crypto.randomUUID();
  const save = () => {
    volatile.set(key, records);
    try {
      storage?.setItem(key, JSON.stringify(records));
    } catch {}
  };
  records[hash] = requestId;
  records = Object.fromEntries(Object.entries(records).slice(-20));
  save();
  return {
    requestId,
    previous: !!previous,
    finish: () => {
      delete records[hash];
      save();
    },
  };
}
