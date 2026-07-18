import Link from "next/link";
import { BlcShell } from "@/components/BlcShell";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await requireStaff();
  const isSuper = session.user.roles?.includes("superadmin");

  const [users, items, movements] = await Promise.all([
    prisma.user.count(),
    prisma.item.count(),
    prisma.stockMovement.count(),
  ]);

  return (
    <BlcShell showNav isStaff wide scroll>
      <div className="blc-page-head">
        <h1>Dashboard Admin</h1>
        <p>
          Selamat datang, {session.user.name}. Role:{" "}
          {(session.user.roles ?? []).join(", ") || "—"}
        </p>
      </div>

      <div className="blc-stat-grid">
        <div className="blc-stat">
          <span>Users</span>
          <strong>{users}</strong>
        </div>
        <div className="blc-stat">
          <span>Items</span>
          <strong>{items}</strong>
        </div>
        <div className="blc-stat">
          <span>Movements</span>
          <strong>{movements}</strong>
        </div>
      </div>

      <div className="blc-panel">
        <div className="blc-list">
          <Link href="/home" className="blc-list-item" style={{ textDecoration: "none" }}>
            <div>
              <h3>Portal Member</h3>
              <p>Deposit / withdraw &amp; monitoring</p>
            </div>
            <div className="blc-badge">→</div>
          </Link>
          {isSuper ? (
            <Link href="/users" className="blc-list-item" style={{ textDecoration: "none" }}>
              <div>
                <h3>Manajemen User</h3>
                <p>CRUD user &amp; role (superadmin)</p>
              </div>
              <div className="blc-badge">→</div>
            </Link>
          ) : null}
        </div>
      </div>
    </BlcShell>
  );
}
