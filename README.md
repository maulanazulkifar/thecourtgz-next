# BLACK LOTUS COURT — Next.js

Port mandiri dari aplikasi Laravel `thecourtgz`. UI BLC (hitam-emas) sama, database PostgreSQL/Supabase **yang sama**.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Auth.js (NextAuth v5) — Discord OAuth + Credentials admin
- Prisma 7 → tabel Laravel existing (tanpa migrate destruktif)
- Spatie roles/permissions dibaca lewat tabel `roles` / `model_has_roles` (`model_type = App\Models\User`)

## Setup lokal

Prasyarat: **Node.js 20+** (disarankan 22).

```bash
cd thecourtgz-next
npm install
cp .env.example .env
# isi DATABASE_URL, AUTH_SECRET, Discord, dll.
npx prisma generate
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Discord Developer Portal

Tambahkan Redirect URI:

```
http://localhost:3000/api/auth/callback/discord
```

(Produksi: `https://domain-anda.com/api/auth/callback/discord`)

### Env penting

| Key | Keterangan |
|---|---|
| `DATABASE_URL` | Supabase pooler (`sslmode=require`) |
| `AUTH_SECRET` | Random panjang untuk JWT session |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | OAuth Discord |
| `RECAPTCHA_*` | Opsional lokal; wajib di production admin login |
| `CACHE_PREFIX` | Default `black-lotus-court-cache-` (kompatibel Laravel) |

## Fitur yang di-port

- `/` → Discord login (member)
- `/admin/login` → email/password + reCAPTCHA (staff)
- `/home` transaksi deposit/withdraw + poll stok
- `/home/rekap`, `/home/monitoring` (+ return / unreturnable Senjata)
- `/home/kategori`, `/home/item`
- `/dashboard`, `/users` (superadmin)

## Cutover dari Laravel

1. Deploy Next.js, set env ke DB yang sama
2. Update Discord Redirect URI ke domain Next
3. **Matikan** Laravel agar tidak dual-write stok
4. User harus login ulang (session Laravel tidak kompatibel)

Jangan jalankan `prisma migrate` terhadap DB production — schema sudah ada dari Laravel.

## Deploy (Render)

```bash
# pakai render.yaml + Dockerfile
```

Health check: `/api/health`

## Scripts

```bash
npm run dev      # development
npm run build    # production build
npm run start    # serve
npx prisma generate
```
