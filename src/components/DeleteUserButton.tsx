"use client";

import { deleteUserAction } from "@/app/actions/users";
import { useRouter } from "next/navigation";

export function DeleteUserButton({ id }: { id: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="blc-btn secondary"
      style={{ width: "auto", padding: "0.4rem 0.65rem", fontSize: "0.68rem" }}
      onClick={async () => {
        if (!confirm("Hapus user ini?")) return;
        const result = await deleteUserAction(id);
        if (!result.ok) alert(result.error);
        else router.refresh();
      }}
    >
      Delete
    </button>
  );
}
