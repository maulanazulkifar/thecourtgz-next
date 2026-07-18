import { prisma } from "@/lib/prisma";
import { WEAPON_CATEGORY_NAME } from "@/lib/constants";
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
    const item = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: bigint; category_id: bigint; name: string; stock: number }[]
      >`SELECT id, category_id, name, stock FROM items WHERE id = ${BigInt(input.itemId)} FOR UPDATE`;

      const row = locked[0];
      if (!row) throw new Error("Item tidak ditemukan.");
      if (Number(row.category_id) !== input.categoryId) {
        throw new Error("Item tidak sesuai kategori.");
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
      return fresh;
    });

    await bumpStockVersion();

    const isDeposit = input.type === "in";
    return {
      type: isDeposit ? "deposit" : "withdraw",
      label: isDeposit ? "Deposit" : "Withdraw",
      item: item.name,
      quantity: qty,
      stock: item.stock,
      note,
      message: `${isDeposit ? "Deposit" : "Withdraw"} berhasil dicatat.`,
    };
  } catch (e) {
    await bumpStockVersion();
    throw e;
  }
}

function isWeaponWithdraw(type: string, categoryName?: string | null) {
  return (
    type === "out" &&
    (categoryName ?? "").trim().toLowerCase() === WEAPON_CATEGORY_NAME.toLowerCase()
  );
}

export async function markReturned(movementId: number, actorId: bigint, actorName: string) {
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
          category_name: string | null;
          user_name: string | null;
        }[]
      >`
        SELECT sm.id, sm.item_id, sm.user_id, sm.type, sm.quantity, sm.to_whom,
               sm.returned_at, sm.unreturnable_at, c.name AS category_name, u.name AS user_name
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
      if (withdraw.returned_at) {
        throw new Error("Item ini sudah ditandai dikembalikan.");
      }
      if (withdraw.unreturnable_at) {
        throw new Error("Item ini sudah ditandai tidak bisa dikembalikan.");
      }
      if (!isWeaponWithdraw(withdraw.type, withdraw.category_name)) {
        throw new Error(
          "Hanya withdraw kategori Senjata yang wajib / bisa ditandai pengembalian.",
        );
      }

      await tx.$queryRaw`SELECT id FROM items WHERE id = ${withdraw.item_id} FOR UPDATE`;
      const qty = withdraw.quantity;

      await tx.$executeRaw`
        UPDATE items SET stock = stock + ${qty}, updated_at = NOW()
        WHERE id = ${withdraw.item_id}
      `;

      const returnMovement = await tx.stockMovement.create({
        data: {
          itemId: withdraw.item_id,
          userId: actorId,
          type: "in",
          quantity: qty,
          toWhom: actorName.slice(0, 100),
          purpose: "return",
          note: `Pengembalian dari withdraw #${withdraw.id} oleh ${
            withdraw.user_name ?? withdraw.to_whom ?? "—"
          }`,
          movementDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.stockMovement.update({
        where: { id: withdraw.id },
        data: {
          returnedAt: new Date(),
          returnedBy: actorId,
          returnMovementId: returnMovement.id,
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
        throw new Error("Hanya withdraw kategori Senjata yang bisa ditandai.");
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

export async function buildMonitoringPayload(
  fromDate: Date,
  toDate: Date,
  member = "",
) {
  const memberTrim = member.trim();

  const movements = await prisma.stockMovement.findMany({
    where: {
      movementDate: { gte: fromDate, lte: toDate },
      ...(memberTrim
        ? {
            OR: [
              { toWhom: { contains: memberTrim, mode: "insensitive" } },
              { user: { name: { contains: memberTrim, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      item: { include: { category: true } },
      user: true,
      returnedByUser: true,
      unreturnableByUser: true,
    },
    orderBy: [{ movementDate: "desc" }, { id: "desc" }],
    take: 200,
  });

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
        pending_weapon: rows.filter(
          (r) =>
            isWeaponWithdraw(r.type, r.item?.category?.name) &&
            !r.returnedAt &&
            !r.unreturnableAt,
        ).length,
        last_at: format(first.movementDate, "HH:mm"),
      };
    })
    .sort((a, b) => b.last_at.localeCompare(a.last_at));

  const rows = movements.map((row) => {
    const weapon = isWeaponWithdraw(row.type, row.item?.category?.name);
    const needsReturn = weapon && !row.returnedAt && !row.unreturnableAt;
    let status = "selesai";
    if (row.type === "in") status = "masuk";
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
      item: row.item?.name ?? "Item dihapus",
      category: row.item?.category?.name ?? "—",
      quantity: row.quantity,
      note: row.note,
      time: format(row.movementDate, "d MMM yyyy HH:mm"),
      is_weapon: weapon,
      needs_return: needsReturn,
      returned_at: row.returnedAt ? format(row.returnedAt, "d MMM yyyy HH:mm") : null,
      returned_by: row.returnedByUser?.name ?? null,
      unreturnable_at: row.unreturnableAt
        ? format(row.unreturnableAt, "d MMM yyyy HH:mm")
        : null,
      unreturnable_reason: row.unreturnableReason,
      unreturnable_by: row.unreturnableByUser?.name ?? null,
      status,
    };
  });

  const pendingWeapon = rows.filter((r) => r.needs_return).length;
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
