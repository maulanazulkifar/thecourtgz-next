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
  const all = (req.nextUrl.searchParams.get("all") ?? "").trim();
  const fromRaw = (req.nextUrl.searchParams.get("from") ?? "").trim();
  const toRaw = (req.nextUrl.searchParams.get("to") ?? "").trim();
  const member = (req.nextUrl.searchParams.get("member") ?? "").trim();
  const category = (req.nextUrl.searchParams.get("category") ?? "").trim();

  const useAllDates = all === "1" || all === "true";
  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  if (!useAllDates) {
    const today = new Date().toISOString().slice(0, 10);
    const from = fromRaw || today;
    const to = toRaw || today;
    try {
      fromDate = startOfDay(parseISO(from));
      toDate = endOfDay(parseISO(to));
    } catch {
      fromDate = startOfDay(new Date());
      toDate = endOfDay(new Date());
    }
    if (fromDate > toDate) {
      const tmp = fromDate;
      fromDate = startOfDay(toDate);
      toDate = endOfDay(tmp);
    }
  }

  if (clientVersion === version && clientVersion >= 0) {
    return NextResponse.json(
      { unchanged: true, version },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const payload = await buildMonitoringPayload(fromDate, toDate, {
    memberId: member,
    categoryId: category,
  });
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
