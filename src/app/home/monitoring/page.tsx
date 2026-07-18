import { BlcShell } from "@/components/BlcShell";
import { MonitoringClient } from "@/components/MonitoringClient";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { buildMonitoringPayload } from "@/lib/inventory";
import { getStockVersion } from "@/lib/stock-version";
import { endOfDay, parseISO, startOfDay } from "date-fns";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; member?: string }>;
}) {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const params = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  let from = params.from ?? today;
  let to = params.to ?? today;
  const member = (params.member ?? "").trim();

  let fromDate = startOfDay(new Date());
  let toDate = endOfDay(new Date());
  try {
    fromDate = startOfDay(parseISO(from));
    toDate = endOfDay(parseISO(to));
    from = fromDate.toISOString().slice(0, 10);
    to = toDate.toISOString().slice(0, 10);
  } catch {
    from = today;
    to = today;
  }

  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = startOfDay(toDate);
    toDate = endOfDay(tmp);
    from = fromDate.toISOString().slice(0, 10);
    to = toDate.toISOString().slice(0, 10);
  }

  const payload = await buildMonitoringPayload(fromDate, toDate, member);
  const stockVersion = await getStockVersion();

  return (
    <BlcShell showNav isStaff={staff} wide scroll>
      <MonitoringClient
        initialFrom={from}
        initialTo={to}
        initialMember={member}
        initialNotices={payload.notices}
        initialRows={payload.rows}
        initialPending={payload.pendingWeapon}
        initialVersion={stockVersion}
      />
    </BlcShell>
  );
}
