"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  markReturnedAction,
  markUnreturnableAction,
  deleteMovementAction,
  updateMovementAction,
} from "@/app/actions/inventory";
import { canActOnWeaponReturn, canManageCatalog } from "@/lib/category-access";
import { BlcNoticeOverlay } from "@/components/BlcNoticeOverlay";

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
  user_id: number;
  item: string;
  category: string;
  quantity: number;
  note: string | null;
  time: string;
  is_weapon: boolean;
  needs_return: boolean;
  pending_qty?: number;
  returned_at: string | null;
  returned_by: string | null;
  unreturnable_at: string | null;
  unreturnable_reason: string | null;
  unreturnable_by: string | null;
  status: string;
};

type NoticeUi =
  | { kind: "confirm-return"; id: number; item: string; maxQty: number }
  | { kind: "confirm-lost"; id: number; item: string }
  | {
      kind: "confirm-edit";
      id: number;
      item: string;
      type: string;
      type_label: string;
      quantity: number;
      note: string | null;
    }
  | {
      kind: "confirm-delete";
      id: number;
      item: string;
      type: string;
      type_label: string;
      quantity: number;
    }
  | { kind: "success"; title: string; message: string }
  | { kind: "error"; message: string };

function statusBadge(row: Row): { label: string; klass: string } {
  if (row.status === "belum_dikembalikan") {
    return { label: "Belum dikembalikan", klass: "is-pending-return" };
  }
  if (row.status === "sudah_dikembalikan") {
    return { label: "Sudah dikembalikan", klass: "is-returned" };
  }
  if (row.status === "tidak_bisa_dikembalikan") {
    return { label: "Tidak bisa dikembalikan", klass: "is-lost" };
  }
  if (row.type === "out") return { label: "Withdraw", klass: "is-withdraw" };
  if (row.type_label === "Pengembalian") {
    return { label: "Pengembalian", klass: "is-deposit" };
  }
  return { label: "Deposit", klass: "is-deposit" };
}

export function MonitoringClient({
  viewerId,
  viewerEmail,
  initialFrom,
  initialTo,
  initialAllDates,
  initialMember,
  initialCategory,
  members,
  categories,
  initialNotices,
  initialRows,
  initialPending,
  initialVersion,
}: {
  viewerId: string;
  viewerEmail: string | null | undefined;
  initialFrom: string;
  initialTo: string;
  initialAllDates: boolean;
  initialMember: string;
  initialCategory: string;
  members: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  initialNotices: Notice[];
  initialRows: Row[];
  initialPending: number;
  initialVersion: number;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [allDates, setAllDates] = useState(initialAllDates);
  const [member, setMember] = useState(initialMember);
  const [category, setCategory] = useState(initialCategory);
  const [notices, setNotices] = useState(initialNotices);
  const [rows, setRows] = useState(initialRows);
  const [pending, setPending] = useState(initialPending);
  const [version, setVersion] = useState(initialVersion);
  const [loading, setLoading] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [returnQty, setReturnQty] = useState(1);
  const [returnNote, setReturnNote] = useState("");
  const [editQty, setEditQty] = useState(1);
  const [editNote, setEditNote] = useState("");
  const [showAllOk, setShowAllOk] = useState(false);
  const [uiNotice, setUiNotice] = useState<NoticeUi | null>(null);

  const isManager = canManageCatalog(viewerEmail);

  const pendingPeople = notices
    .filter((n) => n.pending_weapon > 0)
    .sort((a, b) => b.pending_weapon - a.pending_weapon || a.name.localeCompare(b.name));
  const okPeople = notices
    .filter((n) => n.pending_weapon <= 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const okPreview = showAllOk ? okPeople : okPeople.slice(0, 8);

  useEffect(() => {
    setFrom(initialFrom);
    setTo(initialTo);
    setAllDates(initialAllDates);
    setMember(initialMember);
    setCategory(initialCategory);
    setNotices(initialNotices);
    setRows(initialRows);
    setPending(initialPending);
    setVersion(initialVersion);
  }, [
    initialFrom,
    initialTo,
    initialAllDates,
    initialMember,
    initialCategory,
    initialNotices,
    initialRows,
    initialPending,
    initialVersion,
  ]);

  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      const qs = new URLSearchParams({
        v: String(version),
        member,
        category,
      });
      if (allDates) {
        qs.set("all", "1");
      } else {
        qs.set("from", from);
        qs.set("to", to);
      }
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
  }, [version, from, to, allDates, member, category]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (member) qs.set("member", member);
    if (category) qs.set("category", category);
    if (allDates) {
      qs.set("all", "1");
    } else {
      qs.set("from", from);
      qs.set("to", to);
    }
    router.push(`/home/monitoring?${qs}`);
  }

  function canShowReturnActions(row: Row) {
    return (
      row.needs_return &&
      canActOnWeaponReturn(viewerEmail, viewerId, row.user_id)
    );
  }

  async function confirmReturn() {
    if (!uiNotice || uiNotice.kind !== "confirm-return") return;
    const qty = Number(returnQty);

    if (!Number.isInteger(qty) || qty < 0) {
      setUiNotice({
        kind: "error",
        message: "Jumlah dikembalikan tidak valid.",
      });
      return;
    }

    if (qty === 0) {
      setUiNotice({
        kind: "error",
        message:
          "Jumlah 0 sama saja tidak dikembalikan. Kalau memang tidak ada yang kembali, pakai tombol \"Tidak bisa dikembalikan\". Kalau ada yang kembali, isi minimal 1.",
      });
      return;
    }

    if (qty > uiNotice.maxQty) {
      setUiNotice({
        kind: "error",
        message: `Jumlah dikembalikan tidak boleh lebih dari ${uiNotice.maxQty}.`,
      });
      return;
    }

    setLoading(true);
    const result = await markReturnedAction(
      uiNotice.id,
      qty,
      returnNote.trim() || null,
    );
    setLoading(false);
    if (!result.ok) {
      setUiNotice({ kind: "error", message: result.error });
      return;
    }
    setReturnNote("");
    setUiNotice({
      kind: "success",
      title: "Pengembalian Berhasil",
      message: result.message ?? "Senjata sudah dikembalikan ke gudang.",
    });
  }

  async function confirmLost() {
    if (!uiNotice || uiNotice.kind !== "confirm-lost") return;
    const reason = lostReason.trim();
    if (!reason) return;
    setLoading(true);
    const result = await markUnreturnableAction(uiNotice.id, reason);
    setLoading(false);
    if (!result.ok) {
      setUiNotice({ kind: "error", message: result.error });
      return;
    }
    setLostReason("");
    setUiNotice({
      kind: "success",
      title: "Status Tersimpan",
      message: result.message ?? "Ditandai tidak bisa dikembalikan.",
    });
  }

  function focusMember(userId: number) {
    const qs = new URLSearchParams();
    if (allDates) qs.set("all", "1");
    else {
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
    }
    qs.set("member", String(userId));
    if (category) qs.set("category", category);
    router.push(`/home/monitoring?${qs}`);
  }

  function closeSuccess() {
    setUiNotice(null);
    router.refresh();
  }

  async function confirmEdit() {
    if (!uiNotice || uiNotice.kind !== "confirm-edit") return;
    const qty = Number(editQty);
    if (!Number.isInteger(qty) || qty < 1) {
      setUiNotice({ kind: "error", message: "Jumlah harus minimal 1." });
      return;
    }
    setLoading(true);
    const result = await updateMovementAction(
      uiNotice.id,
      qty,
      editNote.trim() || null,
    );
    setLoading(false);
    if (!result.ok) {
      setUiNotice({ kind: "error", message: result.error });
      return;
    }
    setUiNotice({
      kind: "success",
      title: "Transaksi Diperbarui",
      message: result.message ?? "Berhasil diedit.",
    });
  }

  async function confirmDelete() {
    if (!uiNotice || uiNotice.kind !== "confirm-delete") return;
    setLoading(true);
    const result = await deleteMovementAction(uiNotice.id);
    setLoading(false);
    if (!result.ok) {
      setUiNotice({ kind: "error", message: result.error });
      return;
    }
    setUiNotice({
      kind: "success",
      title: "Transaksi Dihapus",
      message: result.message ?? "Berhasil dihapus.",
    });
  }

  return (
    <>
      <form className="blc-mon-filter" onSubmit={onFilter}>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="from">
            Dari tanggal
          </label>
          <input
            id="from"
            type="date"
            className="blc-input"
            value={from}
            disabled={allDates}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="to">
            Sampai tanggal
          </label>
          <input
            id="to"
            type="date"
            className="blc-input"
            value={to}
            disabled={allDates}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="member">
            Nama
          </label>
          <select
            id="member"
            className="blc-select"
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="">Semua nama</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="category">
            Kategori
          </label>
          <select
            id="category"
            className="blc-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="blc-mon-all-dates">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => {
              const checked = e.target.checked;
              setAllDates(checked);
              if (!checked) {
                const today = new Date().toISOString().slice(0, 10);
                if (!from) setFrom(today);
                if (!to) setTo(today);
              }
            }}
          />
          <span>Semua tanggal</span>
        </label>
        <button type="submit" className="blc-btn blc-mon-filter-btn">
          Terapkan filter
        </button>
      </form>

      <div className="blc-mon-summary">
        {pending > 0 ? (
          <>
            Ada <strong className="blc-mon-summary-hl">{pending} senjata</strong> yang
            belum dikembalikan ke gudang.{" "}
            <span className="blc-mon-summary-note">
              Cek daftar merah di bawah, lalu di Detail aktivitas tekan tombol
              pengembalian.
            </span>
          </>
        ) : (
          <>
            Semua senjata sudah aman / dikembalikan.{" "}
            <span className="blc-mon-summary-note">
              (Ammo, material, dan barang lain tidak perlu dikembalikan.)
            </span>
          </>
        )}
      </div>

      <section className="blc-mon-section">
        <h2 className="blc-mon-section-title">Ringkas orang</h2>
        {notices.length === 0 ? (
          <div className="blc-empty" style={{ padding: "0.75rem" }}>
            Belum ada yang input di rentang tanggal ini.
          </div>
        ) : (
          <div className="blc-mon-people">
            {pendingPeople.length > 0 ? (
              <div className="blc-mon-people-block">
                <p className="blc-mon-people-label is-warn">
                  Belum kembalikan senjata ({pendingPeople.length} orang)
                </p>
                <div className="blc-mon-people-grid">
                  {pendingPeople.map((n) => (
                    <button
                      key={n.user_id}
                      type="button"
                      className="blc-mon-person is-pending"
                      onClick={() => focusMember(n.user_id)}
                      title="Lihat detail orang ini"
                    >
                      <strong>{n.name}</strong>
                      <span className="blc-mon-person-stat">
                        {n.pending_weapon} senjata
                      </span>
                      <span className="blc-mon-person-meta">
                        {n.total} transaksi · {n.last_at}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {okPeople.length > 0 ? (
              <div className="blc-mon-people-block">
                <p className="blc-mon-people-label is-ok">
                  Sudah aman ({okPeople.length} orang)
                </p>
                <div className="blc-mon-people-tags">
                  {okPreview.map((n) => (
                    <button
                      key={n.user_id}
                      type="button"
                      className="blc-mon-person-tag"
                      onClick={() => focusMember(n.user_id)}
                      title="Lihat detail orang ini"
                    >
                      {n.name}
                      <em>{n.last_at}</em>
                    </button>
                  ))}
                </div>
                {okPeople.length > 8 ? (
                  <button
                    type="button"
                    className="blc-mon-people-more"
                    onClick={() => setShowAllOk((v) => !v)}
                  >
                    {showAllOk
                      ? "Tampilkan lebih sedikit"
                      : `Lihat ${okPeople.length - 8} orang lainnya`}
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="blc-mon-note" style={{ marginTop: "0.55rem" }}>
              Ketuk nama untuk melihat detail transaksi orang itu.
            </p>
          </div>
        )}
      </section>

      <section className="blc-mon-section">
        <h2 className="blc-mon-section-title">Detail aktivitas</h2>
        {rows.length === 0 ? (
          <div className="blc-empty">Tidak ada transaksi.</div>
        ) : (
          <div className="blc-mon-cards">
            {rows.map((row) => {
              const badge = statusBadge(row);
              return (
                <article key={row.id} className="blc-mon-card">
                  <header className="blc-mon-card-head">
                    <div>
                      <strong className="blc-mon-card-user">{row.user}</strong>
                      <span className="blc-mon-card-time">{row.time}</span>
                    </div>
                    <span className={`blc-mon-badge ${badge.klass}`}>{badge.label}</span>
                  </header>

                  <div className="blc-mon-meta">
                    <div>
                      <span>Barang</span>
                      <strong>{row.item}</strong>
                    </div>
                    <div>
                      <span>Kategori</span>
                      <strong>{row.category}</strong>
                    </div>
                    <div>
                      <span>Jumlah</span>
                      <strong>x{row.quantity}</strong>
                    </div>
                  </div>

                  {row.note ? <p className="blc-mon-note">Catatan: {row.note}</p> : null}
                  {row.returned_at ? (
                    <p className="blc-mon-note">
                      Dikembalikan {row.returned_at}
                      {row.returned_by ? ` oleh ${row.returned_by}` : ""}
                    </p>
                  ) : null}
                  {row.unreturnable_at ? (
                    <p className="blc-mon-note">
                      Tidak bisa dikembalikan {row.unreturnable_at}
                      {row.unreturnable_reason ? `: ${row.unreturnable_reason}` : ""}
                    </p>
                  ) : null}

                  {canShowReturnActions(row) ? (
                    <div className="blc-mon-card-actions">
                      <button
                        type="button"
                        className="blc-btn blc-btn-return"
                        onClick={() => {
                          const remaining = row.pending_qty ?? row.quantity;
                          setReturnQty(remaining);
                          setReturnNote("");
                          setUiNotice({
                            kind: "confirm-return",
                            id: row.id,
                            item: row.item,
                            maxQty: remaining,
                          });
                        }}
                      >
                        Sudah dikembalikan ke gudang
                        {(row.pending_qty ?? row.quantity) < row.quantity
                          ? ` (sisa ${row.pending_qty})`
                          : ""}
                      </button>
                      <button
                        type="button"
                        className="blc-btn blc-btn-lost"
                        onClick={() => {
                          setLostReason("");
                          setUiNotice({
                            kind: "confirm-lost",
                            id: row.id,
                            item: row.item,
                          });
                        }}
                      >
                        Tidak bisa dikembalikan
                      </button>
                    </div>
                  ) : null}

                  {isManager ? (
                    <div className="blc-mon-card-actions blc-mon-mgr-actions">
                      <button
                        type="button"
                        className="blc-btn secondary"
                        onClick={() => {
                          setEditQty(row.quantity);
                          setEditNote(row.note ?? "");
                          setUiNotice({
                            kind: "confirm-edit",
                            id: row.id,
                            item: row.item,
                            type: row.type,
                            type_label: row.type_label,
                            quantity: row.quantity,
                            note: row.note,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="blc-btn blc-btn-lost"
                        onClick={() => {
                          setUiNotice({
                            kind: "confirm-delete",
                            id: row.id,
                            item: row.item,
                            type: row.type,
                            type_label: row.type_label,
                            quantity: row.quantity,
                          });
                        }}
                      >
                        Hapus
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {uiNotice?.kind === "confirm-return" ? (
        <BlcNoticeOverlay
          title="Kembalikan ke Gudang?"
          message="Isi jumlah yang benar-benar dikembalikan. Stok gudang akan bertambah sesuai angka ini."
          meta={[
            { label: "Barang", value: uiNotice.item },
            { label: "Withdraw", value: `x${uiNotice.maxQty}` },
          ]}
          primaryLabel={loading ? "Menyimpan…" : "Ya, kembalikan"}
          secondaryLabel="Batal"
          onPrimary={() => {
            if (!loading) void confirmReturn();
          }}
          onSecondary={() => setUiNotice(null)}
          onDismiss={() => {
            if (!loading) setUiNotice(null);
          }}
        >
          <div className="blc-honesty-box">
            <strong>Harap jujur</strong>
            <p>
              Laporkan nominal yang benar-benar dikembalikan. Jangan isi lebih
              atau kurang dari kenyataan — data ini dipakai untuk stok gudang.
            </p>
          </div>
          <div className="blc-field" style={{ marginTop: "0.85rem", textAlign: "left" }}>
            <label className="blc-label" htmlFor="return-qty">
              Jumlah dikembalikan
            </label>
            <input
              id="return-qty"
              type="number"
              className="blc-input"
              min={1}
              max={uiNotice.maxQty}
              step={1}
              value={returnQty}
              disabled={loading}
              onChange={(e) => setReturnQty(Number(e.target.value))}
            />
            <p className="blc-mon-note" style={{ marginTop: "0.4rem" }}>
              Default: {uiNotice.maxQty}. Minimal 1 — isi 0 sama saja tidak
              dikembalikan.
            </p>
          </div>
          <div className="blc-field" style={{ marginTop: "0.75rem", textAlign: "left" }}>
            <label className="blc-label" htmlFor="return-note">
              Catatan pengembalian (opsional)
            </label>
            <textarea
              id="return-note"
              className="blc-input"
              rows={2}
              maxLength={500}
              placeholder="Mis. kondisi baik, ada goresan, dll."
              value={returnNote}
              disabled={loading}
              onChange={(e) => setReturnNote(e.target.value)}
            />
          </div>
        </BlcNoticeOverlay>
      ) : null}

      {uiNotice?.kind === "confirm-lost" ? (
        <BlcNoticeOverlay
          title="Tidak Bisa Dikembalikan?"
          message={`Isi alasan untuk "${uiNotice.item}".`}
          primaryLabel={loading ? "Menyimpan…" : "Simpan"}
          secondaryLabel="Batal"
          onPrimary={() => {
            if (!loading) void confirmLost();
          }}
          onSecondary={() => setUiNotice(null)}
          onDismiss={() => {
            if (!loading) setUiNotice(null);
          }}
        >
          <div className="blc-field" style={{ marginTop: "0.85rem", textAlign: "left" }}>
            <label className="blc-label" htmlFor="lost-reason">
              Alasan
            </label>
            <textarea
              id="lost-reason"
              className="blc-textarea"
              rows={3}
              maxLength={255}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Contoh: hilang di lapangan"
              disabled={loading}
            />
          </div>
        </BlcNoticeOverlay>
      ) : null}

      {uiNotice?.kind === "confirm-edit" ? (
        <BlcNoticeOverlay
          title="Edit Transaksi"
          message="Ubah jumlah atau catatan. Stok gudang ikut disesuaikan."
          meta={[
            { label: "Barang", value: uiNotice.item },
            { label: "Jenis", value: uiNotice.type_label },
            { label: "Jumlah awal", value: `x${uiNotice.quantity}` },
          ]}
          primaryLabel={loading ? "Menyimpan…" : "Simpan perubahan"}
          secondaryLabel="Batal"
          onPrimary={() => {
            if (!loading) void confirmEdit();
          }}
          onSecondary={() => setUiNotice(null)}
          onDismiss={() => {
            if (!loading) setUiNotice(null);
          }}
        >
          <div className="blc-field" style={{ marginTop: "0.85rem", textAlign: "left" }}>
            <label className="blc-label" htmlFor="edit-qty">
              Jumlah baru
            </label>
            <input
              id="edit-qty"
              type="number"
              className="blc-input"
              min={1}
              step={1}
              value={editQty}
              disabled={loading}
              onChange={(e) => setEditQty(Number(e.target.value))}
            />
            <p className="blc-mon-note" style={{ marginTop: "0.35rem" }}>
              {uiNotice.type === "in"
                ? "Naikkan jumlah = stok bertambah; turunkan = stok berkurang."
                : "Naikkan jumlah = stok berkurang; turunkan = stok bertambah."}
            </p>
          </div>
          <div className="blc-field" style={{ marginTop: "0.75rem", textAlign: "left" }}>
            <label className="blc-label" htmlFor="edit-note">
              Catatan
            </label>
            <textarea
              id="edit-note"
              className="blc-input"
              rows={2}
              maxLength={500}
              value={editNote}
              disabled={loading}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Opsional"
            />
          </div>
        </BlcNoticeOverlay>
      ) : null}

      {uiNotice?.kind === "confirm-delete" ? (
        <BlcNoticeOverlay
          title="Hapus Transaksi?"
          message="Stok akan dikembalikan sesuai jenis transaksi. Aksi ini tidak bisa dibatalkan."
          meta={[
            { label: "Barang", value: uiNotice.item },
            { label: "Jenis", value: uiNotice.type_label },
            { label: "Jumlah", value: `x${uiNotice.quantity}` },
            {
              label: "Efek stok",
              value:
                uiNotice.type === "in"
                  ? `Stok −${uiNotice.quantity}`
                  : `Stok +${uiNotice.quantity}`,
            },
          ]}
          primaryLabel={loading ? "Menghapus…" : "Ya, hapus"}
          secondaryLabel="Batal"
          onPrimary={() => {
            if (!loading) void confirmDelete();
          }}
          onSecondary={() => setUiNotice(null)}
          onDismiss={() => {
            if (!loading) setUiNotice(null);
          }}
        />
      ) : null}

      {uiNotice?.kind === "success" ? (
        <BlcNoticeOverlay
          title={uiNotice.title}
          message={uiNotice.message}
          primaryLabel="Lanjut"
          onPrimary={closeSuccess}
        />
      ) : null}

      {uiNotice?.kind === "error" ? (
        <BlcNoticeOverlay
          title="Gagal"
          message={uiNotice.message}
          primaryLabel="OK"
          onPrimary={() => setUiNotice(null)}
        />
      ) : null}
    </>
  );
}
