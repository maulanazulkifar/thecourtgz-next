"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addManagerAction,
  removeManagerAction,
} from "@/app/actions/managers";
import type { ManagerListItem } from "@/lib/category-access";

export type ManagerCandidateUser = {
  id: string;
  name: string;
  email: string;
  discordId: string | null;
  discordUsername: string | null;
};

export function ManagerClient({
  initialManagers,
  candidateUsers,
  actorEmail,
}: {
  initialManagers: ManagerListItem[];
  candidateUsers: ManagerCandidateUser[];
  actorEmail: string;
}) {
  const router = useRouter();
  const [managers, setManagers] = useState(initialManagers);
  const [candidates, setCandidates] = useState(candidateUsers);
  const [mode, setMode] = useState<"pick" | "manual">("pick");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setManagers(initialManagers);
  }, [initialManagers]);

  useEffect(() => {
    setCandidates(candidateUsers);
  }, [candidateUsers]);

  const filteredCandidates = useMemo(() => {
    const needle = userQuery.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        (u.discordUsername ?? "").toLowerCase().includes(needle) ||
        (u.discordId ?? "").includes(needle) ||
        u.email.toLowerCase().includes(needle),
    );
  }, [candidates, userQuery]);

  const selectedUser = candidates.find((u) => u.id === selectedUserId) ?? null;

  async function submitAdd(value: string) {
    setError(null);
    setMessage(null);
    setAdding(true);
    const result = await addManagerAction(value);
    setAdding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message);
    setManualInput("");
    setSelectedUserId("");
    setUserQuery("");
    startTransition(() => router.refresh());
  }

  async function onAddManual(e: FormEvent) {
    e.preventDefault();
    if (!manualInput.trim()) return;
    await submitAdd(manualInput.trim());
  }

  async function onAddSelected(e: FormEvent) {
    e.preventDefault();
    if (!selectedUser) {
      setError("Pilih user dulu dari daftar.");
      return;
    }
    const value = selectedUser.discordId || selectedUser.email;
    await submitAdd(value);
  }

  async function onRemove(email: string) {
    if (!confirm(`Cabut akses manager untuk ${email}?`)) return;
    setError(null);
    setMessage(null);
    setBusyEmail(email);
    const result = await removeManagerAction(email);
    setBusyEmail(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message);
    setManagers((list) => list.filter((m) => m.email !== email));
    startTransition(() => router.refresh());
  }

  const busy = pending || adding;

  return (
    <>
      {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}
      {message ? <div className="blc-alert blc-alert-info">{message}</div> : null}

      <div className="blc-panel" style={{ marginBottom: "1rem" }}>
        <h2 className="blc-mon-section-title" style={{ marginTop: 0 }}>
          Tambah manager
        </h2>

        <div className="blc-tabs" role="tablist" style={{ marginBottom: "0.85rem" }}>
          <button
            type="button"
            className={`blc-tab ${mode === "pick" ? "is-active" : ""}`}
            onClick={() => setMode("pick")}
          >
            Pilih dari user
          </button>
          <button
            type="button"
            className={`blc-tab ${mode === "manual" ? "is-active" : ""}`}
            onClick={() => setMode("manual")}
          >
            Input manual
          </button>
        </div>

        {mode === "pick" ? (
          <form onSubmit={(e) => void onAddSelected(e)}>
            <p className="blc-mon-note" style={{ marginBottom: "0.75rem" }}>
              Cari lalu pilih user yang sudah pernah login, kemudian jadikan
              manager.
            </p>
            <div className="blc-field">
              <label className="blc-label" htmlFor="mgr-user-q">
                Cari user
              </label>
              <input
                id="mgr-user-q"
                className="blc-input"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Nama / Discord username / Discord ID…"
                disabled={busy}
              />
            </div>
            <div className="blc-field">
              <label className="blc-label" htmlFor="mgr-user-pick">
                User
              </label>
              <select
                id="mgr-user-pick"
                className="blc-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={busy || filteredCandidates.length === 0}
                required
              >
                <option value="">
                  {filteredCandidates.length === 0
                    ? "Tidak ada user cocok"
                    : "Pilih user…"}
                </option>
                {filteredCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.discordUsername ? ` (@${u.discordUsername})` : ""}
                    {u.discordId ? ` · ${u.discordId}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedUser ? (
              <p className="blc-mon-note" style={{ marginBottom: "0.75rem" }}>
                Dipilih: <strong>{selectedUser.name}</strong>
                {selectedUser.discordId
                  ? ` · Discord ID ${selectedUser.discordId}`
                  : ` · ${selectedUser.email}`}
              </p>
            ) : null}
            <button
              type="submit"
              className="blc-btn"
              disabled={busy || !selectedUserId}
            >
              {adding ? "Menyimpan…" : "Jadikan manager"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void onAddManual(e)}>
            <p className="blc-mon-note" style={{ marginBottom: "0.75rem" }}>
              Untuk orang yang belum ada di daftar user: isi Discord ID (angka)
              manual. Setelah dia login Discord, akses manager aktif.
            </p>
            <div className="blc-field">
              <label className="blc-label" htmlFor="mgr-input">
                Discord ID
              </label>
              <input
                id="mgr-input"
                className="blc-input"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Contoh: 123456789012345678"
                disabled={busy}
                required
              />
            </div>
            <button
              type="submit"
              className="blc-btn"
              disabled={busy || !manualInput.trim()}
            >
              {adding ? "Menyimpan…" : "Tambah manager"}
            </button>
          </form>
        )}
      </div>

      {mode === "pick" && filteredCandidates.length > 0 ? (
        <section className="blc-mon-section">
          <h2 className="blc-mon-section-title">
            User tersedia{" "}
            <span className="blc-mon-note" style={{ fontWeight: 400, textTransform: "none" }}>
              ({filteredCandidates.length})
            </span>
          </h2>
          <div className="blc-list blc-list-compact">
            {filteredCandidates.slice(0, 40).map((u) => (
              <article key={u.id} className="blc-list-item">
                <div>
                  <h3>{u.name}</h3>
                  <p>
                    {u.discordUsername ? `@${u.discordUsername}` : "—"}
                    {u.discordId ? ` · ID ${u.discordId}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="blc-btn secondary"
                  style={{ width: "auto", padding: "0.4rem 0.7rem", fontSize: "0.72rem" }}
                  disabled={busy}
                  onClick={() => {
                    setSelectedUserId(u.id);
                    void submitAdd(u.discordId || u.email);
                  }}
                >
                  Jadikan manager
                </button>
              </article>
            ))}
          </div>
          {filteredCandidates.length > 40 ? (
            <p className="blc-mon-note" style={{ marginTop: "0.5rem" }}>
              Menampilkan 40 dari {filteredCandidates.length}. Pakai kotak cari
              untuk mempersempit.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="blc-mon-section">
        <h2 className="blc-mon-section-title">Daftar manager</h2>
        <div className="blc-list">
          {managers.map((m) => (
            <article key={m.email} className="blc-list-item blc-rekap-tx">
              <div>
                <h3>
                  {m.name ?? "Belum pernah login"}{" "}
                  <span
                    className={`blc-mon-badge ${
                      m.source === "owner"
                        ? "is-pending-return"
                        : m.source === "locked"
                          ? "is-deposit"
                          : "is-returned"
                    }`}
                  >
                    {m.source === "owner"
                      ? "Owner"
                      : m.source === "locked"
                        ? "Inti"
                        : "Manager"}
                  </span>
                </h3>
                <p>{m.roleLabel}</p>
                <p className="blc-mon-note">
                  {m.discordId ? `Discord ID: ${m.discordId}` : m.email}
                  {m.addedBy ? ` · ditambah oleh ${m.addedBy}` : ""}
                </p>
              </div>
              {m.canRemove ? (
                <button
                  type="button"
                  className="blc-btn blc-btn-lost"
                  style={{
                    width: "auto",
                    padding: "0.45rem 0.75rem",
                    fontSize: "0.72rem",
                  }}
                  disabled={busyEmail === m.email}
                  onClick={() => void onRemove(m.email)}
                >
                  {busyEmail === m.email ? "…" : "Cabut akses"}
                </button>
              ) : (
                <span className="blc-mon-note">Terkunci</span>
              )}
            </article>
          ))}
        </div>
        <p className="blc-mon-note" style={{ marginTop: "0.75rem" }}>
          Login Anda: {actorEmail}
        </p>
      </section>
    </>
  );
}
