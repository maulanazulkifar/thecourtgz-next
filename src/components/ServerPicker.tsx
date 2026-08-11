import { selectServerAction } from "@/app/actions/servers";
import type { AppServer } from "@/lib/servers";

export function ServerPicker({ servers }: { servers: AppServer[] }) {
  return (
    <div className="blc-panel blc-server-picker">
      <h1 className="blc-server-picker-title">Pilih server</h1>
      <p className="blc-server-picker-lead">
        Pilih server yang ingin Anda kelola. Semua transaksi, stok, kategori, dan
        item akan mengikuti server ini sampai diganti.
      </p>
      <div className="blc-server-picker-grid">
        {servers.map((server) => (
          <form key={server.id} action={selectServerAction}>
            <input type="hidden" name="server_id" value={server.id} />
            <button type="submit" className="blc-server-picker-card">
              <span className="blc-server-picker-name">{server.name}</span>
              <span className="blc-server-picker-cta">Kelola server ini</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
