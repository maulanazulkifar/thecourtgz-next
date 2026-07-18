"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRoles } from "@/lib/roles";
import { sanitizeText } from "@/lib/sanitize";

export type UserActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user?.id || !session.user.roles?.includes("superadmin")) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function createUserAction(formData: FormData): Promise<UserActionResult> {
  try {
    await requireSuperadmin();
    const name = sanitizeText(String(formData.get("name") ?? ""), 100);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "member");

    if (!name || !email || password.length < 6) {
      return { ok: false, error: "Nama, email, dan password (min 6) wajib." };
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return { ok: false, error: "Email sudah dipakai." };

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: await bcrypt.hash(password, 12),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await syncRoles(user.id, role);
    revalidatePath("/users");
    return { ok: true, message: "User created" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membuat user." };
  }
}

export async function updateUserAction(
  id: string,
  formData: FormData,
): Promise<UserActionResult> {
  try {
    await requireSuperadmin();
    const name = sanitizeText(String(formData.get("name") ?? ""), 100);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "member");

    if (!name || !email) return { ok: false, error: "Nama dan email wajib." };

    const userId = BigInt(id);
    const emailTaken = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
    });
    if (emailTaken) return { ok: false, error: "Email sudah dipakai." };

    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        ...(password ? { password: await bcrypt.hash(password, 12) } : {}),
        updatedAt: new Date(),
      },
    });
    await syncRoles(userId, role);
    revalidatePath("/users");
    revalidatePath(`/users/${id}/edit`);
    return { ok: true, message: "Updated" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal update user." };
  }
}

export async function deleteUserAction(id: string): Promise<UserActionResult> {
  try {
    const session = await requireSuperadmin();
    if (String(session.user.id) === id) {
      return { ok: false, error: "Tidak bisa menghapus akun sendiri." };
    }
    await prisma.user.delete({ where: { id: BigInt(id) } });
    revalidatePath("/users");
    return { ok: true, message: "Deleted" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal hapus user." };
  }
}
