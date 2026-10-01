import { t as tr, useLanguage, currentLanguage } from "../i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { setWorkspaceOwner, usesMouvaLogin } from "./session";
import "./auth.css";
type Session = { ownerId: string; expiresAt: number };
async function authRequest(path: string, body?: object): Promise<any> {
  const response = await fetch("/api/ai/auth/" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(
        data.message || "Sign-in is temporarily unavailable. Please try again.",
      ),
      { status: response.status },
    );
  return data;
}
export function AuthGate({ children }: { children: ReactNode }) {
  useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(usesMouvaLogin);
  const [message, setMessage] = useState("");
  const loginStarted = useRef(false);
  async function login() {
    if (loginStarted.current) return;
    loginStarted.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { loginUrl } = await authRequest("start", {});
      const target = new URL(loginUrl);
      if (
        target.origin !==
          new URL(import.meta.env.VITE_MOUVA_LOGIN_ORIGIN || "https://mouva.ai")
            .origin ||
        target.pathname !== "/video"
      )
        throw new Error("The sign-in address is not configured correctly.");
      target.searchParams.set("lang", currentLanguage());
      if (new URLSearchParams(location.search).get("section") === "learn")
        target.searchParams.set("section", "learn");
      location.assign(target.href);
    } catch (error) {
      loginStarted.current = false;
      setMessage((error as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!usesMouvaLogin) return;
    let active = true;
    const accept = (data: Session) => {
      if (!/^[a-f0-9]{64}$/.test(data.ownerId) || data.expiresAt <= Date.now())
        throw new Error("Please sign in again.");
      if (active) {
        setWorkspaceOwner(data.ownerId);
        setSession(data);
        setBusy(false);
      }
    };
    const reset = () => {
      setSession(null);
      setBusy(false);
      setMessage("Sign in to continue with your Mouva account.");
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "mouva-video-signout") reset();
    };
    const hash = new URLSearchParams(location.hash.slice(1)),
      code = hash.get("handoff");
    const query = new URLSearchParams(location.search),
      begin = query.has("login");
    if (code || begin) {
      query.delete("login");
      history.replaceState(
        null,
        "",
        location.pathname + (query.size ? "?" + query : ""),
      );
    }
    if (begin && !code) void login();
    else
      void authRequest(
        code ? "exchange" : "session",
        code ? { code } : undefined,
      )
        .then(accept)
        .catch((error) => {
          if (active) {
            if (!code && error.status === 401) {
              void login();
              return;
            }
            setMessage(code ? error.message : "");
            setBusy(false);
          }
        });
    window.addEventListener("mouva-auth-required", reset);
    window.addEventListener("storage", storage);
    return () => {
      active = false;
      window.removeEventListener("mouva-auth-required", reset);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const expires = setTimeout(
      () => window.dispatchEvent(new Event("mouva-auth-required")),
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => clearTimeout(expires);
  }, [session]);
  if (!usesMouvaLogin || session) return children;
  return (
    <main className="mv-auth">
      <a
        className="mv-auth-brand"
        href={import.meta.env.VITE_MOUVA_LOGIN_ORIGIN || "https://mouva.ai"}
      >
        mouva
      </a>
      <section className="mv-auth-card" aria-busy={busy}>
        <h1>
          {tr(
            busy
              ? "Connecting to Mouva…"
              : "Sign in to continue with your Mouva account.",
          )}
        </h1>
        <p>{tr("Use your existing Mouva account.")}</p>
        {message && (
          <p className="mv-auth-message" role="status">
            {tr(message)}
          </p>
        )}
        <button disabled={busy} onClick={() => void login()}>
          {tr(busy ? "Connecting to Mouva…" : "Continue with Mouva")}
          <span aria-hidden="true">↗</span>
        </button>
        <small>{tr("Use your existing Mouva account.")}</small>
        <nav className="mv-auth-workspaces" aria-label="Mouva">
          <a
            href={`${import.meta.env.VITE_MOUVA_LOGIN_ORIGIN || "https://mouva.ai"}/auth?returnTo=%2Fstudio`}
          >
            Mouva Design ↗
          </a>
          <button disabled={busy} onClick={() => void login()}>
            Mouva Studio ↗
          </button>
        </nav>
      </section>
      <footer>{tr("mouva studio · Your ideas, in motion.")}</footer>
    </main>
  );
}
