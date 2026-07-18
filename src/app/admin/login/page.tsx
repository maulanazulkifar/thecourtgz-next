import { BlcShell } from "@/components/BlcShell";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error
    ? decodeURIComponent(params.error)
    : null;

  return (
    <BlcShell>
      <div className="blc-brand">
        <img src="/image/blc.png" alt="BLACK LOTUS COURT" />
        <h1>BLACK LOTUS COURT</h1>
        <p>Login admin</p>
      </div>
      <div className="blc-panel">
        {error ? (
          <div className="blc-alert blc-alert-danger">
            <strong>Login gagal</strong>
            <p style={{ margin: "0.35rem 0 0" }}>{error}</p>
          </div>
        ) : null}
        <AdminLoginForm siteKey={process.env.RECAPTCHA_SITE_KEY ?? ""} />
      </div>
    </BlcShell>
  );
}
