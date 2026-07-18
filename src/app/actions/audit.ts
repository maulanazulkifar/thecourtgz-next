"use server";

import { requireSession } from "@/lib/session";
import { getItemAuditTrail } from "@/lib/inventory";

export async function loadItemAuditAction(itemId: number) {
  await requireSession();
  if (!Number.isInteger(itemId) || itemId < 1) return null;
  return getItemAuditTrail(itemId);
}
