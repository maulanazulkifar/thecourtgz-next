import Link from "next/link";
import { BlcShell } from "@/components/BlcShell";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { format } from "date-fns";

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const params = await searchParams;
  let tab = params.tab ?? "stok";
  if (!["stok", "deposit", "withdraw"].includes(tab)) tab = "stok";

  const totals = await prisma.stockMovement.groupBy({
    by: ["type"],
    _sum: { quantity: true },
  });
  const depositTotal = totals.find((t) => t.type === "in")?._sum.quantity ?? 0;
  const withdrawTotal = totals.find((t) => t.type === "out")?._sum.quantity ?? 0;

  const items = await prisma.item.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const perItem = await prisma.stockMovement.groupBy({
    by: ["itemId", "type"],
    _sum: { quantity: true },
  });

  const movements =
    tab === "stok"
      ? []
      : await prisma.stockMovement.findMany({
          where: { type: tab === "deposit" ? "in" : "out" },
          include: { item: true, user: true },
          orderBy: [{ movementDate: "desc" }, { id: "desc" }],
          take: 80,
        });

  function itemTotals(itemId: bigint) {
    const rows = perItem.filter((p) => p.itemId === itemId);
    return {
      in: rows.find((r) => r.type === "in")?._sum.quantity ?? 0,
      out: rows.find((r) => r.type === "out")?._sum.quantity ?? 0,
    };
  }

  return (
    <BlcShell showNav isStaff={staff} wide scroll>
      <div className="blc-page-head">
        <h1>Rekapitulasi Stok</h1>
        <p>Ringkas stok sekarang, deposit, dan withdraw — update dari semua anggota.</p>
      </div>

      <div className="blc-stat-grid">
        <div className="blc-stat">
          <span>Item</span>
          <strong>{items.length}</strong>
        </div>
        <div className="blc-stat">
          <span>Total Deposit</span>
          <strong>{depositTotal.toLocaleString("id-ID")}</strong>
        </div>
        <div className="blc-stat">
          <span>Total Withdraw</span>
          <strong>{withdrawTotal.toLocaleString("id-ID")}</strong>
        </div>
      </div>

      <div className="blc-tabs" role="tablist">
        {[
          ["stok", "Stok Sekarang"],
          ["deposit", "Deposit"],
          ["withdraw", "Withdraw"],
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

      <div className="blc-panel">
        {tab === "stok" ? (
          items.length === 0 ? (
            <div className="blc-empty">
              Belum ada item. Tambah item dulu lewat menu <strong>+ Item</strong>.
            </div>
          ) : (
            <div className="blc-list">
              {items.map((item) => {
                const stats = itemTotals(item.id);
                return (
                  <article key={String(item.id)} className="blc-list-item">
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {item.category?.name ?? "Tanpa kategori"} · masuk{" "}
                        {stats.in.toLocaleString("id-ID")} · keluar{" "}
                        {stats.out.toLocaleString("id-ID")}
                      </p>
                    </div>
                    <div className="blc-badge">{item.stock.toLocaleString("id-ID")}</div>
                  </article>
                );
              })}
            </div>
          )
        ) : movements.length === 0 ? (
          <div className="blc-empty">
            Belum ada riwayat {tab === "deposit" ? "deposit" : "withdraw"}.
          </div>
        ) : (
          <div className="blc-list">
            {movements.map((m) => (
              <article key={String(m.id)} className="blc-list-item">
                <div>
                  <h3>{m.item?.name ?? "Item dihapus"}</h3>
                  <p>
                    {m.user?.name ?? "—"} · {format(m.movementDate, "d MMM yyyy HH:mm")}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <div className={`blc-badge ${m.type === "in" ? "is-in" : "is-out"}`}>
                  {m.type === "in" ? "+" : "-"}
                  {m.quantity.toLocaleString("id-ID")}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </BlcShell>
  );
}
