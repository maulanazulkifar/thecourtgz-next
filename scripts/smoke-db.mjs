import "dotenv/config";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("sslmode", "require");
url.searchParams.set("uselibpqcompat", "true");

const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

try {
  const { rows } = await pool.query(
    `select
      (select count(*)::int from users) as users,
      (select count(*)::int from items) as items,
      (select count(*)::int from roles) as roles`,
  );
  console.log(JSON.stringify({ ok: true, ...rows[0] }));
} catch (e) {
  console.error("DB smoke failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
