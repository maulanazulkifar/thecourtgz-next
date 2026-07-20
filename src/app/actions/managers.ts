"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  addManager,
  canManageCatalog,
  listManagers,
  removeManager,
} from "@/lib/category-access";

export type ManagerActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function requireManagerSession() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new Error("Unauthorized");
  }
  if (!(await canManageCatalog(session.user.email))) {
    throw new Error("Hanya manager yang bisa mengakses.");
  }
  return session;
}

export async function listManagersAction() {
  const session = await requireManagerSession();
  return listManagers(session.user.email);
}

export async function addManagerAction(
  discordIdOrEmail: string,
): Promise<ManagerActionResult> {
  try {
    const session = await requireManagerSession();
    const result = await addManager({
      discordIdOrEmail,
      actorEmail: session.user.email!,
    });
    revalidatePath("/home/manager");
    return {
      ok: true,
      message: result.name
        ? `${result.name} ditambahkan sebagai manager.`
        : `${result.email} ditambahkan sebagai manager.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal menambah manager.",
    };
  }
}

export async function removeManagerAction(
  targetEmail: string,
): Promise<ManagerActionResult> {
  try {
    const session = await requireManagerSession();
    const result = await removeManager({
      targetEmail,
      actorEmail: session.user.email!,
    });
    revalidatePath("/home/manager");
    return {
      ok: true,
      message: `Akses manager ${result.email} sudah dicabut.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal mencabut manager.",
    };
  }
}
