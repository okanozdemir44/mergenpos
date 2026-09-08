import { Suspense } from "react";
import LoginPageClient from "./LoginPageClient";

export const metadata = {
  title: "Giriş · Mergen POS",
};

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <p className="salon-muted">Yükleniyor…</p>
        </main>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}
