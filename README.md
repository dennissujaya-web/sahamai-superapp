# SahamAI Super App (US MVP) — Full Online (tanpa Python)

Next.js app:
- Harga saham US: Stooq (gratis)
- Fundamental terstruktur: SEC EDGAR Company Facts (XBRL JSON)
- Scoring explainable + intrinsic + margin of safety.

## Deploy online tanpa run lokal
1) Buat repo GitHub baru.
2) Upload semua file proyek ini ke repo (via GitHub web UI).
3) Vercel → New Project → Import repo → Deploy.
4) Tambahkan Env var:
   - `SEC_USER_AGENT` = `SahamAI/0.1 (contact: your_email@example.com)`
5) Redeploy.

Selesai.

## Daily Watchlist (auto)
App ini punya endpoint batch: `POST /api/batch`.

Untuk auto-update harian tanpa server sendiri:
1) Pastikan app sudah live di Vercel.
2) Di GitHub repo → **Settings → Secrets and variables → Actions → Variables**
   - Buat variable **APP_URL** = `https://nama-app-kamu.vercel.app`
3) Tab **Actions** → jalankan workflow **Daily Watchlist** (atau tunggu schedule).

Output akan ditulis ke:
- `public/daily/latest.json` (dipakai UI)
- `public/daily/YYYYMMDD.json` (arsip)

Ubah daftar ticker & delay di `data/watchlist.us.json`.

## Tuning strategi
Edit `data/strategy.us.json` untuk MOS, fair PE, dan scoring threshold.
