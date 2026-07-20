"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { storeMovementAction } from "@/app/actions/inventory";

type ItemOpt = { id: number; text: string; name: string; stock: number };
type Category = { id: number; name: string };
type SuccessTx = {
  type: string;
  label: string;
  item: string;
  quantity: number;
  stock: number;
  note?: string | null;
  message: string;
};

export function PortalForm({
  userName,
  avatarUrl,
  categories,
  initialItems,
  initialVersion,
  itemsCount,
}: {
  userName: string;
  avatarUrl: string;
  categories: Category[];
  initialItems: Record<string, ItemOpt[]>;
  initialVersion: number;
  itemsCount: number;
}) {
  const [itemsByCategory, setItemsByCategory] = useState(initialItems);
  const [stockVersion, setStockVersion] = useState(initialVersion);
  const [categoryId, setCategoryId] = useState("");
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState<"in" | "out">("out");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successTx, setSuccessTx] = useState<SuccessTx | null>(null);
  const [mounted, setMounted] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = useMemo(
    () => itemsByCategory[categoryId] ?? [],
    [itemsByCategory, categoryId],
  );

  const selected = items.find((i) => String(i.id) === itemId) ?? null;

  const stockLive = useMemo(() => {
    if (!categoryId || !itemId || !selected) {
      return { text: "Pilih item untuk melihat stok realtime", klass: "" };
    }
    const stock = selected.stock;
    if (type === "out") {
      if (stock <= 0) {
        return { text: "Stok habis — withdraw tidak bisa", klass: "is-danger" };
      }
      if (quantity > stock) {
        return {
          text: `Stok realtime: ${stock} — jumlah melebihi stok`,
          klass: "is-danger",
        };
      }
      const remain = stock - quantity;
      const klass = quantity > Math.max(1, Math.floor(stock * 0.5)) ? "is-warn" : "is-ok";
      return {
        text: `Stok realtime: ${stock} — sisa setelah withdraw: ${remain}`,
        klass,
      };
    }
    return { text: `Stok realtime: ${stock}`, klass: "is-ok" };
  }, [categoryId, itemId, selected, type, quantity]);

  useEffect(() => {
    const poll = () => {
      if (document.hidden) return;
      fetch(`/api/home/stock?v=${encodeURIComponent(stockVersion)}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((payload) => {
          if (!payload || payload.unchanged) return;
          setStockVersion(payload.version);
          setItemsByCategory(payload.items ?? {});
        })
        .catch(() => undefined);
    };

    const id = setInterval(poll, 2000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [stockVersion]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Lock sinkron — setState loading belum cukup cegah double-click saat lag
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setError(null);

    if (type === "out" && selected && quantity > selected.stock) {
      submittingRef.current = false;
      setError(`Stok tidak mencukupi. Sisa realtime: ${selected.stock}`);
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("category_id", categoryId);
      fd.set("item_id", itemId);
      fd.set("type", type);
      fd.set("quantity", String(quantity));
      if (note) fd.set("note", note);

      const result = await storeMovementAction(fd);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccessTx(result.successTx as SuccessTx);
      setNote("");
      setQuantity(1);
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <>
      <div className="blc-home-card">
        <div className="blc-home-top">
          <img className="blc-home-logo" src="/image/blc.png" alt="BLACK LOTUS COURT" />
          <div className="blc-home-brand">
            <h1>BLACK LOTUS COURT</h1>
            <p>{userName} · Discord</p>
          </div>
          <img className="blc-home-avatar" src={avatarUrl} alt={userName} />
        </div>

        {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}

        <div className="blc-quick">
          <a href="/home/rekap?tab=stok" className="blc-quick-btn">
            <strong>Cek Rekap Stok</strong>
            <span>Lihat stok, deposit &amp; withdraw</span>
          </a>
        </div>

        <form className="blc-home-form" onSubmit={onSubmit} aria-busy={loading}>
          <fieldset disabled={loading} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <div className="blc-field">
            <label className="blc-label" htmlFor="category_id">
              Kategori
            </label>
            <select
              id="category_id"
              className="blc-select"
              required
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setItemId("");
              }}
            >
              <option value="">Cari kategori...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="blc-field">
            <label className="blc-label" htmlFor="item_id">
              Item
            </label>
            <select
              id="item_id"
              className="blc-select"
              required
              disabled={!categoryId || items.length === 0}
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">
                {!categoryId
                  ? "Pilih kategori dulu..."
                  : items.length
                    ? "Cari item..."
                    : "Tidak ada item"}
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.text}
                </option>
              ))}
            </select>
            <div className={`blc-stock-live ${stockLive.klass}`}>{stockLive.text}</div>
          </div>

          <div className="blc-home-row">
            <div className="blc-field">
              <label className="blc-label" htmlFor="type">
                Tipe
              </label>
              <select
                id="type"
                className="blc-select"
                value={type}
                onChange={(e) => setType(e.target.value as "in" | "out")}
              >
                <option value="in">Deposit</option>
                <option value="out">Withdraw</option>
              </select>
            </div>
            <div className="blc-field">
              <label className="blc-label" htmlFor="quantity">
                Jumlah
              </label>
              <input
                id="quantity"
                className="blc-input"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="blc-field">
            <label className="blc-label" htmlFor="note">
              Catatan <span style={{ opacity: 0.65, textTransform: "none" }}>(opsional)</span>
            </label>
            <textarea
              id="note"
              className="blc-textarea"
              rows={2}
              maxLength={500}
              placeholder="Contoh: untuk event malam ini"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          </fieldset>

          <button
            type="submit"
            className={`blc-btn ${loading ? "is-loading" : ""}`}
            disabled={itemsCount < 1 || loading}
            aria-disabled={itemsCount < 1 || loading}
          >
            {loading ? "Menyimpan…" : "Simpan"}
          </button>
        </form>
      </div>

      {mounted && successTx
        ? createPortal(
            <div className="blc-success-overlay" onClick={() => setSuccessTx(null)}>
              <div className="blc-success-sheet" onClick={(e) => e.stopPropagation()}>
                <h3>{successTx.label} Berhasil</h3>
                <p style={{ color: "#e8e0d0" }}>{successTx.message}</p>
                <div className="blc-success-meta">
                  <div>
                    <span>Item</span>
                    <strong>{successTx.item}</strong>
                  </div>
                  <div>
                    <span>Jumlah</span>
                    <strong>x{successTx.quantity}</strong>
                  </div>
                  <div>
                    <span>Stok sekarang</span>
                    <strong>{successTx.stock}</strong>
                  </div>
                  {successTx.note ? (
                    <div>
                      <span>Catatan</span>
                      <strong>{successTx.note}</strong>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="blc-btn"
                  style={{ marginTop: "1rem" }}
                  onClick={() => setSuccessTx(null)}
                >
                  Lanjut
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
