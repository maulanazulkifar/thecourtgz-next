"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (key: string, opts: { action: string }) => Promise<string>;
    };
  }
}

export function AdminLoginForm({ siteKey }: { siteKey: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [siteKey]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");

    let token = "local-dev";
    if (siteKey && window.grecaptcha) {
      try {
        token = await new Promise<string>((resolve, reject) => {
          window.grecaptcha!.ready(() => {
            window
              .grecaptcha!.execute(siteKey, { action: "login" })
              .then(resolve)
              .catch(reject);
          });
        });
      } catch {
        setError("Verifikasi keamanan gagal. Coba lagi.");
        setLoading(false);
        return;
      }
    }

    const result = await signIn("admin", {
      username,
      password,
      token,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error === "CredentialsSignin" ? "Kredensial tidak valid." : result.error);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <div className="blc-alert blc-alert-danger" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      <div className="blc-field">
        <label className="blc-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="blc-input"
          type="text"
          name="username"
          required
          autoFocus
          autoComplete="username"
          placeholder="Email admin"
        />
      </div>

      <div className="blc-field">
        <label className="blc-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="blc-input"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Password"
        />
      </div>

      <button className={`blc-btn ${loading ? "is-loading" : ""}`} type="submit" disabled={loading}>
        {loading ? "Masuk..." : "Log In"}
      </button>
    </form>
  );
}
