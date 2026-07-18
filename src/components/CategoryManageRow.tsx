"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BlcNoticeOverlay } from "@/components/BlcNoticeOverlay";
import {
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions/inventory";

type Notice =
  | { kind: "confirm-delete" }
  | { kind: "success-delete" }
  | { kind: "success-edit"; name: string }
  | { kind: "error"; message: string };

export function CategoryManageRow({
  id,
  name,
  description,
  canManage,
}: {
  id: string;
  name: string;
  description: string | null;
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
    const result = await updateCategoryAction(fd);
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
    const result = await deleteCategoryAction(id);
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
              <label className="blc-label" htmlFor={`cat-name-${id}`}>
                Nama
              </label>
              <input
                id={`cat-name-${id}`}
                name="name"
                className="blc-input"
                required
                maxLength={100}
                defaultValue={name}
                disabled={loading}
              />
            </div>
            <div className="blc-field">
              <label className="blc-label" htmlFor={`cat-desc-${id}`}>
                Deskripsi
              </label>
              <textarea
                id={`cat-desc-${id}`}
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
            <h3>{name}</h3>
            <p>{description || "—"}</p>
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
          title="Hapus Kategori?"
          message="Item di dalam kategori ini ikut terhapus."
          meta={[{ label: "Kategori", value: name }]}
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
          message="Kategori sudah terhapus."
          meta={[{ label: "Kategori", value: name }]}
          primaryLabel="Lanjut"
          onPrimary={closeSuccessAndRefresh}
        />
      ) : null}

      {notice?.kind === "success-edit" ? (
        <BlcNoticeOverlay
          title="Edit Berhasil"
          message="Kategori sudah diperbarui."
          meta={[{ label: "Kategori", value: notice.name }]}
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
