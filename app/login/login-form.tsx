"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMagicLink } from "@/lib/auth";

// Single entry point for every "sign in" affordance in the app (drawer
// link, post-logout redirect) — not admin-branded, since the primary
// path (email/magic-link) is exactly the same "save my list" mechanism
// SaveWishlistPrompt offers on /wishlist, just reachable from anywhere.
// Password sign-in is tucked behind a toggle for Editor/Owner accounts
// created directly (not self-service — signInWithPassword only
// succeeds against an account that already has credentials). Continuar
// como invitado is always available, so this is never a dead end for a
// viewer who doesn't want to sign in at all.
export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"email" | "password">("email");

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [pwEmail, setPwEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus("sending");
    setEmailError(null);
    try {
      await sendMagicLink(email, `${window.location.origin}/items`);
      setEmailStatus("sent");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "No se pudo enviar el enlace.");
      setEmailStatus("error");
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwLoading(true);
    setPwError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: pwEmail, password });
    if (error) {
      setPwError(error.message);
      setPwLoading(false);
      return;
    }
    router.push("/items");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center px-4">
      <h1 className="text-lg font-bold text-ink">Iniciar sesión</h1>

      {mode === "email" ? (
        emailStatus === "sent" ? (
          <p className="mt-4 text-sm text-ink">
            Revisa tu correo (<span className="font-medium">{email}</span>) y abre el enlace para entrar.
          </p>
        ) : (
          <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="h-12 w-full rounded-md border border-line-strong bg-card px-3 text-base text-ink"
            />
            <button
              type="submit"
              disabled={emailStatus === "sending"}
              className="flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
            >
              {emailStatus === "sending" ? "Enviando..." : "Enviar enlace"}
            </button>
            {emailStatus === "error" && <p className="text-sm text-red-600">{emailError}</p>}
          </form>
        )
      ) : (
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={pwEmail}
            onChange={(e) => setPwEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="h-12 w-full rounded-md border border-line-strong bg-card px-3 text-base text-ink"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="h-12 w-full rounded-md border border-line-strong bg-card px-3 text-base text-ink"
          />
          <button
            type="submit"
            disabled={pwLoading}
            className="flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
          >
            {pwLoading ? "Entrando..." : "Entrar"}
          </button>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
        </form>
      )}

      <button
        type="button"
        onClick={() => setMode(mode === "email" ? "password" : "email")}
        className="mt-3 text-left text-xs text-ink-faint underline"
      >
        {mode === "email" ? "¿Eres administrador? Entrar con contraseña" : "Entrar con correo"}
      </button>

      <button
        type="button"
        onClick={() => router.push("/items")}
        className="mt-6 text-sm text-ink-soft underline"
      >
        Continuar como invitado
      </button>
    </div>
  );
}
