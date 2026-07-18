"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BlcNoticeOverlay } from "@/components/BlcNoticeOverlay";
import { deleteItemAction, updateItemAction } from "@/app/actions/inventory";

type Notice =
  | { kind: "confirm-delete" }
  | { kind: "success-delete" }
  | { kind: "success-edit"; name: string }
  | { kind: "error"; message: string };

export function ItemManageRow({
  id,
  name,
  sku,
  stock,
  description,
  categoryId,
  categoryName,
  categories,
  canManage,
}: {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  description: string | null;
  categoryId: string;
  categoryName: string;
  categories: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    const fd = new FormData(form);
    fd.set("id", id);
    const nextName = String(fd.get("name") ?? name);
    const result = await updateItemAction(fd);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    setNotice({ kind: "success-edit", name: nextName });
  }

  async function confirmDelete() {
    setLoading(true);
    setError(null);
    const result = await deleteItemAction(id);
    setLoading(false);
    if (!result.ok) {
      setNotice({ kind: "error", message: result.error });
      return;
    }
    setNotice({ kind: "success-delete" });
  }

  function closeSuccessAndRefresh() {
    setNotice(null);
    router.refresh();
  }

  return (
    <>
      {editing && canManage ? (
        <article className="blc-list-item" style={{ gridTemplateColumns: "1fr" }}>
          <form onSubmit={onSave}>
            {error ? <div className="blc-alert blc-alert-danger">{error}</div> : null}
            <div className="blc-field">
              <label className="blc-label" htmlFor={`item-cat-${id}`}>
                Kategori
              </label>
              <select
                id={`item-cat-${id}`}
                name="category_id"
                className="blc-select"
                required
                defaultValue={categoryId}
                disabled={loading}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="blc-field">
              <label className="blc-label" htmlFor={`item-name-${id}`}>
                Nama item
              </label>
              <input
                id={`item-name-${id}`}
                name="name"
                className="blc-input"
                required
                maxLength={150}
                defaultValue={name}
                disabled={loading}
              />
            </div>
            <div className="blc-home-row">
              <div className="blc-field">
                <label className="blc-label" htmlFor={`item-sku-${id}`}>
                  SKU
                </label>
                <input
                  id={`item-sku-${id}`}
                  name="sku"
                  className="blc-input"
                  maxLength={50}
                  defaultValue={sku ?? ""}
                  disabled={loading}
                />
              </div>
              <div className="blc-field">
                <label className="blc-label" htmlFor={`item-stock-${id}`}>
                  Stok
                </label>
                <input
                  id={`item-stock-${id}`}
                  name="stock"
                  type="number"
                  className="blc-input"
                  min={0}
                  defaultValue={stock}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="blc-field">
              <label className="blc-label" htmlFor={`item-desc-${id}`}>
                Deskripsi
              </label>
              <textarea
                id={`item-desc-${id}`}
                name="description"
                className="blc-textarea"
                maxLength={500}
                rows={2}
                defaultValue={description ?? ""}
                disabled={loading}
              />
            </div>
            <div className="blc-actions">
              <button
                type="submit"
                className={`blc-btn ${loading ? "is-loading" : ""}`}
                disabled={loading}
              >
                Simpan
              </button>
              <button
                type="button"
                className="blc-btn secondary"
                disabled={loading}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Batal
              </button>
            </div>
          </form>
        </article>
      ) : (
        <article className="blc-list-item">
          <div>
            <h3>
              {name}{" "}
              <span className="blc-badge" style={{ fontSize: "0.75rem" }}>
                stok {stock}
              </span>
            </h3>
            <p>
              {categoryName}
              {sku ? ` · ${sku}` : ""}
              {description ? ` · ${description}` : ""}
            </p>
            {error ? <p style={{ color: "var(--blc-danger)" }}>{error}</p> : null}
            {canManage ? (
              <div className="blc-actions">
                <button
                  type="button"
                  className="blc-btn"
                  disabled={loading}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="blc-btn secondary"
                  disabled={loading}
                  onClick={() => setNotice({ kind: "confirm-delete" })}
                >
                  Hapus
                </button>
              </div>
            ) : null}
          </div>
        </article>
      )}

      {notice?.kind === "confirm-delete" ? (
        <BlcNoticeOverlay
          title="Hapus Item?"
          message="Riwayat transaksi item ini ikut terhapus."
          meta={[
            { label: "Item", value: name },
            { label: "Kategori", value: categoryName },
            { label: "Stok", value: String(stock) },
          ]}
          primaryLabel={loading ? "Menghapus…" : "Hapus"}
          secondaryLabel="Batal"
          onPrimary={() => {
            if (!loading) void confirmDelete();
          }}
          onSecondary={() => setNotice(null)}
          onDismiss={() => {
            if (!loading) setNotice(null);
          }}
        />
      ) : null}

      {notice?.kind === "success-delete" ? (
        <BlcNoticeOverlay
          title="Hapus Berhasil"
          message="Item sudah terhapus."
          meta={[
            { label: "Item", value: name },
            { label: "Kategori", value: categoryName },
          ]}
          primaryLabel="Lanjut"
          onPrimary={closeSuccessAndRefresh}
        />
      ) : null}

      {notice?.kind === "success-edit" ? (
        <BlcNoticeOverlay
          title="Edit Berhasil"
          message="Item sudah diperbarui."
          meta={[{ label: "Item", value: notice.name }]}
          primaryLabel="Lanjut"
          onPrimary={closeSuccessAndRefresh}
        />
      ) : null}

      {notice?.kind === "error" ? (
        <BlcNoticeOverlay
          title="Gagal"
          message={notice.message}
          primaryLabel="OK"
          onPrimary={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
