"use client";

import { FormEvent, useState } from "react";
import type { ActionResult } from "@/app/actions/inventory";

export function SimpleForm({
  action,
  children,
  submitLabel = "Simpan",
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await action(fd);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? "Berhasil.");
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit}>
      {message ? <div className="blc-alert blc-alert-success">{message}</div> : null}
      {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}
      {children}
      <button type="submit" className={`blc-btn ${loading ? "is-loading" : ""}`} disabled={loading}>
        {submitLabel}
      </button>
    </form>
  );
}
