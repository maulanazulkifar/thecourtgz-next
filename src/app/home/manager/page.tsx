import { BlcShell } from "@/components/BlcShell";
import { ManagerClient } from "@/components/ManagerClient";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import {
  canManageCatalog,
  listManagers,
  OWNER_MANAGER_EMAIL,
  LOCKED_MANAGER_EMAILS,
} from "@/lib/category-access";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function ManagerPage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canManage = await canManageCatalog(session.user.email);
  if (!canManage) redirect("/home");

  const managers = await listManagers(session.user.email);
  const managerEmails = new Set(managers.map((m) => m.email.toLowerCase()));

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      discordId: true,
      discordUsername: true,
    },
    take: 500,
  });

  const candidateUsers = users
    .filter((u) => !managerEmails.has(u.email.toLowerCase()))
    .filter((u) => {
      const e = u.email.toLowerCase();
      // Jangan tampilkan owner/locked yang sudah aktif di list manager
      if (e === OWNER_MANAGER_EMAIL) return false;
      if (LOCKED_MANAGER_EMAILS.has(e) && managerEmails.has(e)) return false;
      return true;
    })
    .map((u) => ({
      id: String(u.id),
      name: u.name,
      email: u.email,
      discordId: u.discordId,
      discordUsername: u.discordUsername,
    }));

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canManage} wide scroll>
      <div className="blc-page-head">
        <h1>Kelola Manager</h1>
        <p>
          Tambah manager dari daftar user, atau ketik Discord ID manual. Menu ini
          hanya untuk manager.
        </p>
      </div>
      <ManagerClient
        initialManagers={managers}
        candidateUsers={candidateUsers}
        actorEmail={session.user.email ?? ""}
      />
    </BlcShell>
  );
}
