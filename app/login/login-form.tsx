"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Password sign-in for Editor/Owner accounts created directly (Supabase
// dashboard), not self-service — unlike the old magic-link /login this
// replaced, there's no way to reach this by just typing an email:
// signInWithPassword only succeeds against an account that already has
// credentials, so there's nothing here for a viewer to self-provision.
// Deliberately not linked from the drawer or anywhere else in the UI —
// Philippe/Jorge just navigate here directly.
export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/items");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center px-4">
      <h1 className="text-lg font-bold text-ink">Acceso</h1>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          disabled={loading}
          className="flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
