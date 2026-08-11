import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const SERVER_COOKIE = "blc_server_id";

export const SERVER_SEEDS = [
  { name: "Satu Mimpi Roleplay", slug: "satu-mimpi-roleplay" },
  { name: "Cerita Roleplayku", slug: "cerita-roleplayku" },
] as const;

export type AppServer = {
  id: number;
  name: string;
  slug: string;
};

let schemaReady = false;

/** Pastikan tabel servers + kolom server_id ada (idempotent). */
export async function ensureServersSchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS servers (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const seed of SERVER_SEEDS) {
    await prisma.$executeRaw`
      INSERT INTO servers (name, slug, is_active, created_at, updated_at)
      VALUES (${seed.name}, ${seed.slug}, TRUE, NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING
    `;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS server_id BIGINT
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS server_id BIGINT
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS server_id BIGINT
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE categories
    SET server_id = (SELECT id FROM servers WHERE slug = 'cerita-roleplayku' LIMIT 1)
    WHERE server_id IS NULL
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE items
    SET server_id = (SELECT id FROM servers WHERE slug = 'cerita-roleplayku' LIMIT 1)
    WHERE server_id IS NULL
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE stock_movements
    SET server_id = (SELECT id FROM servers WHERE slug = 'cerita-roleplayku' LIMIT 1)
    WHERE server_id IS NULL
  `);

  // NOT NULL hanya jika semua baris sudah terisi
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM categories WHERE server_id IS NULL) THEN
        NULL;
      END IF;
      BEGIN
        ALTER TABLE categories ALTER COLUMN server_id SET NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;
      BEGIN
        ALTER TABLE items ALTER COLUMN server_id SET NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;
      BEGIN
        ALTER TABLE stock_movements ALTER COLUMN server_id SET NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS categories_server_id_idx ON categories (server_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS items_server_id_idx ON items (server_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS stock_movements_server_id_idx ON stock_movements (server_id)
  `);

  schemaReady = true;
}

export async function listServers(): Promise<AppServer[]> {
  await ensureServersSchema();
  const rows = await prisma.server.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    slug: r.slug,
  }));
}

export async function getServerById(
  id: number | bigint,
): Promise<AppServer | null> {
  await ensureServersSchema();
  const row = await prisma.server.findFirst({
    where: { id: BigInt(id), isActive: true },
    select: { id: true, name: true, slug: true },
  });
  if (!row) return null;
  return { id: Number(row.id), name: row.name, slug: row.slug };
}

/** Baca server aktif dari cookie session browser. */
export async function getSelectedServer(): Promise<AppServer | null> {
  await ensureServersSchema();
  const jar = await cookies();
  const raw = jar.get(SERVER_COOKIE)?.value?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return getServerById(Number(raw));
}

/** Wajib punya server terpilih; kalau belum → redirect ke /home (pilih server). */
export async function requireSelectedServer(
  redirectTo = "/home",
): Promise<AppServer> {
  const server = await getSelectedServer();
  if (!server) redirect(redirectTo);
  return server;
}

export async function setSelectedServerCookie(serverId: number) {
  const jar = await cookies();
  jar.set(SERVER_COOKIE, String(serverId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function clearSelectedServerCookie() {
  const jar = await cookies();
  jar.delete(SERVER_COOKIE);
}
