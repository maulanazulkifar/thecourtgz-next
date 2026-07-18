import { BlcShell } from "@/components/BlcShell";
import { SimpleForm } from "@/components/SimpleForm";
import { storeCategoryAction } from "@/app/actions/inventory";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";

export default async function CategoryPage() {
  const session = await requireSession();
  const staff = isStaff(session.user.roles ?? []);
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return (
    <BlcShell showNav isStaff={staff} wide scroll>
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
              <article key={String(c.id)} className="blc-list-item">
                <div>
                  <h3>{c.name}</h3>
                  <p>{c.description || "—"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </BlcShell>
  );
}
