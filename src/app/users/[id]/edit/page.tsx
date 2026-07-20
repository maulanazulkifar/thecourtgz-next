import { BlcShell } from "@/components/BlcShell";
import { UserForm } from "@/components/UserForm";
import { updateUserAction } from "@/app/actions/users";
import { requireSuperadmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SPATIE_USER_MORPH } from "@/lib/constants";
import { notFound } from "next/navigation";
import { canManageCatalog } from "@/lib/category-access";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSuperadmin();
  const canManage = await canManageCatalog(session.user.email);
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id: BigInt(id) } });
  if (!user) notFound();

  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  const currentRole = await prisma.modelHasRole.findFirst({
    where: { modelId: user.id, modelType: SPATIE_USER_MORPH },
    include: { role: true },
  });

  const bound = updateUserAction.bind(null, id);

  return (
    <BlcShell showNav isStaff canManageCatalog={canManage} wide scroll>
      <div className="blc-page-head">
        <h1>Edit User</h1>
        <p>{user.email}</p>
      </div>
      <div className="blc-panel">
        <UserForm
          action={bound}
          roles={roles.map((r) => ({ id: Number(r.id), name: r.name }))}
          initial={{
            name: user.name,
            email: user.email,
            role: currentRole?.role.name ?? "member",
          }}
          submitLabel="Update"
        />
      </div>
    </BlcShell>
  );
}
