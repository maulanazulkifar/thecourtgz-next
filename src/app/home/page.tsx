import { BlcShell } from "@/components/BlcShell";
import { PortalForm } from "@/components/PortalForm";
import { ServerPicker } from "@/components/ServerPicker";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStockVersion } from "@/lib/stock-version";
import { discordAvatarUrl } from "@/lib/discord";
import { isStaff } from "@/lib/roles";
import { canManageCatalog } from "@/lib/category-access";
import { getSelectedServer, listServers } from "@/lib/servers";

export default async function HomePage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canManage = await canManageCatalog(session.user.email);
  const selectedServer = await getSelectedServer();

  if (!selectedServer) {
    const servers = await listServers();
    return (
      <BlcShell showNav={false} isStaff={staff} canManageCatalog={canManage}>
        <div className="blc-page-head" style={{ textAlign: "center" }}>
          <h1>BLACK LOTUS COURT</h1>
          <p>Halo, {session.user.name ?? "Member"}. Pilih server sebelum mulai.</p>
        </div>
        <ServerPicker servers={servers} />
      </BlcShell>
    );
  }

  const categories = await prisma.category.findMany({
    where: { serverId: BigInt(selectedServer.id) },
    include: {
      items: {
        where: { serverId: BigInt(selectedServer.id) },
        orderBy: { name: "asc" },
        select: { id: true, categoryId: true, name: true, stock: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const itemsByCategory: Record<
    string,
    { id: number; text: string; name: string; stock: number }[]
  > = {};
  let itemsCount = 0;

  for (const cat of categories) {
    itemsByCategory[String(cat.id)] = cat.items.map((item) => {
      itemsCount += 1;
      return {
        id: Number(item.id),
        text: `${item.name} (stok: ${item.stock})`,
        name: item.name,
        stock: item.stock,
      };
    });
  }

  const stockVersion = await getStockVersion(selectedServer.id);
  const avatar =
    discordAvatarUrl(session.user.discordId, session.user.discordAvatar) ??
    "/image/blc.png";

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canManage}>
      <PortalForm
        userName={session.user.name ?? "Member"}
        avatarUrl={avatar}
        serverName={selectedServer.name}
        categories={categories.map((c) => ({ id: Number(c.id), name: c.name }))}
        initialItems={itemsByCategory}
        initialVersion={stockVersion}
        itemsCount={itemsCount}
      />
    </BlcShell>
  );
}
