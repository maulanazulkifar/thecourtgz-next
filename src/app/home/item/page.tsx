import { BlcShell } from "@/components/BlcShell";
import { SimpleForm } from "@/components/SimpleForm";
import { storeItemAction } from "@/app/actions/inventory";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";

export default async function ItemPage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <BlcShell showNav isStaff={staff} wide scroll>
      <div className="blc-page-head">
        <h1>Tambah Item</h1>
        <p>Tambahkan item ke kategori yang sudah ada.</p>
      </div>

      <div className="blc-panel">
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
    </BlcShell>
  );
}
