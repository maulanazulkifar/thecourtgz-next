import { prisma } from "@/lib/prisma";
import { STOCK_VERSION_KEY } from "@/lib/constants";

/** Parse Laravel PHP-serialized int (`i:12;`) or plain number. */
function parseCacheInt(value: string | null | undefined): number {
  if (!value) return 0;
  const phpInt = value.match(/^i:(-?\d+);$/);
  if (phpInt) return Number(phpInt[1]);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function serializePhpInt(n: number): string {
  return `i:${n};`;
}

export function stockVersionKey(serverId: number | bigint) {
  return `${STOCK_VERSION_KEY}.s.${serverId}`;
}

export async function getStockVersion(serverId: number | bigint): Promise<number> {
  const row = await prisma.cacheEntry.findUnique({
    where: { key: stockVersionKey(serverId) },
  });
  return parseCacheInt(row?.value);
}

export async function bumpStockVersion(serverId: number | bigint): Promise<number> {
  const current = await getStockVersion(serverId);
  const next = current + 1;
  const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10;
  const key = stockVersionKey(serverId);

  await prisma.cacheEntry.upsert({
    where: { key },
    create: {
      key,
      value: serializePhpInt(next),
      expiration,
    },
    update: {
      value: serializePhpInt(next),
      expiration,
    },
  });

  return next;
}
