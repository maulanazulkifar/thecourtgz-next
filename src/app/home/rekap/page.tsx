import Link from "next/link";
import { BlcShell } from "@/components/BlcShell";
import { StockAuditClient } from "@/components/StockAuditClient";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { canManageCatalog } from "@/lib/category-access";
import { getMovementTotals, getStockRecapRows } from "@/lib/inventory";
import { loadItemAuditAction } from "@/app/actions/audit";
import { format } from "date-fns";

const PAGE_SIZE = 40;

const RETURN_NOTE_MARKER = "Catatan pengembalian:";

function parseReturnNote(itemName: string, note: string | null) {
  let body = (note ?? "").trim();
  let userNote: string | null = null;

  const markerIdx = body.indexOf(RETURN_NOTE_MARKER);
  if (markerIdx >= 0) {
    userNote = body.slice(markerIdx + RETURN_NOTE_MARKER.length).trim() || null;
    body = body.slice(0, markerIdx).trim();
  }

  if (body.includes("telah dikembalikan")) {
    return { summary: body, userNote };
  }

  const partial = body.match(/dikembalikan\s+(\d+)\s+dari\s+(\d+)/i);
  const by = body.match(/oleh\s+([^(]+?)(?:\s*\(|$)/i);
  const who = by?.[1]?.trim() || "seseorang";

  if (partial) {
    return {
      summary: `${itemName} telah dikembalikan oleh ${who} sejumlah ${partial[1]} dari ${partial[2]}.`,
      userNote,
    };
  }

  if (body.includes("Pengembalian dari withdraw")) {
    return {
      summary: `${itemName} telah dikembalikan oleh ${who}.`,
      userNote,
    };
  }

  return {
    summary: body || `${itemName} telah dikembalikan.`,
    userNote,
  };
}

function movementSource(m: {
  type: string;
  purpose: string | null;
  note: string | null;
  itemName: string;
}) {
  if (m.purpose === "return") {
    const parsed = parseReturnNote(m.itemName, m.note);
    return {
      label: "Pengembalian",
      hint: parsed.summary,
      note: parsed.userNote,
      klass: "is-deposit",
    };
  }
  if (m.note?.includes("Stok awal")) {
    return {
      label: "Stok awal",
      hint: "Deposit otomatis saat item ditambahkan",
      note: null as string | null,
      klass: "is-deposit",
    };
  }
  if (m.note?.includes("Penyesuaian")) {
    return {
      label: "Penyesuaian",
      hint:
        m.type === "in"
          ? "Naik karena edit stok item"
          : "Turun karena edit stok item",
      note: null as string | null,
      klass: "is-pending-return",
    };
  }
  if (m.purpose === "deposit" || m.type === "in") {
    return {
      label: "Masuk",
      hint: "Barang masuk ke gudang",
      note: m.note,
      klass: "is-deposit",
    };
  }
  return {
    label: "Keluar",
    hint: "Barang keluar dari gudang",
    note: m.note,
    klass: "is-withdraw",
  };
}

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canFix = canManageCatalog(session.user.email);
  const params = await searchParams;
  let tab = params.tab ?? "stok";
  if (!["stok", "deposit", "withdraw"].includes(tab)) tab = "stok";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ depositTotal, withdrawTotal }, stockRows] = await Promise.all([
    getMovementTotals(),
    getStockRecapRows(),
  ]);

  const stockTotal = stockRows.reduce((sum, r) => sum + r.stock, 0);
  const mismatchCount = stockRows.filter((r) => r.gap !== 0).length;
  const categories = [...new Set(stockRows.map((r) => r.category))].sort((a, b) =>
    a.localeCompare(b),
  );

  const movements =
    tab === "stok"
      ? []
      : await prisma.stockMovement.findMany({
          where: { type: tab === "deposit" ? "in" : "out" },
          select: {
            id: true,
            type: true,
            quantity: true,
            note: true,
            purpose: true,
            movementDate: true,
            item: { select: { name: true } },
            user: { select: { name: true } },
          },
          orderBy: [{ movementDate: "desc" }, { id: "desc" }],
          take: PAGE_SIZE,
          skip: (page - 1) * PAGE_SIZE,
        });

  const movementCount =
    tab === "stok"
      ? 0
      : await prisma.stockMovement.count({
          where: { type: tab === "deposit" ? "in" : "out" },
        });
  const totalPages = Math.max(1, Math.ceil(movementCount / PAGE_SIZE));

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canFix} wide scroll>
      <div className="blc-page-head">
        <h1>Cek Stok</h1>
        <p>Lihat sisa barang di gudang, dan riwayat barang masuk / keluar.</p>
      </div>

      <div className="blc-stat-grid">
        <div className="blc-stat">
          <span>Sisa di gudang</span>
          <strong>{stockTotal.toLocaleString("id-ID")}</strong>
        </div>
        <div className="blc-stat">
          <span>Total masuk</span>
          <strong>{depositTotal.toLocaleString("id-ID")}</strong>
        </div>
        <div className="blc-stat">
          <span>Total keluar</span>
          <strong>{withdrawTotal.toLocaleString("id-ID")}</strong>
        </div>
      </div>

      {mismatchCount > 0 ? (
        <div className="blc-mon-summary is-warn">
          Ada <strong>{mismatchCount} barang</strong> yang angkanya kurang cocok.
          Cek daftar di bawah (warna merah).
        </div>
      ) : (
        <div className="blc-mon-summary">
          Semua stok terlihat aman — tidak ada angka yang aneh.
        </div>
      )}

      <div className="blc-tabs" role="tablist">
        {[
          ["stok", "Sisa Stok"],
          ["deposit", "Barang Masuk"],
          ["withdraw", "Barang Keluar"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/home/rekap?tab=${key}`}
            className={`blc-tab ${tab === key ? "is-active" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "stok" ? (
        <StockAuditClient
          rows={stockRows}
          categories={categories}
          canFix={canFix}
          loadAudit={loadItemAuditAction}
          compactHeader
        />
      ) : (
        <div className="blc-panel">
          {movements.length === 0 ? (
            <div className="blc-empty">
              Belum ada riwayat {tab === "deposit" ? "barang masuk" : "barang keluar"}.
            </div>
          ) : (
            <>
              <div className="blc-list">
                {movements.map((m) => {
                  const itemName = m.item?.name ?? "Item dihapus";
                  const source = movementSource({
                    type: m.type,
                    purpose: m.purpose,
                    note: m.note,
                    itemName,
                  });
                  return (
                    <article key={String(m.id)} className="blc-list-item blc-rekap-tx">
                      <div>
                        <h3>
                          {itemName}{" "}
                          <span className={`blc-mon-badge ${source.klass}`}>
                            {source.label}
                          </span>
                        </h3>
                        <p>
                          {m.user?.name ?? "—"} ·{" "}
                          {format(m.movementDate, "d MMM yyyy HH:mm")}
                        </p>
                        <p className="blc-rekap-source">{source.hint}</p>
                        {source.note ? (
                          <p className="blc-mon-note blc-rekap-note">
                            Catatan: {source.note}
                          </p>
                        ) : null}
                      </div>
                      <div className={`blc-badge ${m.type === "in" ? "is-in" : "is-out"}`}>
                        {m.type === "in" ? "+" : "-"}
                        {m.quantity.toLocaleString("id-ID")}
                      </div>
                    </article>
                  );
                })}
              </div>
              {totalPages > 1 ? (
                <div
                  className="blc-actions"
                  style={{ justifyContent: "center", marginTop: "1rem" }}
                >
                  {page > 1 ? (
                    <Link
                      className="blc-btn secondary"
                      href={`/home/rekap?tab=${tab}&page=${page - 1}`}
                      style={{ width: "auto" }}
                    >
                      Sebelumnya
                    </Link>
                  ) : null}
                  <span className="blc-mon-note">
                    Halaman {page}/{totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link
                      className="blc-btn secondary"
                      href={`/home/rekap?tab=${tab}&page=${page + 1}`}
                      style={{ width: "auto" }}
                    >
                      Selanjutnya
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </BlcShell>
  );
}
