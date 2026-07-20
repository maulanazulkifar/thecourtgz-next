import { BlcShell } from "@/components/BlcShell";
import { UserForm } from "@/components/UserForm";
import { createUserAction } from "@/app/actions/users";
import { requireSuperadmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/category-access";

export default async function CreateUserPage() {
  const session = await requireSuperadmin();
  const canManage = await canManageCatalog(session.user.email);
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });

  return (
    <BlcShell showNav isStaff canManageCatalog={canManage} wide scroll>
      <div className="blc-page-head">
        <h1>Create User</h1>
        <p>Tambah akun baru.</p>
      </div>
      <div className="blc-panel">
        <UserForm
          action={createUserAction}
          roles={roles.map((r) => ({ id: Number(r.id), name: r.name }))}
          submitLabel="Create"
        />
      </div>
    </BlcShell>
  );
}
