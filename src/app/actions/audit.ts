"use server";

import { requireSession } from "@/lib/session";
import { getSelectedServer } from "@/lib/servers";
import { getItemAuditTrail } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export async function loadItemAuditAction(itemId: number) {
  await requireSession();
  const server = await getSelectedServer();
  if (!server) return null;
  if (!Number.isInteger(itemId) || itemId < 1) return null;

  const item = await prisma.item.findFirst({
    where: { id: BigInt(itemId), serverId: BigInt(server.id) },
    select: { id: true },
  });
  if (!item) return null;

  return getItemAuditTrail(itemId);
}
