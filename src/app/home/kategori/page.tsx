import { BlcShell } from "@/components/BlcShell";
import { CategoryManageRow } from "@/components/CategoryManageRow";
import { SimpleForm } from "@/components/SimpleForm";
import { storeCategoryAction } from "@/app/actions/inventory";
import { canManageCatalog } from "@/lib/category-access";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { redirect } from "next/navigation";

export default async function CategoryPage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const canManage = canManageCatalog(session.user.email);
  if (!canManage) redirect("/home");

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return (
    <BlcShell showNav isStaff={staff} canManageCatalog={canManage} wide scroll>
      <div className="blc-page-head">
        <h1>Tambah Kategori</h1>
        <p>Buat kategori inventori baru (mis. Senjata, Material).</p>
      </div>

      <div className="blc-panel" style={{ marginBottom: "1rem" }}>
        <SimpleForm action={storeCategoryAction}>
          <div className="blc-field">
            <label className="blc-label" htmlFor="name">
              Nama
            </label>
            <input id="name" name="name" className="blc-input" required maxLength={100} />
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
          Daftar kategori
        </h2>
        {categories.length === 0 ? (
          <div className="blc-empty">Belum ada kategori.</div>
        ) : (
          <div className="blc-list">
            {categories.map((c) => (
              <CategoryManageRow
                key={String(c.id)}
                id={String(c.id)}
                name={c.name}
                description={c.description}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </div>
    </BlcShell>
  );
}
