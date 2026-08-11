"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  clearSelectedServerCookie,
  getServerById,
  setSelectedServerCookie,
} from "@/lib/servers";

export async function selectServerAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const raw = String(formData.get("server_id") ?? "").trim();
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    redirect("/home");
  }

  const server = await getServerById(id);
  if (!server) redirect("/home");

  await setSelectedServerCookie(server.id);
  redirect("/home");
}

export async function clearServerAction() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  await clearSelectedServerCookie();
  redirect("/home");
}
