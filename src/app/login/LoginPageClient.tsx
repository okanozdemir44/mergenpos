"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/salon";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Giriş başarısız");
        setLoading(false);
        return;
      }

      // Success -> Redirect
      router.replace(next);
    } catch (err: any) {
      setError("Bağlantı hatası");
      setLoading(false);
    }
  }

  return (
    <main className="page-shell page-shell--narrow">
      <p className="salon-kicker">Öküz Burger POS</p>
      <h1 className="salon-title">Personel girişi</h1>
      <p className="salon-muted" style={{ marginBottom: "1.5rem" }}>
        Giriş sonrası kendi restoranınızın masalarını görürsünüz.
      </p>

      <form className="login-form" onSubmit={onSubmit}>
        <label className="login-label">
          Kullanıcı Adı
          <input
            className="login-input"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="login-label">
          Şifre
          <input
            className="login-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="salon-banner salon-banner--error">{error}</p>}

        <button className="login-button" type="submit" disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
    </main>
  );
}
