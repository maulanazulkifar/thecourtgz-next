import { prisma } from "@/lib/prisma";
import { isWeaponCategoryName } from "@/lib/constants";
import { sanitizeText } from "@/lib/sanitize";
import { bumpStockVersion } from "@/lib/stock-version";
import { format } from "date-fns";

export type MovementInput = {
  categoryId: number;
  itemId: number;
  type: "in" | "out";
  quantity: number;
  note?: string | null;
  userId: bigint;
  userName: string;
};

export async function createMovement(input: MovementInput) {
  const note = sanitizeText(input.note ?? null, 500);
  const qty = input.quantity;

  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
    throw new Error("Jumlah tidak valid.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: bigint; category_id: bigint; name: string; stock: number }[]
      >`SELECT id, category_id, name, stock FROM items WHERE id = ${BigInt(input.itemId)} FOR UPDATE`;

      const row = locked[0];
      if (!row) throw new Error("Item tidak ditemukan.");
      if (Number(row.category_id) !== input.categoryId) {
        throw new Error("Item tidak sesuai kategori.");
      }

      // Setelah lock item: cegah double-submit konkuren (klik 2x saat lag)
      const since = new Date(Date.now() - 5000);
      const duplicate = await tx.stockMovement.findFirst({
        where: {
          userId: input.userId,
          itemId: row.id,
          type: input.type,
          quantity: qty,
          movementDate: { gte: since },
        },
        orderBy: { id: "desc" },
      });
      if (duplicate) {
        const fresh = await tx.item.findUniqueOrThrow({ where: { id: row.id } });
        return { item: fresh, deduped: true };
      }

      if (input.type === "out") {
        if (row.stock < qty) {
          throw new Error(`Stok tidak mencukupi. Sisa stok saat ini: ${row.stock}`);
        }
        const updated = await tx.$executeRaw`
          UPDATE items
          SET stock = stock - ${qty}, updated_at = NOW()
          WHERE id = ${row.id} AND stock >= ${qty}
        `;
        if (Number(updated) !== 1) {
          const fresh = await tx.$queryRaw<{ stock: number }[]>`
            SELECT stock FROM items WHERE id = ${row.id}
          `;
          throw new Error(
            `Stok berubah karena transaksi lain. Sisa stok: ${fresh[0]?.stock ?? 0}`,
          );
        }
      } else {
        await tx.$executeRaw`
          UPDATE items
          SET stock = stock + ${qty}, updated_at = NOW()
          WHERE id = ${row.id}
        `;
      }

      await tx.stockMovement.create({
        data: {
          itemId: row.id,
          userId: input.userId,
          type: input.type,
          quantity: qty,
          toWhom: input.userName.slice(0, 100),
          purpose: input.type === "in" ? "deposit" : "withdraw",
          note,
          movementDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const fresh = await tx.item.findUniqueOrThrow({ where: { id: row.id } });
      return { item: fresh, deduped: false };
    });

    await bumpStockVersion();

    const isDeposit = input.type === "in";
    return {
      type: isDeposit ? "deposit" : "withdraw",
      label: isDeposit ? "Deposit" : "Withdraw",
      item: result.item.name,
      quantity: qty,
      stock: result.item.stock,
      note,
      message: result.deduped
        ? `${isDeposit ? "Deposit" : "Withdraw"} sudah tercatat (abaikan klik dobel).`
        : `${isDeposit ? "Deposit" : "Withdraw"} berhasil dicatat.`,
    };
  } catch (e) {
    await bumpStockVersion();
    throw e;
  }
}

function isWeaponWithdraw(type: string, categoryName?: string | null) {
  return type === "out" && isWeaponCategoryName(categoryName);
}

export async function markReturned(
  movementId: number,
  actorId: bigint,
  actorName: string,
  returnQtyRaw?: number,
  returnNoteRaw?: string | null,
) {
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: bigint;
          item_id: bigint;
          user_id: bigint;
          type: string;
          quantity: number;
          to_whom: string | null;
          returned_at: Date | null;
          unreturnable_at: Date | null;
          return_movement_id: bigint | null;
          category_name: string | null;
          user_name: string | null;
          item_name: string;
        }[]
      >`
        SELECT sm.id, sm.item_id, sm.user_id, sm.type, sm.quantity, sm.to_whom,
               sm.returned_at, sm.unreturnable_at, sm.return_movement_id,
               c.name AS category_name, u.name AS user_name,
               i.name AS item_name
        FROM stock_movements sm
        JOIN items i ON i.id = sm.item_id
        LEFT JOIN categories c ON c.id = i.category_id
        LEFT JOIN users u ON u.id = sm.user_id
        WHERE sm.id = ${BigInt(movementId)}
        FOR UPDATE OF sm
      `;

      const withdraw = locked[0];
      if (!withdraw) throw new Error("Transaksi tidak ditemukan.");
      if (withdraw.type !== "out") {
        throw new Error("Hanya withdraw yang bisa ditandai pengembalian.");
      }
      if (withdraw.unreturnable_at) {
        throw new Error("Item ini sudah ditandai tidak bisa dikembalikan.");
      }
      if (!isWeaponWithdraw(withdraw.type, withdraw.category_name)) {
        throw new Error(
          "Hanya withdraw kategori yang mengandung Weapon/Senjata yang bisa ditandai pengembalian.",
        );
      }

      let alreadyReturned = 0;
      if (withdraw.return_movement_id) {
        const prev = await tx.$queryRaw<{ quantity: number }[]>`
          SELECT quantity FROM stock_movements
          WHERE id = ${withdraw.return_movement_id}
          FOR UPDATE
        `;
        alreadyReturned = prev[0]?.quantity ?? 0;
      }

      const maxQty = withdraw.quantity;
      const remaining = maxQty - alreadyReturned;
      if (remaining <= 0) {
        throw new Error("Item ini sudah ditandai dikembalikan.");
      }

      const qty =
        returnQtyRaw === undefined || returnQtyRaw === null
          ? remaining
          : Number(returnQtyRaw);

      if (!Number.isInteger(qty) || qty < 1) {
        throw new Error(
          "Jumlah 0 sama saja tidak dikembalikan. Isi minimal 1, atau pakai \"Tidak bisa dikembalikan\".",
        );
      }
      if (qty > remaining) {
        throw new Error(
          `Jumlah dikembalikan tidak boleh lebih dari sisa ${remaining} (dari ${maxQty}).`,
        );
      }

      const totalReturned = alreadyReturned + qty;
      const returnedBy =
        withdraw.user_name?.trim() || withdraw.to_whom?.trim() || "seseorang";
      const itemName = withdraw.item_name?.trim() || "Item";
      const summary = `${itemName} telah dikembalikan oleh ${returnedBy} sejumlah ${totalReturned} dari ${maxQty}.`;
      const extra = sanitizeText(returnNoteRaw ?? null, 500);
      const note = extra ? `${summary} Catatan pengembalian: ${extra}` : summary;

      await tx.$queryRaw`SELECT id FROM items WHERE id = ${withdraw.item_id} FOR UPDATE`;

      await tx.$executeRaw`
        UPDATE items SET stock = stock + ${qty}, updated_at = NOW()
        WHERE id = ${withdraw.item_id}
      `;

      let returnMovementId = withdraw.return_movement_id;
      if (returnMovementId) {
        await tx.stockMovement.update({
          where: { id: returnMovementId },
          data: {
            quantity: totalReturned,
            note,
            updatedAt: new Date(),
          },
        });
      } else {
        const returnMovement = await tx.stockMovement.create({
          data: {
            itemId: withdraw.item_id,
            userId: actorId,
            type: "in",
            quantity: qty,
            toWhom: actorName.slice(0, 100),
            purpose: "return",
            note,
            movementDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        returnMovementId = returnMovement.id;
      }

      const fullyReturned = totalReturned >= maxQty;
      await tx.stockMovement.update({
        where: { id: withdraw.id },
        data: {
          returnedAt: fullyReturned ? new Date() : null,
          returnedBy: actorId,
          returnMovementId,
          updatedAt: new Date(),
        },
      });
    });

    await bumpStockVersion();
  } catch (e) {
    await bumpStockVersion();
    throw e;
  }
}

export async function markUnreturnable(
  movementId: number,
  actorId: bigint,
  reasonRaw: string,
) {
  const reason = sanitizeText(reasonRaw, 255);
  if (!reason) {
    throw new Error("Isi alasan kenapa senjata tidak bisa dikembalikan.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: bigint;
          type: string;
          returned_at: Date | null;
          unreturnable_at: Date | null;
          category_name: string | null;
        }[]
      >`
        SELECT sm.id, sm.type, sm.returned_at, sm.unreturnable_at, c.name AS category_name
        FROM stock_movements sm
        JOIN items i ON i.id = sm.item_id
        LEFT JOIN categories c ON c.id = i.category_id
        WHERE sm.id = ${BigInt(movementId)}
        FOR UPDATE OF sm
      `;

      const withdraw = locked[0];
      if (!withdraw) throw new Error("Transaksi tidak ditemukan.");
      if (withdraw.type !== "out" || !isWeaponWithdraw(withdraw.type, withdraw.category_name)) {
        throw new Error(
          "Hanya withdraw kategori yang mengandung Weapon/Senjata yang bisa ditandai.",
        );
      }
      if (withdraw.returned_at) {
        throw new Error("Senjata ini sudah dikembalikan, tidak bisa ditandai hilang.");
      }
      if (withdraw.unreturnable_at) {
        throw new Error("Sudah ditandai tidak bisa dikembalikan sebelumnya.");
      }

      await tx.stockMovement.update({
        where: { id: withdraw.id },
        data: {
          unreturnableAt: new Date(),
          unreturnableReason: reason,
          unreturnableBy: actorId,
          updatedAt: new Date(),
        },
      });
    });

    await bumpStockVersion();
  } catch (e) {
    await bumpStockVersion();
    throw e;
  }
}

export type MonitoringFilters = {
  memberId?: string;
  categoryId?: string;
};

export async function getMonitoringFilterOptions() {
  const [categories, members] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { stockMovements: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    categories: categories.map((c) => ({ id: String(c.id), name: c.name })),
    members: members.map((u) => ({
      id: String(u.id),
      name: u.name?.trim() || `User #${u.id}`,
    })),
  };
}

export async function buildMonitoringPayload(
  fromDate: Date | null,
  toDate: Date | null,
  filters: MonitoringFilters | string = {},
) {
  // backward compat: old call signature used member name string
  const normalized: MonitoringFilters =
    typeof filters === "string" ? { memberId: filters } : filters;

  const memberId = (normalized.memberId ?? "").trim();
  const categoryId = (normalized.categoryId ?? "").trim();
  const memberBig =
    memberId && /^\d+$/.test(memberId) ? BigInt(memberId) : null;
  const categoryBig =
    categoryId && /^\d+$/.test(categoryId) ? BigInt(categoryId) : null;

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(fromDate && toDate
        ? { movementDate: { gte: fromDate, lte: toDate } }
        : {}),
      ...(memberBig ? { userId: memberBig } : {}),
      ...(categoryBig ? { item: { categoryId: categoryBig } } : {}),
    },
    include: {
      item: { include: { category: true } },
      user: true,
      returnedByUser: true,
      unreturnableByUser: true,
      returnMovement: { select: { quantity: true } },
    },
    orderBy: [{ movementDate: "desc" }, { id: "desc" }],
    take: 300,
  });

  function pendingWeaponQty(m: (typeof movements)[number]) {
    if (!isWeaponWithdraw(m.type, m.item?.category?.name)) return 0;
    if (m.unreturnableAt) return 0;
    const returnedQty = m.returnMovement?.quantity ?? (m.returnedAt ? m.quantity : 0);
    return Math.max(0, m.quantity - returnedQty);
  }

  const byUser = new Map<string, typeof movements>();
  for (const m of movements) {
    const key = String(m.userId);
    const list = byUser.get(key) ?? [];
    list.push(m);
    byUser.set(key, list);
  }

  const notices = [...byUser.values()]
    .map((rows) => {
      const first = rows[0];
      return {
        user_id: Number(first.userId),
        name: first.user?.name ?? first.toWhom ?? "Tidak diketahui",
        total: rows.length,
        withdraw: rows.filter((r) => r.type === "out").length,
        deposit: rows.filter((r) => r.type === "in").length,
        pending_weapon: rows.reduce((sum, r) => sum + pendingWeaponQty(r), 0),
        last_at: format(first.movementDate, "HH:mm:ss"),
      };
    })
    .sort((a, b) => b.last_at.localeCompare(a.last_at));

  const rows = movements.map((row) => {
    const weapon = isWeaponWithdraw(row.type, row.item?.category?.name);
    const pendingQty = pendingWeaponQty(row);
    const needsReturn = pendingQty > 0;
    let status = "selesai";
    if (row.type === "in") status = "masuk";
    else if (needsReturn && row.returnedAt) status = "belum_dikembalikan";
    else if (needsReturn) status = "belum_dikembalikan";
    else if (row.returnedAt) status = "sudah_dikembalikan";
    else if (row.unreturnableAt) status = "tidak_bisa_dikembalikan";

    return {
      id: Number(row.id),
      type: row.type,
      type_label:
        row.type === "in"
          ? row.purpose === "return"
            ? "Pengembalian"
            : "Deposit"
          : "Withdraw",
      user: row.user?.name ?? row.toWhom ?? "—",
      user_id: Number(row.userId),
      item: row.item?.name ?? "Item dihapus",
      category: row.item?.category?.name ?? "—",
      quantity: row.quantity,
      note: row.note,
      time: format(row.movementDate, "d MMM yyyy HH:mm:ss"),
      is_weapon: weapon,
      needs_return: needsReturn,
      pending_qty: pendingQty,
      returned_at: row.returnedAt ? format(row.returnedAt, "d MMM yyyy HH:mm:ss") : null,
      returned_by: row.returnedByUser?.name ?? null,
      unreturnable_at: row.unreturnableAt
        ? format(row.unreturnableAt, "d MMM yyyy HH:mm:ss")
        : null,
      unreturnable_reason: row.unreturnableReason,
      unreturnable_by: row.unreturnableByUser?.name ?? null,
      status,
    };
  });

  const pendingWeapon = rows.reduce((sum, r) => sum + (r.pending_qty ?? 0), 0);
  return { notices, rows, pendingWeapon };
}

export async function stockPayload() {
  const items = await prisma.item.findMany({
    orderBy: { name: "asc" },
    select: { id: true, categoryId: true, name: true, stock: true },
  });

  const byCategory: Record<
    string,
    { id: number; text: string; name: string; stock: number }[]
  > = {};

  for (const item of items) {
    const key = String(item.categoryId);
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push({
      id: Number(item.id),
      text: `${item.name} (stok: ${item.stock})`,
      name: item.name,
      stock: item.stock,
    });
  }

  return byCategory;
}

/**
 * Analisis selisih stok item vs ledger (masuk - keluar) — read-only, ringan.
 */
export async function getStockRecapRows() {
  const rows = await prisma.$queryRaw<
    {
      id: bigint;
      name: string;
      stock: number;
      category: string | null;
      masuk: number;
      keluar: number;
    }[]
  >`
    SELECT
      i.id,
      i.name,
      i.stock,
      c.name AS category,
      COALESCE(SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE 0 END), 0)::int AS masuk,
      COALESCE(SUM(CASE WHEN sm.type = 'out' THEN sm.quantity ELSE 0 END), 0)::int AS keluar
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN stock_movements sm ON sm.item_id = i.id
    GROUP BY i.id, c.name
    ORDER BY i.name ASC
  `;

  return rows.map((r) => {
    const hitung = r.masuk - r.keluar;
    const gap = r.stock - hitung;
    let reason: string | null = null;
    if (gap > 0) {
      reason =
        "Stok item lebih tinggi dari riwayat transaksi (ada stok tanpa deposit/ledger).";
    } else if (gap < 0) {
      reason =
        "Riwayat masuk lebih banyak dari stok (penyesuaian dobel, atau stok diedit tanpa withdraw).";
    }
    return {
      id: Number(r.id),
      name: r.name,
      category: r.category ?? "Tanpa kategori",
      stock: r.stock,
      masuk: r.masuk,
      keluar: r.keluar,
      hitung,
      gap,
      reason,
    };
  });
}

export async function getMovementTotals() {
  const totals = await prisma.$queryRaw<{ type: string; qty: number }[]>`
    SELECT type, COALESCE(SUM(quantity), 0)::int AS qty
    FROM stock_movements
    GROUP BY type
  `;
  const depositTotal = totals.find((t) => t.type === "in")?.qty ?? 0;
  const withdrawTotal = totals.find((t) => t.type === "out")?.qty ?? 0;
  return { depositTotal, withdrawTotal };
}

export async function getItemAuditTrail(itemId: number, limit = 80) {
  const id = BigInt(itemId);
  const item = await prisma.item.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      stock: true,
      sku: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
    },
  });
  if (!item) return null;

  const [movements, totals] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { itemId: id },
      select: {
        id: true,
        type: true,
        purpose: true,
        quantity: true,
        note: true,
        movementDate: true,
        user: { select: { name: true } },
      },
      orderBy: [{ movementDate: "asc" }, { id: "asc" }],
      take: limit,
    }),
    prisma.$queryRaw<{ masuk: number; keluar: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0)::int AS masuk,
        COALESCE(SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END), 0)::int AS keluar
      FROM stock_movements
      WHERE item_id = ${id}
    `,
  ]);

  const masuk = totals[0]?.masuk ?? 0;
  const keluar = totals[0]?.keluar ?? 0;
  const hitung = masuk - keluar;
  const gap = item.stock - hitung;
  let reason: string | null = null;
  if (gap > 0) {
    reason =
      "Stok item lebih tinggi dari riwayat transaksi (ada stok tanpa deposit/ledger).";
  } else if (gap < 0) {
    reason =
      "Riwayat masuk lebih banyak dari stok (penyesuaian dobel, atau stok diedit tanpa withdraw).";
  }

  const category = item.category?.name ?? "Tanpa kategori";

  function actionMeta(m: {
    type: string;
    purpose: string | null;
    note: string | null;
  }) {
    if (m.purpose === "return") {
      return { label: "Pengembalian", kind: "return" as const, suspect: false };
    }
    if (m.note?.includes("Penyesuaian")) {
      return { label: "Penyesuaian", kind: "adjust" as const, suspect: true };
    }
    if (m.note?.includes("Stok awal")) {
      return { label: "Stok awal", kind: "initial" as const, suspect: false };
    }
    if (m.purpose === "deposit" || m.type === "in") {
      return { label: "Masuk", kind: "deposit" as const, suspect: false };
    }
    return { label: "Keluar", kind: "withdraw" as const, suspect: false };
  }

  let running = 0;
  const enriched = movements.map((m) => {
    const meta = actionMeta(m);
    running += m.type === "in" ? m.quantity : -m.quantity;
    return {
      id: Number(m.id),
      type: m.type,
      purpose: m.purpose,
      quantity: m.quantity,
      note: m.note,
      time: m.movementDate.toISOString(),
      user: m.user?.name?.trim() || "—",
      label: meta.label,
      kind: meta.kind,
      suspect: meta.suspect,
      runningAfter: running,
    };
  });

  // Timeline di UI: terbaru dulu, tapi hitung running dari lama→baru di atas
  const timeline = [...enriched].reverse();

  const first = enriched[0] ?? null;
  const last = enriched[enriched.length - 1] ?? null;
  const suspects = enriched.filter((m) => m.suspect);
  const firstSuspect = suspects[0] ?? null;

  let likelySince: string | null = null;
  let likelySinceBy: string | null = null;
  let likelySinceLabel: string | null = null;
  let tip =
    "Tidak ada selisih. Semua transaksi di bawah bisa ditelusuri siapa yang menginput.";

  if (gap !== 0) {
    if (firstSuspect) {
      likelySince = firstSuspect.time;
      likelySinceBy = firstSuspect.user;
      likelySinceLabel = firstSuspect.label;
      tip =
        gap > 0
          ? "Ada penyesuaian stok yang perlu dicek. Selisih positif biasanya muncul sejak edit stok / penyesuaian tanpa ledger yang cocok."
          : "Ada penyesuaian stok yang perlu dicek. Selisih negatif biasanya dari penyesuaian naik yang dobel, atau stok diturunkan tanpa withdraw.";
    } else if (item.updatedAt) {
      likelySince = item.updatedAt.toISOString();
      likelySinceBy = last?.user ?? null;
      likelySinceLabel = "Perubahan stok item";
      tip =
        gap > 0
          ? "Stok lebih tinggi dari ledger. Cek kapan stok terakhir diubah dan siapa yang menginput deposit/withdraw terakhir."
          : "Ledger lebih tinggi dari stok. Cek transaksi masuk terakhir dan apakah stok pernah diedit manual.";
    } else if (first) {
      likelySince = first.time;
      likelySinceBy = first.user;
      likelySinceLabel = first.label;
      tip = "Selisih terdeteksi. Telusuri transaksi dari yang paling lama, perhatikan siapa yang menginput.";
    } else {
      tip =
        "Ada selisih tapi belum ada riwayat transaksi. Stok kemungkinan diisi tanpa deposit.";
      if (item.createdAt) {
        likelySince = item.createdAt.toISOString();
        likelySinceLabel = "Item dibuat";
      }
    }
  }

  return {
    item: {
      id: Number(item.id),
      name: item.name,
      sku: item.sku,
      stock: item.stock,
      categoryId: item.category ? Number(item.category.id) : null,
      category,
      updatedAt: item.updatedAt?.toISOString() ?? null,
      createdAt: item.createdAt?.toISOString() ?? null,
    },
    recap: {
      id: Number(item.id),
      name: item.name,
      category,
      stock: item.stock,
      masuk,
      keluar,
      hitung,
      gap,
      reason,
    },
    insight: {
      tip,
      gap,
      stockUpdatedAt: item.updatedAt?.toISOString() ?? null,
      firstTxAt: first?.time ?? null,
      firstTxBy: first?.user ?? null,
      lastTxAt: last?.time ?? null,
      lastTxBy: last?.user ?? null,
      lastTxLabel: last?.label ?? null,
      suspectCount: suspects.length,
      likelySince,
      likelySinceBy,
      likelySinceLabel,
    },
    movements: timeline,
  };
}

/**
 * Hapus transaksi & kembalikan efek stok.
 * Deposit/pengembalian dihapus → stok berkurang.
 * Withdraw dihapus → stok bertambah.
 * Jika withdraw sudah punya pengembalian, pengembalian ikut dihapus (stok disesuaikan).
 */
export async function deleteStockMovement(movementId: number) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: bigint;
          item_id: bigint;
          type: string;
          quantity: number;
          purpose: string | null;
          note: string | null;
          return_movement_id: bigint | null;
          item_name: string;
          item_stock: number;
        }[]
      >`
        SELECT sm.id, sm.item_id, sm.type, sm.quantity, sm.purpose, sm.note,
               sm.return_movement_id, i.name AS item_name, i.stock AS item_stock
        FROM stock_movements sm
        JOIN items i ON i.id = sm.item_id
        WHERE sm.id = ${BigInt(movementId)}
        FOR UPDATE OF sm
      `;

      const row = locked[0];
      if (!row) throw new Error("Transaksi tidak ditemukan.");

      await tx.$queryRaw`SELECT id FROM items WHERE id = ${row.item_id} FOR UPDATE`;

      let stockDelta = 0;
      const parts: string[] = [];

      // Withdraw yang sudah dikembalikan → lepas link & hapus pengembalian dulu
      if (row.type === "out" && row.return_movement_id) {
        const retId = row.return_movement_id;
        const ret = await tx.$queryRaw<{ id: bigint; quantity: number }[]>`
          SELECT id, quantity FROM stock_movements
          WHERE id = ${retId}
          FOR UPDATE
        `;
        const retRow = ret[0];

        await tx.stockMovement.update({
          where: { id: row.id },
          data: {
            returnedAt: null,
            returnedBy: null,
            returnMovementId: null,
            updatedAt: new Date(),
          },
        });

        if (retRow) {
          stockDelta -= retRow.quantity; // undo masuk pengembalian
          parts.push(`hapus pengembalian (stok −${retRow.quantity})`);
          await tx.stockMovement.delete({ where: { id: retRow.id } });
        }
      }

      // Pengembalian dihapus → bersihkan flag di withdraw asal
      if (row.purpose === "return") {
        await tx.stockMovement.updateMany({
          where: { returnMovementId: row.id },
          data: {
            returnedAt: null,
            returnedBy: null,
            returnMovementId: null,
            updatedAt: new Date(),
          },
        });
      }

      // Undo transaksi ini
      if (row.type === "in") {
        stockDelta -= row.quantity;
        parts.push(
          `hapus ${row.purpose === "return" ? "pengembalian" : "deposit"} (stok −${row.quantity})`,
        );
      } else {
        stockDelta += row.quantity;
        parts.push(`hapus withdraw (stok +${row.quantity})`);
      }

      const nextStock = row.item_stock + stockDelta;
      if (nextStock < 0) {
        throw new Error(
          `Stok ${row.item_name} tidak cukup untuk membatalkan transaksi ini (akan jadi ${nextStock}).`,
        );
      }

      await tx.$executeRaw`
        UPDATE items SET stock = ${nextStock}, updated_at = NOW()
        WHERE id = ${row.item_id}
      `;

      await tx.stockMovement.delete({ where: { id: row.id } });

      return {
        item: row.item_name,
        stockBefore: row.item_stock,
        stockAfter: nextStock,
        summary: parts.join("; "),
      };
    });

    await bumpStockVersion();
    return result;
  } catch (e) {
    await bumpStockVersion();
    throw e;
  }
}

/**
 * Edit jumlah/catatan transaksi & sesuaikan stok.
 * Deposit: qty naik → stok naik; qty turun → stok turun.
 * Withdraw: qty naik → stok turun; qty turun → stok naik.
 */
export async function updateStockMovement(
  movementId: number,
  input: { quantity?: number; note?: string | null },
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: bigint;
          item_id: bigint;
          type: string;
          quantity: number;
          purpose: string | null;
          note: string | null;
          return_movement_id: bigint | null;
          returned_at: Date | null;
          item_name: string;
          item_stock: number;
        }[]
      >`
        SELECT sm.id, sm.item_id, sm.type, sm.quantity, sm.purpose, sm.note,
               sm.return_movement_id, sm.returned_at,
               i.name AS item_name, i.stock AS item_stock
        FROM stock_movements sm
        JOIN items i ON i.id = sm.item_id
        WHERE sm.id = ${BigInt(movementId)}
        FOR UPDATE OF sm
      `;

      const row = locked[0];
      if (!row) throw new Error("Transaksi tidak ditemukan.");

      await tx.$queryRaw`SELECT id FROM items WHERE id = ${row.item_id} FOR UPDATE`;

      if (row.returned_at || row.return_movement_id) {
        throw new Error(
          "Withdraw ini sudah dikembalikan. Hapus pengembaliannya dulu sebelum mengedit.",
        );
      }

      const linkedParent =
        row.purpose === "return"
          ? await tx.stockMovement.findFirst({
              where: { returnMovementId: row.id },
              select: { id: true },
            })
          : null;

      const oldQty = row.quantity;
      const newQty =
        input.quantity === undefined || input.quantity === null
          ? oldQty
          : Number(input.quantity);

      if (!Number.isInteger(newQty) || newQty < 1) {
        throw new Error("Jumlah harus bilangan bulat minimal 1.");
      }
      if (newQty > 100000) {
        throw new Error("Jumlah terlalu besar.");
      }

      if (linkedParent && newQty !== oldQty) {
        throw new Error(
          "Jumlah pengembalian tidak bisa diedit. Hapus lalu buat pengembalian baru, atau ubah catatan saja.",
        );
      }

      const note =
        input.note === undefined ? row.note : sanitizeText(input.note, 500);

      let stockDelta = 0;
      if (newQty !== oldQty) {
        stockDelta = row.type === "in" ? newQty - oldQty : oldQty - newQty;
      }

      const nextStock = row.item_stock + stockDelta;
      if (nextStock < 0) {
        throw new Error(
          `Stok ${row.item_name} tidak cukup untuk perubahan ini (akan jadi ${nextStock}).`,
        );
      }

      if (stockDelta !== 0) {
        await tx.$executeRaw`
          UPDATE items SET stock = ${nextStock}, updated_at = NOW()
          WHERE id = ${row.item_id}
        `;
      }

      await tx.stockMovement.update({
        where: { id: row.id },
        data: {
          quantity: newQty,
          note,
          updatedAt: new Date(),
        },
      });

      return {
        item: row.item_name,
        type: row.type,
        qtyBefore: oldQty,
        qtyAfter: newQty,
        stockBefore: row.item_stock,
        stockAfter: nextStock,
      };
    });

    await bumpStockVersion();
    return result;
  } catch (e) {
    await bumpStockVersion();
    throw e;
  }
}

/**
 * Samakan stok item ke ledger (masuk - keluar). Aman & idempoten.
 * Juga hapus penyesuaian stok awal yang dobel (race repair lama).
 */
export async function reconcileStockLedger() {
  // Hapus duplikat penyesuaian yang tercipta di detik yang sama
  await prisma.$executeRaw`
    DELETE FROM stock_movements a
    USING stock_movements b
    WHERE a.id > b.id
      AND a.item_id = b.item_id
      AND a.type = 'in'
      AND a.purpose = 'deposit'
      AND a.note IS NOT NULL
      AND b.note IS NOT NULL
      AND a.note LIKE 'Penyesuaian stok awal%'
      AND b.note LIKE 'Penyesuaian stok awal%'
      AND a.quantity = b.quantity
      AND a.movement_date = b.movement_date
  `;

  const updated = await prisma.$executeRaw`
    WITH ledger AS (
      SELECT item_id,
        COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0) AS masuk,
        COALESCE(SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END), 0) AS keluar
      FROM stock_movements
      GROUP BY item_id
    )
    UPDATE items i
    SET stock = GREATEST(0, (COALESCE(l.masuk, 0) - COALESCE(l.keluar, 0))::int),
        updated_at = NOW()
    FROM ledger l
    WHERE l.item_id = i.id
      AND i.stock <> (COALESCE(l.masuk, 0) - COALESCE(l.keluar, 0))
  `;

  // Item tanpa movement sama sekali → biarkan; gap positif tanpa movement
  // ditangani terpisah hanya jika diminta (jangan auto-deposit lagi di page load)

  await bumpStockVersion();
  return Number(updated);
}

/**
 * @deprecated Jangan panggil di page load — rawan race & berat.
 * Gunakan reconcileStockLedger() lewat tombol eksplisit.
 */
export async function repairMissingStockDeposits(actorUserId: bigint, actorName: string) {
  return reconcileStockLedger();
}
