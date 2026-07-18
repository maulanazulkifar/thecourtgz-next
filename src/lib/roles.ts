import { prisma } from "@/lib/prisma";
import { SPATIE_USER_MORPH } from "@/lib/constants";

export async function getUserRoles(userId: bigint | number | string): Promise<string[]> {
  const id = BigInt(userId);
  const rows = await prisma.modelHasRole.findMany({
    where: { modelId: id, modelType: SPATIE_USER_MORPH },
    include: { role: true },
  });
  return rows.map((r) => r.role.name);
}

export async function getUserPermissions(userId: bigint | number | string): Promise<string[]> {
  const id = BigInt(userId);
  const roles = await prisma.modelHasRole.findMany({
    where: { modelId: id, modelType: SPATIE_USER_MORPH },
    include: {
      role: {
        include: {
          roleHasPermissions: { include: { permission: true } },
        },
      },
    },
  });

  const direct = await prisma.modelHasPermission.findMany({
    where: { modelId: id, modelType: SPATIE_USER_MORPH },
    include: { permission: true },
  });

  const set = new Set<string>();
  for (const r of roles) {
    for (const rp of r.role.roleHasPermissions) {
      set.add(rp.permission.name);
    }
  }
  for (const d of direct) {
    set.add(d.permission.name);
  }
  return [...set];
}

export async function assignRole(userId: bigint, roleName: string, guard = "web") {
  let role = await prisma.role.findFirst({
    where: { name: roleName, guardName: guard },
  });
  if (!role) {
    role = await prisma.role.create({
      data: { name: roleName, guardName: guard, createdAt: new Date(), updatedAt: new Date() },
    });
  }

  await prisma.modelHasRole.upsert({
    where: {
      roleId_modelId_modelType: {
        roleId: role.id,
        modelId: userId,
        modelType: SPATIE_USER_MORPH,
      },
    },
    create: {
      roleId: role.id,
      modelId: userId,
      modelType: SPATIE_USER_MORPH,
    },
    update: {},
  });
}

export async function syncRoles(userId: bigint, roleName: string, guard = "web") {
  await prisma.modelHasRole.deleteMany({
    where: { modelId: userId, modelType: SPATIE_USER_MORPH },
  });
  await assignRole(userId, roleName, guard);
}

export function hasAnyRole(roles: string[], needed: string[]): boolean {
  return needed.some((r) => roles.includes(r));
}

export function isStaff(roles: string[]): boolean {
  return hasAnyRole(roles, ["superadmin", "admin"]);
}
