"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Magic-link only — no password to set, reset, or leak. The link lands
// back on /items with auth tokens in the URL; createBrowserClient's
// default detectSessionInUrl picks those up automatically (this app is
// entirely client-rendered, so there's no server-side session/cookie
// exchange to wire up for that, unlike Cereza's fuller password+invite
// system).
export default function LoginForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/items` },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center px-4">
      <h1 className="text-lg font-bold text-ink">Acceso de administrador</h1>
      <p className="mt-1 text-sm text-ink-soft">Solo para editar el catálogo — no hace falta para ver o pedir artículos.</p>

      {status === "sent" ? (
        <p className="mt-4 text-sm text-ink">
          Revisa tu correo (<span className="font-medium">{email}</span>) y abre el enlace para entrar.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
            disabled={status === "sending"}
            className="flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === "sending" ? "Enviando..." : "Enviar enlace"}
          </button>
          {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
