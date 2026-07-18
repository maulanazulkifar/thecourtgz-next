import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStockVersion } from "@/lib/stock-version";
import { stockPayload } from "@/lib/inventory";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(`stock-poll:${session.user.id}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const version = await getStockVersion();
  const clientVersion = Number(req.nextUrl.searchParams.get("v") ?? -1);

  if (clientVersion === version && clientVersion >= 0) {
    return NextResponse.json(
      { unchanged: true, version },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const items = await stockPayload();
  return NextResponse.json(
    { unchanged: false, version, items },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
