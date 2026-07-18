import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStockVersion } from "@/lib/stock-version";
import { buildMonitoringPayload } from "@/lib/inventory";
import { rateLimit } from "@/lib/rate-limit";
import { endOfDay, parseISO, startOfDay } from "date-fns";

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
  const from = req.nextUrl.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = req.nextUrl.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const member = (req.nextUrl.searchParams.get("member") ?? "").trim();

  let fromDate = startOfDay(new Date());
  let toDate = endOfDay(new Date());
  try {
    fromDate = startOfDay(parseISO(from));
    toDate = endOfDay(parseISO(to));
  } catch {
    /* keep defaults */
  }
  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = startOfDay(toDate);
    toDate = endOfDay(tmp);
  }

  if (clientVersion === version && clientVersion >= 0) {
    return NextResponse.json(
      { unchanged: true, version },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const payload = await buildMonitoringPayload(fromDate, toDate, member);
  return NextResponse.json(
    {
      unchanged: false,
      version,
      notices: payload.notices,
      rows: payload.rows,
      pending_weapon: payload.pendingWeapon,
    },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
