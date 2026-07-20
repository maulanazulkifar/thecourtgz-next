import { prisma } from "@/lib/prisma";

/** Email Discord Auth.js: `{discordId}@discord.local` */
export function normalizeManagerEmail(email?: string | null): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

export function discordIdToManagerEmail(discordId: string): string {
  return `${discordId.trim()}@discord.local`.toLowerCase();
}

/** Owner: selalu manager, tidak bisa dihapus; bisa cabut 2 manager inti. */
export const OWNER_MANAGER_EMAIL = "412066741305344024@discord.local";

/** Manager inti: selalu manager kecuali dicabut owner. */
export const LOCKED_MANAGER_EMAILS = new Set([
  "421642841580896256@discord.local",
  "374590348154109953@discord.local",
]);

let tableReady = false;
let cacheExtras = new Set<string>();
let cacheRevoked = new Set<string>();
let cacheAt = 0;
const CACHE_TTL_MS = 8_000;

export async function ensureCatalogManagersTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS catalog_managers (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      discord_id VARCHAR(64),
      name VARCHAR(255),
      added_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS catalog_manager_revocations (
      email VARCHAR(255) PRIMARY KEY,
      revoked_by VARCHAR(255),
      revoked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tableReady = true;
}

async function refreshCache(force = false) {
  if (!force && Date.now() - cacheAt < CACHE_TTL_MS && cacheAt > 0) return;
  await ensureCatalogManagersTable();
  const [extras, revoked] = await Promise.all([
    prisma.$queryRaw<{ email: string }[]>`
      SELECT LOWER(email) AS email FROM catalog_managers
    `,
    prisma.$queryRaw<{ email: string }[]>`
      SELECT LOWER(email) AS email FROM catalog_manager_revocations
    `,
  ]);
  cacheExtras = new Set(extras.map((r) => r.email));
  cacheRevoked = new Set(revoked.map((r) => r.email));
  cacheAt = Date.now();
}

export function invalidateManagerCache() {
  cacheAt = 0;
}

/** Apakah email ini manager. */
export async function canManageCatalog(email?: string | null): Promise<boolean> {
  const e = normalizeManagerEmail(email);
  if (!e) return false;
  if (e === OWNER_MANAGER_EMAIL) return true;
  await refreshCache();
  if (LOCKED_MANAGER_EMAILS.has(e)) {
    return !cacheRevoked.has(e);
  }
  return cacheExtras.has(e);
}

export function isOwnerManager(email?: string | null): boolean {
  return normalizeManagerEmail(email) === OWNER_MANAGER_EMAIL;
}

export function isLockedManager(email?: string | null): boolean {
  const e = normalizeManagerEmail(email);
  return !!e && LOCKED_MANAGER_EMAILS.has(e);
}

/**
 * Siapa boleh mencabut akses manager target.
 * - Owner: tidak bisa dihapus
 * - Locked: hanya owner
 * - Manager tambahan: semua manager
 */
export function canRemoveManager(
  actorEmail?: string | null,
  targetEmail?: string | null,
): boolean {
  const actor = normalizeManagerEmail(actorEmail);
  const target = normalizeManagerEmail(targetEmail);
  if (!actor || !target) return false;
  if (actor === target) return false;
  if (target === OWNER_MANAGER_EMAIL) return false;
  if (LOCKED_MANAGER_EMAILS.has(target)) {
    return actor === OWNER_MANAGER_EMAIL;
  }
  return true;
}

export type ManagerListItem = {
  email: string;
  discordId: string | null;
  name: string | null;
  source: "owner" | "locked" | "added";
  roleLabel: string;
  canRemove: boolean;
  addedBy: string | null;
};

export async function listManagers(actorEmail?: string | null): Promise<ManagerListItem[]> {
  await refreshCache(true);

  const extras = await prisma.$queryRaw<
    {
      email: string;
      discord_id: string | null;
      name: string | null;
      added_by: string | null;
    }[]
  >`
    SELECT LOWER(email) AS email, discord_id, name, added_by
    FROM catalog_managers
    ORDER BY created_at ASC
  `;

  const items: ManagerListItem[] = [
    {
      email: OWNER_MANAGER_EMAIL,
      discordId: OWNER_MANAGER_EMAIL.replace(/@discord\.local$/, ""),
      name: null,
      source: "owner",
      roleLabel: "Owner — tidak bisa dihapus",
      canRemove: false,
      addedBy: null,
    },
  ];

  for (const email of LOCKED_MANAGER_EMAILS) {
    if (cacheRevoked.has(email)) continue;
    items.push({
      email,
      discordId: email.replace(/@discord\.local$/, ""),
      name: null,
      source: "locked",
      roleLabel: "Manager inti — hanya owner yang bisa cabut",
      canRemove: canRemoveManager(actorEmail, email),
      addedBy: null,
    });
  }

  for (const row of extras) {
    if (row.email === OWNER_MANAGER_EMAIL) continue;
    if (LOCKED_MANAGER_EMAILS.has(row.email)) continue;
    items.push({
      email: row.email,
      discordId: row.discord_id,
      name: row.name,
      source: "added",
      roleLabel: "Manager",
      canRemove: canRemoveManager(actorEmail, row.email),
      addedBy: row.added_by,
    });
  }

  const emails = items.map((i) => i.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { email: true, name: true, discordId: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  for (const item of items) {
    const u = byEmail.get(item.email);
    if (u) {
      item.name = u.name;
      item.discordId = u.discordId ?? item.discordId;
    }
  }

  return items;
}

export async function addManager(input: {
  discordIdOrEmail: string;
  actorEmail: string;
}) {
  if (!(await canManageCatalog(input.actorEmail))) {
    throw new Error("Hanya manager yang bisa menambah manager.");
  }

  await ensureCatalogManagersTable();
  const raw = input.discordIdOrEmail.trim();
  if (!raw) throw new Error("Isi Discord ID atau email manager.");

  let email: string;
  let discordId: string | null = null;
  if (raw.includes("@")) {
    email = normalizeManagerEmail(raw)!;
    if (email.endsWith("@discord.local")) {
      discordId = email.replace(/@discord\.local$/, "");
    }
  } else if (/^\d{5,30}$/.test(raw)) {
    discordId = raw;
    email = discordIdToManagerEmail(raw);
  } else {
    throw new Error(
      "Format tidak valid. Pakai Discord ID (angka) atau email @discord.local.",
    );
  }

  if (email === OWNER_MANAGER_EMAIL) {
    throw new Error("Akun ini sudah owner.");
  }

  await refreshCache(true);

  // Restore locked yang sempat dicabut owner
  if (LOCKED_MANAGER_EMAILS.has(email)) {
    if (!cacheRevoked.has(email)) {
      throw new Error("Akun ini sudah menjadi manager inti.");
    }
    if (!isOwnerManager(input.actorEmail)) {
      throw new Error("Hanya owner yang bisa mengembalikan manager inti.");
    }
    await prisma.$executeRaw`
      DELETE FROM catalog_manager_revocations WHERE LOWER(email) = ${email}
    `;
    invalidateManagerCache();
    return { email, name: null };
  }

  if (cacheExtras.has(email)) {
    throw new Error("Akun ini sudah menjadi manager.");
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        ...(discordId ? [{ discordId }] : []),
      ],
    },
    select: { name: true, discordId: true },
  });

  await prisma.$executeRaw`
    INSERT INTO catalog_managers (email, discord_id, name, added_by, created_at, updated_at)
    VALUES (
      ${email},
      ${user?.discordId ?? discordId},
      ${user?.name ?? null},
      ${normalizeManagerEmail(input.actorEmail)},
      NOW(),
      NOW()
    )
  `;

  invalidateManagerCache();
  return { email, name: user?.name ?? null };
}

export async function removeManager(input: {
  targetEmail: string;
  actorEmail: string;
}) {
  const target = normalizeManagerEmail(input.targetEmail);
  const actor = normalizeManagerEmail(input.actorEmail);
  if (!target || !actor) throw new Error("Data tidak valid.");

  if (!(await canManageCatalog(actor))) {
    throw new Error("Hanya manager yang bisa mencabut akses.");
  }
  if (!canRemoveManager(actor, target)) {
    if (target === OWNER_MANAGER_EMAIL) {
      throw new Error("Akun owner tidak bisa dihapus.");
    }
    if (LOCKED_MANAGER_EMAILS.has(target)) {
      throw new Error("Manager inti ini hanya bisa dicabut oleh owner.");
    }
    throw new Error("Tidak diizinkan mencabut manager ini.");
  }

  await ensureCatalogManagersTable();

  if (LOCKED_MANAGER_EMAILS.has(target)) {
    await prisma.$executeRaw`
      INSERT INTO catalog_manager_revocations (email, revoked_by, revoked_at)
      VALUES (${target}, ${actor}, NOW())
      ON CONFLICT (email) DO UPDATE
      SET revoked_by = ${actor}, revoked_at = NOW()
    `;
  } else {
    const deleted = await prisma.$executeRaw`
      DELETE FROM catalog_managers WHERE LOWER(email) = ${target}
    `;
    if (Number(deleted) < 1) {
      throw new Error("Manager tidak ditemukan.");
    }
  }

  invalidateManagerCache();
  return { email: target };
}

/**
 * Tombol pengembalian senjata:
 * manager atau user yang menginput transaksi.
 */
export function canActOnWeaponReturn(
  email: string | null | undefined,
  actorUserId: string | number | bigint,
  movementUserId: string | number | bigint,
  isManager?: boolean,
): boolean {
  if (isManager) return true;
  if (normalizeManagerEmail(email) === OWNER_MANAGER_EMAIL) return true;
  return String(actorUserId) === String(movementUserId);
}

/** @deprecated gunakan canManageCatalog */
export const canManageCategories = canManageCatalog;
