import { BlcShell } from "@/components/BlcShell";
import { ItemManageRow } from "@/components/ItemManageRow";
import { SimpleForm } from "@/components/SimpleForm";
import { storeItemAction } from "@/app/actions/inventory";
import { canManageCatalog } from "@/lib/category-access";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { redirect } from "next/navigation";

export default async function ItemPage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canManage = canManageCatalog(session.user.email);
  if (!canManage) redirect("/home");

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const items = await prisma.item.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      description: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  const categoryOptions = categories.map((c) => ({
    id: String(c.id),
    name: c.name,
  }));

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canManage} wide scroll>
      <div className="blc-page-head">
        <h1>Tambah Item</h1>
        <p>Tambahkan item ke kategori yang sudah ada.</p>
      </div>

      <div className="blc-panel" style={{ marginBottom: "1rem" }}>
        {categories.length === 0 ? (
          <div className="blc-alert blc-alert-info">
            Buat kategori dulu sebelum menambah item.
          </div>
        ) : null}
        <SimpleForm action={storeItemAction}>
          <div className="blc-field">
            <label className="blc-label" htmlFor="category_id">
              Kategori
            </label>
            <select id="category_id" name="category_id" className="blc-select" required>
              <option value="">Pilih kategori</option>
              {categories.map((c) => (
                <option key={String(c.id)} value={Number(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="blc-field">
            <label className="blc-label" htmlFor="name">
              Nama item
            </label>
            <input id="name" name="name" className="blc-input" required maxLength={150} />
          </div>
          <div className="blc-home-row">
            <div className="blc-field">
              <label className="blc-label" htmlFor="sku">
                SKU (opsional)
              </label>
              <input id="sku" name="sku" className="blc-input" maxLength={50} />
            </div>
            <div className="blc-field">
              <label className="blc-label" htmlFor="stock">
                Stok awal
              </label>
              <input
                id="stock"
                name="stock"
                type="number"
                className="blc-input"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>
          <div className="blc-field">
            <label className="blc-label" htmlFor="description">
              Deskripsi
            </label>
            <textarea
              id="description"
              name="description"
              className="blc-textarea"
              maxLength={500}
              rows={3}
            />
          </div>
        </SimpleForm>
      </div>

      <div className="blc-panel">
        <h2 style={{ marginTop: 0, color: "var(--blc-gold)", fontFamily: "Cinzel, serif" }}>
          Daftar item
        </h2>
        {items.length === 0 ? (
          <div className="blc-empty">Belum ada item.</div>
        ) : (
          <div className="blc-list">
            {items.map((item) => (
              <ItemManageRow
                key={String(item.id)}
                id={String(item.id)}
                name={item.name}
                sku={item.sku}
                stock={item.stock}
                description={item.description}
                categoryId={String(item.categoryId)}
                categoryName={item.category.name}
                categories={categoryOptions}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </div>
    </BlcShell>
  );
}
