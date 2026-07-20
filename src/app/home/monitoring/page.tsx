import { BlcShell } from "@/components/BlcShell";
import { MonitoringClient } from "@/components/MonitoringClient";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { canManageCatalog } from "@/lib/category-access";
import {
  buildMonitoringPayload,
  getMonitoringFilterOptions,
} from "@/lib/inventory";
import { getStockVersion } from "@/lib/stock-version";
import { endOfDay, parseISO, startOfDay } from "date-fns";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    member?: string;
    category?: string;
    all?: string;
  }>;
}) {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canManage = await canManageCatalog(session.user.email);
  const params = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const member = (params.member ?? "").trim();
  const category = (params.category ?? "").trim();

  const useAllDates = params.all === "1" || params.all === "true";

  let from = (params.from ?? "").trim();
  let to = (params.to ?? "").trim();
  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  if (useAllDates) {
    from = "";
    to = "";
  } else {
    // Default buka halaman / tanpa all=1: filter hari ini
    if (!from) from = today;
    if (!to) to = today;
    try {
      fromDate = startOfDay(parseISO(from));
      toDate = endOfDay(parseISO(to));
      from = fromDate.toISOString().slice(0, 10);
      to = toDate.toISOString().slice(0, 10);
    } catch {
      from = today;
      to = today;
      fromDate = startOfDay(new Date());
      toDate = endOfDay(new Date());
    }

    if (fromDate > toDate) {
      const tmp = fromDate;
      fromDate = startOfDay(toDate);
      toDate = endOfDay(tmp);
      from = fromDate.toISOString().slice(0, 10);
      to = toDate.toISOString().slice(0, 10);
    }
  }

  const [payload, filterOptions, stockVersion] = await Promise.all([
    buildMonitoringPayload(fromDate, toDate, {
      memberId: member,
      categoryId: category,
    }),
    getMonitoringFilterOptions(),
    getStockVersion(),
  ]);

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canManage} wide scroll>
      <MonitoringClient
        viewerId={session.user.id}
        viewerEmail={session.user.email}
        canManage={canManage}
        initialFrom={from}
        initialTo={to}
        initialAllDates={useAllDates}
        initialMember={member}
        initialCategory={category}
        members={filterOptions.members}
        categories={filterOptions.categories}
        initialNotices={payload.notices}
        initialRows={payload.rows}
        initialPending={payload.pendingWeapon}
        initialVersion={stockVersion}
      />
    </BlcShell>
  );
}
