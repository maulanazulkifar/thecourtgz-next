"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserActionResult } from "@/app/actions/users";

export function UserForm({
  action,
  roles,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<UserActionResult>;
  roles: { id: number; name: string }[];
  initial?: { name: string; email: string; role: string };
  submitLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await action(new FormData(e.currentTarget));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/users");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}
      <div className="blc-field">
        <label className="blc-label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          className="blc-input"
          required
          defaultValue={initial?.name}
        />
      </div>
      <div className="blc-field">
        <label className="blc-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="blc-input"
          required
          defaultValue={initial?.email}
        />
      </div>
      <div className="blc-field">
        <label className="blc-label" htmlFor="password">
          Password {initial ? "(kosongkan jika tidak diubah)" : ""}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="blc-input"
          minLength={initial ? undefined : 6}
          required={!initial}
        />
      </div>
      <div className="blc-field">
        <label className="blc-label" htmlFor="role">
          Role
        </label>
        <select
          id="role"
          name="role"
          className="blc-select"
          required
          defaultValue={initial?.role ?? "member"}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={`blc-btn ${loading ? "is-loading" : ""}`} disabled={loading}>
        {submitLabel}
      </button>
    </form>
  );
}
