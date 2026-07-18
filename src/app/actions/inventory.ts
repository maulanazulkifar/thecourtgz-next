"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createMovement,
  markReturned,
  markUnreturnable,
} from "@/lib/inventory";
import { sanitizeText } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";
import { bumpStockVersion } from "@/lib/stock-version";

function randomSkuSuffix() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export type ActionResult =
  | { ok: true; message?: string; successTx?: Record<string, unknown> }
  | { ok: false; error: string };

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function storeMovementAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const limited = rateLimit(`movements:${session.user.id}`, 20, 60_000);
    if (!limited.ok) return { ok: false, error: "Terlalu banyak permintaan. Coba lagi sebentar." };

    const categoryId = Number(formData.get("category_id"));
    const itemId = Number(formData.get("item_id"));
    const type = String(formData.get("type"));
    const quantity = Number(formData.get("quantity"));
    const note = formData.get("note") ? String(formData.get("note")) : null;

    if (!["in", "out"].includes(type)) {
      return { ok: false, error: "Tipe transaksi tidak valid." };
    }

    const successTx = await createMovement({
      categoryId,
      itemId,
      type: type as "in" | "out",
      quantity,
      note,
      userId: BigInt(session.user.id),
      userName: session.user.name ?? "Member",
    });

    revalidatePath("/home");
    revalidatePath("/home/rekap");
    revalidatePath("/home/monitoring");
    return { ok: true, successTx };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menyimpan." };
  }
}

export async function storeCategoryAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const limited = rateLimit(`movements:${session.user.id}`, 20, 60_000);
    if (!limited.ok) return { ok: false, error: "Terlalu banyak permintaan." };

    const name = sanitizeText(String(formData.get("name") ?? ""), 100);
    const description = sanitizeText(
      formData.get("description") ? String(formData.get("description")) : null,
      500,
    );

    if (!name) return { ok: false, error: "Nama kategori wajib diisi." };

    const exists = await prisma.category.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (exists) return { ok: false, error: "Nama kategori sudah dipakai." };

    await prisma.category.create({
      data: {
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await bumpStockVersion();
    revalidatePath("/home");
    revalidatePath("/home/kategori");
    return { ok: true, message: "Kategori berhasil ditambahkan." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menyimpan kategori." };
  }
}

export async function storeItemAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const limited = rateLimit(`movements:${session.user.id}`, 20, 60_000);
    if (!limited.ok) return { ok: false, error: "Terlalu banyak permintaan." };

    const categoryId = Number(formData.get("category_id"));
    const name = sanitizeText(String(formData.get("name") ?? ""), 150);
    let sku = sanitizeText(formData.get("sku") ? String(formData.get("sku")) : null, 50);
    const stockRaw = formData.get("stock");
    const stock = stockRaw ? Number(stockRaw) : 0;
    const description = sanitizeText(
      formData.get("description") ? String(formData.get("description")) : null,
      500,
    );

    if (!name) return { ok: false, error: "Nama item wajib diisi." };
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return { ok: false, error: "Kategori wajib dipilih." };
    }
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
      return { ok: false, error: "Stok tidak valid." };
    }

    const category = await prisma.category.findUnique({ where: { id: BigInt(categoryId) } });
    if (!category) return { ok: false, error: "Kategori tidak ditemukan." };

    if (!sku) {
      sku = `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toUpperCase()}-${randomSkuSuffix()}`;
    } else {
      sku = sku.toUpperCase();
      const skuExists = await prisma.item.findUnique({ where: { sku } });
      if (skuExists) return { ok: false, error: "SKU sudah dipakai." };
    }

    await prisma.item.create({
      data: {
        categoryId: BigInt(categoryId),
        name,
        sku,
        stock,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await bumpStockVersion();
    revalidatePath("/home");
    revalidatePath("/home/item");
    return { ok: true, message: "Item berhasil ditambahkan." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menyimpan item." };
  }
}

export async function markReturnedAction(movementId: number): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const limited = rateLimit(`movements:${session.user.id}`, 20, 60_000);
    if (!limited.ok) return { ok: false, error: "Terlalu banyak permintaan." };

    await markReturned(
      movementId,
      BigInt(session.user.id),
      session.user.name ?? "Member",
    );
    revalidatePath("/home/monitoring");
    return {
      ok: true,
      message: "Senjata sudah ditandai dikembalikan ke gudang. Stok bertambah otomatis.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menandai pengembalian." };
  }
}

export async function markUnreturnableAction(
  movementId: number,
  reason: string,
): Promise<ActionResult> {
  try {
    const session = await requireUser();
    const limited = rateLimit(`movements:${session.user.id}`, 20, 60_000);
    if (!limited.ok) return { ok: false, error: "Terlalu banyak permintaan." };

    await markUnreturnable(movementId, BigInt(session.user.id), reason);
    revalidatePath("/home/monitoring");
    return {
      ok: true,
      message: "Senjata ditandai tidak bisa dikembalikan. Tombol pengembalian sudah ditutup.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menandai." };
  }
}
