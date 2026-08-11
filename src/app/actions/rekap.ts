"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { canManageCatalog } from "@/lib/category-access";
import { reconcileStockLedger } from "@/lib/inventory";
import { getSelectedServer } from "@/lib/servers";

export async function reconcileStockAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Unauthorized" };
  }
  if (!(await canManageCatalog(session.user.email))) {
    return { ok: false as const, error: "Hanya manager yang bisa menyeimbangkan stok." };
  }

  try {
    const server = await getSelectedServer();
    if (!server) {
      return { ok: false as const, error: "Pilih server dulu di halaman Transaksi." };
    }
    const fixed = await reconcileStockLedger(server.id);
    revalidatePath("/home/rekap");
    revalidatePath("/home");
    return {
      ok: true as const,
      message:
        fixed > 0
          ? `Stok diseimbangkan ke riwayat transaksi (${fixed} item diperbarui) di ${server.name}.`
          : "Tidak ada selisih yang perlu diperbaiki.",
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Gagal menyeimbangkan stok.",
    };
  }
}
