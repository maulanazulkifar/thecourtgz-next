import Link from "next/link";
import { BlcShell } from "@/components/BlcShell";
import { requireSuperadmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SPATIE_USER_MORPH } from "@/lib/constants";
import { DeleteUserButton } from "@/components/DeleteUserButton";
import { canManageCatalog } from "@/lib/category-access";

export default async function UsersPage() {
  const session = await requireSuperadmin();
  const canManage = await canManageCatalog(session.user.email);

  const users = await prisma.user.findMany({
    orderBy: { id: "desc" },
  });

  const roleRows = await prisma.modelHasRole.findMany({
    where: {
      modelType: SPATIE_USER_MORPH,
      modelId: { in: users.map((u) => u.id) },
    },
    include: { role: true },
  });

  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const key = String(row.modelId);
    const list = rolesByUser.get(key) ?? [];
    list.push(row.role.name);
    rolesByUser.set(key, list);
  }

  return (
    <BlcShell showNav isStaff canManageCatalog={canManage} wide scroll>
      <div className="blc-page-head">
        <h1>Users</h1>
        <p>Kelola akun admin / member.</p>
      </div>

      <div style={{ marginBottom: "0.9rem" }}>
        <Link href="/users/create" className="blc-btn" style={{ width: "auto" }}>
          + Create User
        </Link>
      </div>

      <div className="blc-panel">
        {users.length === 0 ? (
          <div className="blc-empty">Belum ada user.</div>
        ) : (
          <div className="blc-list">
            {users.map((user) => (
              <article key={String(user.id)} className="blc-list-item">
                <div>
                  <h3>{user.name}</h3>
                  <p>
                    {user.email} · {(rolesByUser.get(String(user.id)) ?? ["—"]).join(", ")}
                  </p>
                </div>
                <div className="blc-actions">
                  <Link
                    href={`/users/${user.id}/edit`}
                    className="blc-btn secondary"
                    style={{ width: "auto", padding: "0.4rem 0.65rem", fontSize: "0.68rem" }}
                  >
                    Edit
                  </Link>
                  <DeleteUserButton id={String(user.id)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </BlcShell>
  );
}
