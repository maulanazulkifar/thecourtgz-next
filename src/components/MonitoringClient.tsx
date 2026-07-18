"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  markReturnedAction,
  markUnreturnableAction,
} from "@/app/actions/inventory";

type Notice = {
  user_id: number;
  name: string;
  total: number;
  withdraw: number;
  deposit: number;
  pending_weapon: number;
  last_at: string;
};

type Row = {
  id: number;
  type: string;
  type_label: string;
  user: string;
  item: string;
  category: string;
  quantity: number;
  note: string | null;
  time: string;
  is_weapon: boolean;
  needs_return: boolean;
  returned_at: string | null;
  returned_by: string | null;
  unreturnable_at: string | null;
  unreturnable_reason: string | null;
  unreturnable_by: string | null;
  status: string;
};

export function MonitoringClient({
  initialFrom,
  initialTo,
  initialMember,
  initialNotices,
  initialRows,
  initialPending,
  initialVersion,
}: {
  initialFrom: string;
  initialTo: string;
  initialMember: string;
  initialNotices: Notice[];
  initialRows: Row[];
  initialPending: number;
  initialVersion: number;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [member, setMember] = useState(initialMember);
  const [notices, setNotices] = useState(initialNotices);
  const [rows, setRows] = useState(initialRows);
  const [pending, setPending] = useState(initialPending);
  const [version, setVersion] = useState(initialVersion);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      const qs = new URLSearchParams({
        v: String(version),
        from,
        to,
        member,
      });
      fetch(`/api/home/monitoring/feed?${qs}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((payload) => {
          if (!payload || payload.unchanged) return;
          setVersion(payload.version);
          setNotices(payload.notices ?? []);
          setRows(payload.rows ?? []);
          setPending(payload.pending_weapon ?? 0);
        })
        .catch(() => undefined);
    };
    const id = setInterval(poll, 2500);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [version, from, to, member]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams({ from, to, member });
    router.push(`/home/monitoring?${qs}`);
  }

  async function onReturn(id: number) {
    if (!confirm("Tandai senjata sudah dikembalikan? Stok akan bertambah.")) return;
    setError(null);
    const result = await markReturnedAction(id);
    if (!result.ok) setError(result.error);
    else setMessage(result.message ?? "OK");
  }

  async function onUnreturnable(id: number) {
    const reason = prompt("Alasan senjata tidak bisa dikembalikan:");
    if (!reason) return;
    setError(null);
    const result = await markUnreturnableAction(id, reason);
    if (!result.ok) setError(result.error);
    else setMessage(result.message ?? "OK");
  }

  return (
    <>
      <div className="blc-page-head">
        <h1>
          <span className="blc-live-dot" /> Monitoring
        </h1>
        <p>
          Pantau deposit/withdraw realtime. Senjata pending: <strong>{pending}</strong>
        </p>
      </div>

      {message ? <div className="blc-alert blc-alert-success">{message}</div> : null}
      {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}

      <form className="blc-filter" onSubmit={onFilter}>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="from">
            Dari
          </label>
          <input
            id="from"
            type="date"
            className="blc-input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="to">
            Sampai
          </label>
          <input
            id="to"
            type="date"
            className="blc-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="member">
            Member
          </label>
          <input
            id="member"
            className="blc-input"
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="Nama member"
          />
        </div>
        <button type="submit" className="blc-btn">
          Filter
        </button>
      </form>

      <div className="blc-notice-wrap">
        {notices.length === 0 ? (
          <div className="blc-empty" style={{ padding: "0.5rem" }}>
            Belum ada aktivitas di rentang ini.
          </div>
        ) : (
          notices.map((n) => (
            <div
              key={n.user_id}
              className={`blc-notice-chip ${n.pending_weapon > 0 ? "is-pending" : ""}`}
            >
              <strong>{n.name}</strong>
              <span>
                {n.total} tx · W {n.withdraw} · D {n.deposit}
                {n.pending_weapon > 0 ? ` · pending ${n.pending_weapon}` : ""} · {n.last_at}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="blc-panel">
        {rows.length === 0 ? (
          <div className="blc-empty">Tidak ada transaksi.</div>
        ) : (
          <div className="blc-list">
            {rows.map((row) => (
              <article key={row.id} className="blc-list-item" style={{ gridTemplateColumns: "1fr" }}>
                <div>
                  <h3>
                    {row.type_label} · {row.item}{" "}
                    <span className={`blc-badge ${row.type === "in" ? "is-in" : "is-out"}`}>
                      x{row.quantity}
                    </span>
                  </h3>
                  <p>
                    {row.user} · {row.category} · {row.time}
                    {row.note ? ` · ${row.note}` : ""}
                  </p>
                  <p>
                    <span
                      className={`blc-status ${
                        row.status === "belum_dikembalikan"
                          ? "pending"
                          : row.status === "sudah_dikembalikan"
                            ? "returned"
                            : row.status === "tidak_bisa_dikembalikan"
                              ? "lost"
                              : ""
                      }`}
                    >
                      {row.status.replaceAll("_", " ")}
                    </span>
                    {row.returned_at
                      ? ` · dikembalikan ${row.returned_at}${row.returned_by ? ` oleh ${row.returned_by}` : ""}`
                      : ""}
                    {row.unreturnable_at
                      ? ` · hilang ${row.unreturnable_at}${
                          row.unreturnable_reason ? `: ${row.unreturnable_reason}` : ""
                        }`
                      : ""}
                  </p>
                  {row.needs_return ? (
                    <div className="blc-actions">
                      <button type="button" className="blc-btn" onClick={() => onReturn(row.id)}>
                        Sudah dikembalikan
                      </button>
                      <button
                        type="button"
                        className="blc-btn secondary"
                        onClick={() => onUnreturnable(row.id)}
                      >
                        Tidak bisa dikembalikan
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
