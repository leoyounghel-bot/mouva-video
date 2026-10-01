import { useEffect, useRef, useState } from "react";
import { t as tr, currentLanguage, LanguageControl } from "../i18n";
import { useWorkspace } from "../context";
import { signOut, usesMouvaLogin } from "./session";
import "./account-menu.css";

export function AccountMenu() {
  const w = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const origin = import.meta.env.VITE_MOUVA_LOGIN_ORIGIN || "https://mouva.ai";
  const lang = currentLanguage();
  const login = `${origin}/auth?returnTo=${encodeURIComponent(`/video?lang=${lang}`)}&lang=${lang}`;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="mw-studio-account" ref={root}>
      <button
        ref={trigger}
        aria-label={tr("Mouva account")}
        title={tr("Mouva account")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="mw-account-avatar" aria-hidden="true">
          M
        </span>
        <span>{tr(usesMouvaLogin ? "Account" : "Sign in")}</span>
      </button>
      {open && (
        <div
          className="mw-account-menu"
          role="dialog"
          aria-label={tr("Mouva account")}
        >
          <strong>{tr("Mouva account")}</strong>
          <p>
            {tr(
              usesMouvaLogin
                ? "You’re connected with your Mouva account."
                : "Sign in to use your Mouva account.",
            )}
          </p>
          <a href={login}>{tr("Sign in or switch account")}</a>
          <a href={`${origin}/studio`}>Mouva Design ↗</a>
          <a href={`${origin}/pricing?lang=${lang}`}>
            {tr("Credits and plans")}
          </a>
          <div className="mw-account-language">
            <span>{tr("Interface language")}</span>
            <LanguageControl />
          </div>
          {usesMouvaLogin && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await signOut();
                  setOpen(false);
                } catch (error) {
                  w.notify((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr(busy ? "Signing out…" : "Sign out of Studio")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
