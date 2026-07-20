"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reconcileStockAction } from "@/app/actions/rekap";

export function ReconcileStockButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <button
        type="button"
        className="blc-btn secondary"
        style={{ width: "auto", padding: "0.55rem 0.9rem", fontSize: "0.72rem" }}
        disabled={loading}
        onClick={async () => {
          if (
            !confirm(
              "Samakan sisa stok di gudang dengan catatan masuk/keluar? Penyesuaian dobel juga akan dibersihkan.",
            )
          ) {
            return;
          }
          setLoading(true);
          setMsg(null);
          const result = await reconcileStockAction();
          setLoading(false);
          setMsg(result.ok ? result.message : result.error);
          if (result.ok) router.refresh();
        }}
      >
        {loading ? "Memperbaiki…" : "Perbaiki angka"}
      </button>
      {msg ? (
        <p className="blc-mon-note" style={{ marginTop: "0.45rem" }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
