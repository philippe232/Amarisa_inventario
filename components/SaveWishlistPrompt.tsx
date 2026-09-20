"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";

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
export default function SaveWishlistPrompt() {
  const supabase = createClient();
  const { loading, isAnonymous, email } = useSessionInfo();
  const [inputEmail, setInputEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  if (!isAnonymous) {
    return <p className="border-b border-line px-3.5 py-2 text-xs text-ink-soft">Lista guardada con {email}</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const emailRedirectTo = `${window.location.origin}/wishlist`;
    const { error: linkError } = await supabase.auth.updateUser({ email: inputEmail }, { emailRedirectTo });

    if (linkError) {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: inputEmail,
        options: { emailRedirectTo },
      });
      if (otpError) {
        setError(otpError.message);
        setStatus("error");
        return;
      }
    }
    setStatus("sent");
  }

  return (
    <div className="border-b border-line px-3.5 py-3">
      {status === "sent" ? (
        <p className="text-sm text-ink">
          Revisa tu correo (<span className="font-medium">{inputEmail}</span>) y abre el enlace para no perder tu lista.
        </p>
      ) : (
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
      )}
      {status === "error" && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
