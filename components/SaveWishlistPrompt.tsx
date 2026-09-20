"use client";

import { useState, useSyncExternalStore } from "react";
import { sendMagicLink, useSessionInfo } from "@/lib/auth";

// Lets a viewer optionally attach their email to their existing
// (invisible, anonymous) session, purely so their wishlist survives a
// cleared browser or a different device — never framed as "admin
// access" anywhere, and never exposed in the drawer. Editor/Owner
// access is granted purely by whether that email happens to be in the
// admins table (0004_admin_roles_and_photo_uploads.sql) — same
// mechanism, no separate "admin login" flow needed.
//
// updateUser({ email }) is tried first: called on the CURRENT anonymous
// session, it links that email to this session's existing user_id, so
// every wishlist_items row already under it stays put — no merge step
// needed. Only falls back to signInWithOtp (a normal sign-in, which
// lands on a DIFFERENT, pre-existing user_id) when that email already
// has an account — e.g. this is a second device recovering a
// previously-saved list, where there's nothing local worth preserving
// anyway.
//
// "Continuar sin guardar" is a real, explicit choice, not just "ignore
// the form" — dismissal persists (localStorage) so a guest who's
// already declined doesn't see the same prompt every visit.
const DISMISS_KEY = "amarisa:wishlistSavePromptDismissed";

function noopSubscribe() {
  return () => {};
}
function getDismissedSnapshot() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
function getServerDismissedSnapshot() {
  return false;
}

export default function SaveWishlistPrompt() {
  const { loading, isAnonymous, email } = useSessionInfo();
  const [inputEmail, setInputEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Reads localStorage the SSR-safe way (false on the server and on the
  // very first client render, then corrects) — same idiom ModalSheet
  // uses for its own mount check. persistedDismiss won't itself update
  // after a same-tab write, so the dismiss button also sets local state
  // directly for an immediate re-render.
  const persistedDismiss = useSyncExternalStore(noopSubscribe, getDismissedSnapshot, getServerDismissedSnapshot);
  const [justDismissed, setJustDismissed] = useState(false);
  const dismissed = persistedDismiss || justDismissed;

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage full/unavailable — same tolerance as the rest of this
      // app's local caches; the prompt just reappears next visit.
    }
    setJustDismissed(true);
  }

  if (loading || dismissed) return null;

  if (!isAnonymous) {
    return <p className="border-b border-line px-3.5 py-2 text-xs text-ink-soft">Lista guardada con {email}</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await sendMagicLink(inputEmail, `${window.location.origin}/wishlist`);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el enlace.");
      setStatus("error");
    }
  }

  return (
    <div className="border-b border-line px-3.5 py-3">
      {status === "sent" ? (
        <p className="text-sm text-ink">
          Revisa tu correo (<span className="font-medium">{inputEmail}</span>) y abre el enlace para no perder tu lista.
        </p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="email"
              required
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              placeholder="Tu correo, para no perder tu lista"
              className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="h-10 shrink-0 rounded-md bg-ink px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {status === "sending" ? "..." : "Guardar"}
            </button>
          </form>
          <button type="button" onClick={handleDismiss} className="mt-1.5 text-xs text-ink-faint underline">
            Continuar sin guardar
          </button>
        </>
      )}
      {status === "error" && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
