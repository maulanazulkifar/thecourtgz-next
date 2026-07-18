import { redirect } from "next/navigation";

/** Digabung ke Cek Stok (/home/rekap?tab=stok) */
export default function AuditStokRedirect() {
  redirect("/home/rekap?tab=stok");
}
