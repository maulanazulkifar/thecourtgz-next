"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { ReconcileStockButton } from "@/components/ReconcileStockButton";

export type StockAuditRow = {
  id: number;
  name: string;
  category: string;
  stock: number;
  masuk: number;
  keluar: number;
  hitung: number;
  gap: number;
  reason: string | null;
};

export type AuditMovement = {
  id: number;
  type: string;
  purpose: string | null;
  quantity: number;
  note: string | null;
  time: string;
  user: string;
  label?: string;
  kind?: "deposit" | "withdraw" | "return" | "adjust" | "initial";
  suspect?: boolean;
  runningAfter?: number;
};

export type AuditInsight = {
  tip: string;
  gap: number;
  stockUpdatedAt: string | null;
  firstTxAt: string | null;
  firstTxBy: string | null;
  lastTxAt: string | null;
  lastTxBy: string | null;
  lastTxLabel: string | null;
  suspectCount: number;
  likelySince: string | null;
  likelySinceBy: string | null;
  likelySinceLabel: string | null;
};

export type ItemAuditDetail = {
  item: {
    id: number;
    name: string;
    sku: string | null;
    stock: number;
    categoryId: number | null;
    category: string;
    updatedAt?: string | null;
    createdAt?: string | null;
  };
  recap: StockAuditRow | null;
  insight?: AuditInsight | null;
  movements: AuditMovement[];
};

const PAGE_SIZE = 40;

function purposeLabel(m: AuditMovement) {
  if (m.label) return m.label;
  if (m.purpose === "return") return "Pengembalian";
  if (m.note?.includes("Stok awal")) return "Stok awal";
  if (m.note?.includes("Penyesuaian")) return "Penyesuaian";
  if (m.purpose === "deposit") return "Masuk";
  if (m.purpose === "withdraw") return "Keluar";
  return m.type === "in" ? "Masuk" : "Keluar";
}

function kindBadgeClass(m: AuditMovement) {
  if (m.kind === "adjust" || m.suspect) return "is-pending-return";
  if (m.kind === "return" || m.purpose === "return") return "is-returned";
  if (m.type === "in") return "is-deposit";
  return "is-withdraw";
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy HH:mm");
  } catch {
    return "—";
  }
}

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

export function StockAuditClient({
  rows,
  categories,
  canFix,
  loadAudit,
  compactHeader = false,
}: {
  rows: StockAuditRow[];
  categories: string[];
  canFix: boolean;
  loadAudit: (itemId: number) => Promise<ItemAuditDetail | null>;
  compactHeader?: boolean;
}) {
  const [category, setCategory] = useState("");
  const [itemId, setItemId] = useState("");
  const [status, setStatus] = useState<"all" | "ok" | "miss">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [detail, setDetail] = useState<ItemAuditDetail | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const deferredQ = useDeferredValue(q);

  useEffect(() => {
    setMounted(true);
  }, []);

  const missCount = useMemo(() => rows.reduce((n, r) => n + (r.gap !== 0 ? 1 : 0), 0), [rows]);

  const itemOptions = useMemo(() => {
    if (!category) return rows;
    return rows.filter((r) => r.category === category);
  }, [rows, category]);

  const filtered = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (category && r.category !== category) return false;
      if (itemId && String(r.id) !== itemId) return false;
      if (status === "ok" && r.gap !== 0) return false;
      if (status === "miss" && r.gap === 0) return false;
      if (
        needle &&
        !r.name.toLowerCase().includes(needle) &&
        !r.category.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });

    // Selisih dulu supaya mudah ditemukan tanpa scroll panjang
    list.sort((a, b) => {
      if ((a.gap !== 0) !== (b.gap !== 0)) return a.gap !== 0 ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [rows, category, itemId, status, deferredQ]);

  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const stockTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.stock, 0),
    [filtered],
  );

  function resetLimit() {
    setLimit(PAGE_SIZE);
  }

  async function openAudit(id: number) {
    setLoadingId(id);
    setError(null);
    try {
      const data = await loadAudit(id);
      if (!data) {
        setError("Item tidak ditemukan.");
        setDetail(null);
      } else {
        setDetail(data);
      }
    } catch {
      setError("Gagal memuat riwayat.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      {!compactHeader ? (
        <div className="blc-stat-grid">
          <div className="blc-stat">
            <span>Item ditampilkan</span>
            <strong>{filtered.length}</strong>
          </div>
          <div className="blc-stat">
            <span>Sisa stok</span>
            <strong>{fmt(stockTotal)}</strong>
          </div>
          <div className="blc-stat">
            <span>Ada selisih</span>
            <strong style={{ color: missCount ? "#efb0b0" : undefined }}>{missCount}</strong>
          </div>
        </div>
      ) : null}

      {missCount > 0 ? (
        <div className="blc-alert blc-alert-info" style={{ marginBottom: "0.85rem" }}>
          <strong>{missCount} barang perlu dicek</strong>
          <p style={{ margin: "0.35rem 0 0", color: "var(--blc-muted)" }}>
            Pilih filter “Perlu dicek”, lalu tekan <em>Lihat riwayat</em> untuk
            melihat siapa yang menginput. Manager bisa menekan Perbaiki jika sudah yakin.
          </p>
          {canFix ? <ReconcileStockButton /> : null}
        </div>
      ) : (
        <div className="blc-mon-summary" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
          Semua barang aman — sisa stok cocok dengan catatan.
        </div>
      )}

      <div className="blc-stock-legend" aria-label="Keterangan status">
        <span className="blc-stock-legend-item is-ok">
          <i /> Aman
        </span>
        <span className="blc-stock-legend-item is-miss">
          <i /> Perlu dicek
        </span>
      </div>

      <form
        className="blc-mon-filter"
        onSubmit={(e) => e.preventDefault()}
        style={{ marginBottom: "1rem" }}
      >
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="audit-cat">
            Kategori
          </label>
          <select
            id="audit-cat"
            className="blc-select"
            value={category}
            onChange={(e) => {
              const v = e.target.value;
              startTransition(() => {
                setCategory(v);
                setItemId("");
                resetLimit();
              });
            }}
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="audit-item">
            Item
          </label>
          <select
            id="audit-item"
            className="blc-select"
            value={itemId}
            onChange={(e) => {
              const v = e.target.value;
              startTransition(() => {
                setItemId(v);
                resetLimit();
              });
            }}
          >
            <option value="">Semua item</option>
            {itemOptions.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="audit-status">
            Status
          </label>
          <select
            id="audit-status"
            className="blc-select"
            value={status}
            onChange={(e) => {
              const v = e.target.value as "all" | "ok" | "miss";
              startTransition(() => {
                setStatus(v);
                resetLimit();
              });
            }}
          >
            <option value="all">Semua</option>
            <option value="miss">Perlu dicek</option>
            <option value="ok">Aman saja</option>
          </select>
        </div>
        <div className="blc-field" style={{ margin: 0 }}>
          <label className="blc-label" htmlFor="audit-q">
            Cari nama
          </label>
          <input
            id="audit-q"
            className="blc-input"
            value={q}
            placeholder="Ketik nama item/kategori…"
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              startTransition(() => resetLimit());
            }}
          />
        </div>
      </form>

      <section className="blc-mon-section">
        <h2 className="blc-mon-section-title">
          Daftar barang{" "}
          <span className="blc-mon-note" style={{ fontWeight: 400, textTransform: "none" }}>
            ({Math.min(limit, filtered.length)}/{filtered.length})
          </span>
        </h2>
        {filtered.length === 0 ? (
          <div className="blc-empty">Tidak ada barang cocok filter.</div>
        ) : (
          <>
            <div className="blc-list blc-list-compact">
              {visible.map((r) => {
                const hasMiss = r.gap !== 0;
                return (
                  <article
                    key={r.id}
                    className={`blc-list-item blc-stock-row ${hasMiss ? "is-miss" : "is-ok"}`}
                  >
                    <div>
                      <h3>
                        {r.name}{" "}
                        {hasMiss ? (
                          <span className="blc-mon-badge is-withdraw">Perlu dicek</span>
                        ) : (
                          <span className="blc-mon-badge is-deposit">Aman</span>
                        )}
                      </h3>
                      <p>
                        {r.category} · masuk {fmt(r.masuk)} · keluar {fmt(r.keluar)}
                      </p>
                      {r.reason ? (
                        <p className="blc-stock-reason">
                          {r.gap > 0
                            ? "Sisa di gudang lebih banyak dari catatan masuk/keluar."
                            : "Catatan masuk/keluar lebih banyak dari sisa di gudang."}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="blc-btn secondary blc-stock-audit-btn"
                        disabled={loadingId === r.id}
                        onClick={() => void openAudit(r.id)}
                      >
                        {loadingId === r.id ? "Memuat…" : "Lihat riwayat"}
                      </button>
                    </div>
                    <div className={`blc-badge blc-stock-now ${hasMiss ? "is-miss" : "is-ok"}`}>
                      <span>Sisa sekarang</span>
                      <strong>{fmt(r.stock)}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
            {hasMore ? (
              <div className="blc-actions" style={{ justifyContent: "center", marginTop: "0.85rem" }}>
                <button
                  type="button"
                  className="blc-btn secondary"
                  style={{ width: "auto" }}
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                >
                  Muat {Math.min(PAGE_SIZE, filtered.length - limit)} item lagi
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}

      {mounted && detail
        ? createPortal(
            <div className="blc-success-overlay" onClick={() => setDetail(null)}>
              <div
                className="blc-success-sheet blc-audit-sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Riwayat Barang</h3>
                <p style={{ color: "#e8e0d0" }}>{detail.item.name}</p>
                <div className="blc-success-meta">
                  <div>
                    <span>Kategori</span>
                    <strong>{detail.item.category}</strong>
                  </div>
                  <div>
                    <span>Sisa sekarang</span>
                    <strong>{fmt(detail.item.stock)}</strong>
                  </div>
                  <div>
                    <span>Dari catatan</span>
                    <strong>
                      {detail.recap ? fmt(detail.recap.hitung) : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Bedanya</span>
                    <strong
                      style={{
                        color: detail.recap?.gap ? "#efb0b0" : "#b7e0b9",
                      }}
                    >
                      {detail.recap
                        ? `${detail.recap.gap > 0 ? "+" : ""}${fmt(detail.recap.gap)}`
                        : "—"}
                    </strong>
                  </div>
                </div>
                {detail.recap?.gap ? (
                  <p className="blc-audit-reason">
                    {detail.recap.gap > 0
                      ? "Sisa di gudang lebih banyak dari catatan masuk/keluar."
                      : "Catatan masuk/keluar lebih banyak dari sisa di gudang."}
                  </p>
                ) : (
                  <p className="blc-audit-reason is-ok">Angka cocok — tidak ada yang aneh.</p>
                )}

                {detail.insight ? (
                  <div
                    className={`blc-audit-insight ${
                      detail.insight.gap !== 0 ? "is-warn" : "is-ok"
                    }`}
                  >
                    <strong>
                      {detail.insight.gap !== 0 ? "Perlu diperhatikan" : "Ringkas"}
                    </strong>
                    <p>
                      {detail.insight.gap !== 0
                        ? "Cek siapa yang terakhir menginput, dan apakah ada perubahan stok manual."
                        : "Semua transaksi bisa ditelusuri di bawah."}
                    </p>
                    {detail.insight.gap !== 0 && detail.insight.likelySince ? (
                      <p className="blc-audit-insight-hl">
                        Mulai sekitar:{" "}
                        <strong>{fmtTime(detail.insight.likelySince)}</strong>
                        {detail.insight.likelySinceBy
                          ? ` · oleh ${detail.insight.likelySinceBy}`
                          : ""}
                      </p>
                    ) : null}
                    <ul>
                      {detail.insight.lastTxAt ? (
                        <li>
                          Input terakhir:{" "}
                          <strong>
                            {detail.insight.lastTxLabel ?? "Transaksi"} ·{" "}
                            {fmtTime(detail.insight.lastTxAt)}
                          </strong>
                          {detail.insight.lastTxBy
                            ? ` · oleh ${detail.insight.lastTxBy}`
                            : ""}
                        </li>
                      ) : null}
                      {detail.insight.suspectCount > 0 ? (
                        <li>
                          Ada{" "}
                          <strong>{detail.insight.suspectCount} penyesuaian</strong>{" "}
                          (ditandai kuning — sering jadi penyebab angka aneh).
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                <h4 className="blc-audit-sub">Siapa yang input</h4>
                {detail.movements.length === 0 ? (
                  <p className="blc-mon-note">Belum ada transaksi.</p>
                ) : (
                  <div className="blc-audit-timeline">
                    {detail.movements.map((m) => (
                      <div
                        key={m.id}
                        className={`blc-audit-tx is-${m.type}${
                          m.suspect ? " is-suspect" : ""
                        }`}
                      >
                        <div className="blc-audit-tx-head">
                          <span className={`blc-mon-badge ${kindBadgeClass(m)}`}>
                            {purposeLabel(m)}
                          </span>
                          {m.suspect ? (
                            <span className="blc-mon-badge is-pending-return">
                              Periksa
                            </span>
                          ) : null}
                          <strong className="blc-audit-tx-qty">
                            {m.type === "in" ? "+" : "-"}
                            {fmt(m.quantity)}
                          </strong>
                        </div>
                        <span>
                          oleh <strong>{m.user}</strong> ·{" "}
                          {format(parseISO(m.time), "d MMM yyyy HH:mm")}
                        </span>
                        {typeof m.runningAfter === "number" ? (
                          <span className="blc-audit-running">
                            Sisa catatan setelah ini: {fmt(m.runningAfter)}
                          </span>
                        ) : null}
                        {m.note ? <span className="blc-audit-note">{m.note}</span> : null}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="blc-btn"
                  style={{ marginTop: "1rem" }}
                  onClick={() => setDetail(null)}
                >
                  Tutup
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
