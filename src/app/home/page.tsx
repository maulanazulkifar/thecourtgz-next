import { BlcShell } from "@/components/BlcShell";
import { PortalForm } from "@/components/PortalForm";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStockVersion } from "@/lib/stock-version";
import { discordAvatarUrl } from "@/lib/discord";
import { isStaff } from "@/lib/roles";
import { canManageCatalog } from "@/lib/category-access";

export default async function HomePage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canManage = await canManageCatalog(session.user.email);

  const categories = await prisma.category.findMany({
    include: {
      items: {
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

  const stockVersion = await getStockVersion();
  const avatar =
    discordAvatarUrl(session.user.discordId, session.user.discordAvatar) ??
    "/image/blc.png";

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canManage}>
      <PortalForm
        userName={session.user.name ?? "Member"}
        avatarUrl={avatar}
        categories={categories.map((c) => ({ id: Number(c.id), name: c.name }))}
        initialItems={itemsByCategory}
        initialVersion={stockVersion}
        itemsCount={itemsCount}
      />
    </BlcShell>
  );
}
