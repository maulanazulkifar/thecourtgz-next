/** Email Discord Auth.js: `{discordId}@discord.local` — tidak berubah saat login ulang. */
const CATALOG_MANAGER_EMAILS = new Set([
  "421642841580896256@discord.local",
  "412066741305344024@discord.local",
  "374590348154109953@discord.local"
]);

/** Boleh edit/hapus kategori & item. */
export function canManageCatalog(email?: string | null): boolean {
  if (!email) return false;
  return CATALOG_MANAGER_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Tombol pengembalian senjata/weapon:
 * manager (2 email) atau user yang menginput transaksi.
 */
export function canActOnWeaponReturn(
  email: string | null | undefined,
  actorUserId: string | number | bigint,
  movementUserId: string | number | bigint,
): boolean {
  if (canManageCatalog(email)) return true;
  return String(actorUserId) === String(movementUserId);
}

/** @deprecated gunakan canManageCatalog */
export const canManageCategories = canManageCatalog;
