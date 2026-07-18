"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { canManageCatalog } from "@/lib/category-access";
import { reconcileStockLedger } from "@/lib/inventory";

export async function reconcileStockAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Unauthorized" };
  }
  if (!canManageCatalog(session.user.email)) {
    return { ok: false as const, error: "Hanya manager yang bisa menyeimbangkan stok." };
  }

  try {
    const fixed = await reconcileStockLedger();
    revalidatePath("/home/rekap");
    revalidatePath("/home");
    return {
      ok: true as const,
      message:
        fixed > 0
          ? `Stok diseimbangkan ke riwayat transaksi (${fixed} item diperbarui). Duplikat penyesuaian dihapus.`
          : "Tidak ada selisih yang perlu diperbaiki.",
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Gagal menyeimbangkan stok.",
    };
  }
}
