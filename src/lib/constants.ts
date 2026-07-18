/** Spatie morph map — must match Laravel App\Models\User */
export const SPATIE_USER_MORPH = "App\\Models\\User";

/** Legacy exact name (Laravel). Prefer isWeaponCategoryName(). */
export const WEAPON_CATEGORY_NAME = "Senjata";

/** Case-insensitive: nama kategori mengandung "weapon" atau "senjata". */
export function isWeaponCategoryName(name?: string | null): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return n.includes("weapon") || n.includes("senjata");
}

export const STOCK_VERSION_KEY = `${
  process.env.CACHE_PREFIX ?? "black-lotus-court-cache-"
}inventory.stock_version`;
