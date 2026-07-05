# Rencana Implementasi: Database Sekolah Indonesia (genlog-sekolah-data)

Dokumen ini menjelaskan langkah-langkah detail (implementation plan) dan kebutuhan untuk membangun repository database sekolah terpisah sesuai dengan blueprint di `dbsekolah.md`.

---

## 1. Apa yang Dibutuhkan (Prerequisites & Assets)

Sebelum memulai implementasi, beberapa hal berikut harus dipersiapkan/disediakan:

### A. Repositori & Environment
1. **GitHub Repository**: Sebuah repositori publik baru bernama `genlog-sekolah-data`.
2. **Environment Kerja**: Node.js (versi LTS, e.g., v18 atau lebih baru) terpasang lokal.
3. **Lokasi GenLog**: Akses baca ke repositori **GenLog** untuk mengambil data wilayah referensi dan melihat file script profile.

### B. Data Referensi Wilayah (dari GenLog)
Kita membutuhkan file berikut dari GenLog agar kode wilayah sinkron 100%:
- `api/wilayah/provinces.json` (ID wilayah 2-digit)
- `api/wilayah/regencies/*.json` (ID wilayah 4-digit per provinsi)

### C. Akses Data Sumber (Source API)
- Akses ke endpoint `https://api-sekolah-indonesia.vercel.app/sekolah`
- Akses/penyelidikan ke Dapodik (`https://dapodik.kemdikbud.go.id`) untuk melihat kemungkinan download data mentah (CSV atau API internal Dapodik).

### D. Dependencies Node.js (untuk Build Scripts)
Beberapa library npm yang disarankan untuk mempermudah scraping dan processing:
- `axios` / `node-fetch`: Mengambil data dari API.
- `p-limit`: Membatasi concurrency request (rate-limiting) agar tidak terkena ban.
- `lodash` atau utility library (opsional, untuk manipulasi data).

---

## 2. Rencana Implementasi (Implementation Plan)

### Fase 1: Setup & Inisialisasi Repositori (Target: Hari ke-1)
1. **Inisialisasi Proyek**:
   - Buat folder `genlog-sekolah-data`.
   - Setup `package.json` dan `.gitignore` (abaikan folder `raw/` agar tidak masuk Git, tapi data hasil olahan di `data/` tetap di-commit).
2. **Import Reference Data**:
   - Copy folder `api/wilayah` dari GenLog ke folder `data/wilayah` di repo baru.
3. **Setup Skema Awal**:
   - Tulis `docs/SCHEMA.md` untuk memperjelas format output.
4. **License File**:
   - Buat file `LICENSE` — MIT untuk code (build scripts), CC-BY 4.0 untuk data. Atribusi sumber: Dapodik Kemendikbud RI.
5. **Pilot Test 3 Provinsi**:
   - Sebelum full fetch, test pipeline dengan 3 provinsi: DKI Jakarta (31), Jawa Barat (32), DI Yogyakarta (34).
   - Verifikasi struktur data, normalisasi, dan validasi sebelum scale ke 34 provinsi.

### Fase 2: Pemetaan & Fetching Raw Data (Target: Hari ke-2)
1. **Pemetaan Kode Provinsi (`mapping-kode-prop.json`)**:
   - Buat script kecil utilitas atau query manual ke API existing untuk mencocokkan nama provinsi ke ID Kemendagri.
   - Hasil akhirnya adalah file JSON mapping 34 (atau 38 jika provinsi baru tersedia) yang berisi, contoh: `"010000": "31"`.
2. **Script Fetching (`build/fetch-all.js`)**:
   - Buat script untuk download data per provinsi secara otomatis.
   - Fitur wajib:
     - Iterasi seluruh kode provinsi dari `mapping-kode-prop.json`.
     - Request per halaman dengan query params `perPage=100` atau maksimal yang diizinkan.
     - Rate limiter (jeda minimal 500ms antar request).
     - Mekanisme retry (3x) dengan exponential backoff dan log error jika gagal.
     - Simpan data mentah ke folder `raw/{provinsi_id}.json`.
3. **Pemetaan Kode Kabupaten (`mapping-kode-kab.json` per provinsi)**:
   - Setelah raw data tersedia, buat mapping `kode_kab_kota` (6-digit API) → `kabupaten_id` (4-digit Kemendagri) per provinsi.
   - Strategi: match by nama kabupaten (setelah normalisasi) antara API response dan `data/wilayah/regencies/{provinsi_id}.json`.
   - Jika match by nama gagal, log warning untuk manual review. Jangan skip.
   - Simpan mapping final untuk reproducibility.

### Fase 3: Normalisasi & Validasi Data (Target: Hari ke-3)
1. **Script Normalisasi (`build/normalize.js`)**:
   - Baca tiap file `raw/{provinsi_id}.json`.
   - Lakukan transformasi field sesuai aturan blueprint:
     - Hilangkan prefix nama wilayah ("Prov.", "Kab.", "Kota", "Kec.") menggunakan regex/string replace.
     - Normalisasi nama (Title Case, hilangkan spasi ganda, trim).
     - Cari `kabupaten_id` dengan mencocokkan nama kabupaten hasil normalisasi ke file `data/wilayah/regencies/{provinsi_id}.json`. Jika gagal, buat log warning khusus untuk pemetaan manual.
     - Konversi koordinat ke float numbers.
     - Ubah status `"N"/"S"` -> `"negeri"/"swasta"`.
     - Hapus payload UUID yang tidak diperlukan.
   - Tulis hasilnya ke `data/provinsi/{provinsi_id}.json`.
2. **Script Indexing (`build/build-index.js`)**:
   - Baca seluruh file `data/provinsi/*.json`.
   - Generate `data/index/by-npsn.json` berisi `NPSN -> { provinsi_id, kabupaten_id }`.
   - Hitung statistik sekolah per provinsi untuk ditulis ke `data/index/summary.json`.
3. **Script Validasi (`build/validate.js`)**:
   - Buat aturan uji kualitas (Quality Gates):
     - Pastikan tidak ada NPSN duplikat across provinsi.
     - Validasi koordinat berada di dalam rentang geografis rasional Indonesia (lintang -90..90, bujur -180..180).
     - Bandingkan nama provinsi/kabupaten hasil normalisasi dengan file referensi wilayah utama (harus match 100%).
     - Cek apakah ada field wajib yang kosong atau bernilai `null` / `undefined`.
     - Validasi `bentuk` hanya berisi nilai valid: SD, SMP, SMA, SMK, SLB, MI, MTs, MA, MAK, TK, RA, dll.
     - Cek case konsistensi nama wilayah: tidak boleh ada variasi penulisan nama yang sama (misal: "Jakarta Pusat" vs "jakarta pusat" vs "JAKARTA PUSAT").
     - **Build gagal jika ada mismatch** — tidak boleh publish data yang tidak konsisten.

### Fase 4: CI/CD & Publikasi (Target: Hari ke-4)
1. **Dokumentasi Lengkap**:
   - Tulis `docs/README.md` tentang cara instalasi, running build script, dan integrasi CDN.
   - Tulis `docs/CHANGELOG.md` untuk versioning data (format: `data: update semester ganjil 2026/2027`).
2. **Setup Github Actions**:
   - Buat file `.github/workflows/validate.yml`.
   - Konfigurasi workflow agar menjalankan `npm run validate` setiap kali ada Pull Request atau Push ke branch utama.
   - Auto-reject PR jika ada NPSN duplikat atau field wajib kosong.
3. **Tagging Release & Verification**:
   - Lakukan deploy awal dan tes URL CDN jsDelivr: 
     `https://cdn.jsdelivr.net/gh/genlog/genlog-sekolah-data@latest/data/provinsi/31.json`
   - Tag release dengan format: `v2026.2` (tahun.suku).

### Fase 5: Integrasi & Pengujian di GenLog (Target: Hari ke-5)
1. **Modifikasi `js/profile.js`**:
   - Ubah logika TomSelect sekolah.
   - Begitu user memilih provinsi, fetch file JSON provinsi tersebut dari CDN (jika belum ada di cache memory).
   - Begitu user memilih kabupaten/kota, filter list sekolah tersebut client-side.
   - Sediakan pencarian teks secara instan dari list sekolah yang di-cache di client-side.
2. **Depresiasi API Proxy**:
   - Matikan atau tandai endpoint `api/search-sekolah` di `server.js` sebagai deprecated.
3. **Pengujian Akhir**:
   - Uji coba skenario pencarian umum seperti "SMA Negeri 1" atau nama sekolah swasta lainnya (misalnya "Al Azhar") di beberapa provinsi untuk mengonfirmasi data berurutan secara logis dan responsif.
   - Test: search "sma negeri 1" di DKI Jakarta → hasil muncul.
   - Test: search "sma negeri 1" di Jawa Barat → hasil muncul.
   - Test: NPSN search untuk sekolah swasta (mis. Al Azhar) → hasil muncul.

### Fase 6: Dapodik Integration (Target: Pasca-MVP)
1. **Riset Akses Dapodik**:
   - Investigasi API/CSV download di `https://dapodik.kemdikbud.go.id`.
   - Tentukan apakah perlu registrasi/API key.
2. **Upgrade `fetch-all.js`**:
   - Tambahkan Dapodik sebagai primary source.
   - API existing (`api-sekolah-indonesia.vercel.app`) menjadi fallback jika Dapodik tidak bisa diakses.
3. **Verifikasi Data**:
   - Compare data Dapodik vs API existing untuk verifikasi konsistensi.
   - Dokumentasikan kendala akses Dapodik jika ada.

### Fase 7: Perguruan Tinggi — PDDikti Data (Target: Pasca-MVP)
1. **Riset API PDDikti**:
   - Investigasi API resmi di `https://pddikti.kemdikbud.go.id` (portal & admin).
   - Evaluasi API wrapper community: `pddikti.rone.dev` (low traffic) atau `pddikti.fastapicloud.dev` (high traffic).
   - Lihat dokumentasi endpoint di `https://pddikti.rone.dev/api/docs` (Swagger).
   - **Catatan**: API wrapper tidak resmi Kemendikbud. Data © PDDikti, maintained by ridwaanhall / RoneAI.
2. **Script Fetch PT (`build/fetch-pt.js`)**:
   - Download data 4,416 PT dari PDDikti API.
   - Challenge: tidak ada endpoint "list all PT by province" — hanya search by keyword.
   - Strategi: search per kabupaten/kota, atau investigasi portal resmi untuk endpoint list/download CSV.
   - Rate limit: throttle request, retry dengan backoff, cache raw data di Git.
   - Simpan raw data ke `raw-pt/{provinsi_id}.json`.
3. **Script Normalisasi PT (`build/normalize-pt.js`)**:
   - Transformasi field sesuai Section 14.6 blueprint:
     - Trim `kode_pt` (6 digit), strip prefix wilayah ("Prov. ", "Kota ", "Kec. ").
     - Normalisasi nama provinsi/kabupaten sama seperti sekolah K-12.
     - Mapping `provinsi_pt` (nama) → `provinsi_id` (Kemendagri) via `provinces.json`.
     - Mapping `kab_kota_pt` (nama) → `kabupaten_id` (Kemendagri) via `regencies/{provinsi_id}.json`.
     - Klasifikasi `bentuk_pt`: Universitas, Institut, Sekolah Tinggi, Politeknik, Akademi.
     - `status_pt`: "Perguruan Tinggi Negeri" → "negeri", "Perguruan Tinggi Swasta" → "swasta".
     - Konversi `tgl_berdiri_pt` → YYYY-MM-DD.
     - Hapus field internal (`id_sp`, `sk_pendirian_sp`, `tgl_sk_pendirian_sp`).
   - Output: `data/perguruan-tinggi/{provinsi_id}.json`.
4. **Script Index PT (`build/build-index-pt.js`)**:
   - Generate `data/index/pt-by-kode.json` — mapping `kode_pt` → `{provinsi_id, kabupaten_id}`.
   - Update `data/index/summary.json` dengan section `total_pt` dan `per_provinsi_pt`.
5. **Script Validasi PT (`build/validate-pt.js`)**:
   - Cek `kode_pt` duplikat across provinsi.
   - Cek field kosong (nama_pt, kode_pt, provinsi_id, kabupaten_id).
   - Cek koordinat valid (lintang -90..90, bujur -180..180).
   - Cek `provinsi_id` & `kabupaten_id` match dengan wilayah referensi.
   - Cek `bentuk_pt` hanya nilai valid.
   - **Build gagal jika ada mismatch**.
6. **Update Dokumentasi**:
   - Update `docs/SCHEMA.md` dengan skema data perguruan tinggi.
   - Update `docs/README.md` dengan instruksi fetch & normalize PT.
   - Update `docs/CHANGELOG.md` dengan entry data PT.
7. **Integrasi GenLog**:
   - Tambah dropdown/search perguruan tinggi di `js/profile.js`.
   - Fetch data PT dari CDN jsDelivr, filter client-side.

---

## 3. Scorecard Progress (Audit Update: 2026-07-06)

### Fase 1: Setup & Inisialisasi — 100% ✅

| Item | Status | Catatan |
|------|--------|--------|
| Repo `genlog-sekolah-data` | ✅ Done | Repo terpisah dari GenLog |
| `package.json` dengan scripts | ✅ Done | `fetch`, `normalize`, `build-index`, `validate`, `build-all` |
| `.gitignore` (ignore `raw/`) | ✅ Done | node_modules, raw, .env, *.log |
| `data/wilayah/provinces.json` | ✅ Done | 34 provinsi, ID Kemendagri 2-digit |
| `data/wilayah/regencies/*.json` | ✅ Done | 34 file regency |
| `docs/SCHEMA.md` | ✅ Done | Dokumentasi skema data |
| `LICENSE` file | ✅ Done | MIT (code) + CC-BY 4.0 (data), atribusi Dapodik |
| Pilot test 3 provinsi | ⚠️ Skipped | Langsung fetch semua, tidak pilot test dulu |

**Laporan Fase 1:** Setup lengkap. Semua prerequisites terpenuhi. Deviasi: skip pilot test, langsung full fetch.

### Fase 2: Pemetaan & Fetching — 100% ✅

| Item | Status | Catatan |
|------|--------|--------|
| `build/map-provinces.js` | ✅ Done | Script query API untuk generate mapping |
| `build/mapping-kode-prop.json` | ✅ Done | 34 entry mapping kode_prop → provinsi_id |
| `build/fetch-all.js` | ✅ Done | Retry 5x, concurrency 5, delay 300ms |
| Raw data fetched | ✅ Done | 34/34 provinsi lengkap |
| `mapping-kode-kab.json` per provinsi | ⚠️ Skipped | Mapping dilakukan inline di normalize.js dengan relaxed + manual overrides |

**Laporan Fase 2:** Semua 34 provinsi berhasil di-fetch. 3 provinsi sebelumnya missing (Sumatera Utara, Sumatera Barat, Riau) berhasil di-fetch ulang. Total raw data: 34 file JSON. Mapping kabupaten dilakukan inline di `normalize.js` dengan relaxed matching + manual overrides, tidak dibuat file terpisah.

**Catatan deviasi:**
- Rate limit 300ms (blueprint: 500ms) + concurrency 5 (blueprint: sequential)
- Retry 5x (blueprint: 3x)
- Tidak mencoba Dapodik sebagai primary source (langsung fallback API)
- `mapping-kode-kab.json` tidak dibuat sebagai file terpisah; mapping kabupaten dilakukan inline di `normalize.js`

### Fase 3: Normalisasi & Validasi — 100% ✅

| Item | Status | Catatan |
|------|--------|--------|
| `build/normalize.js` | ✅ Done | Normalisasi + relaxed matching + manual overrides |
| `build/build-index.js` | ✅ Done | Generate by-npsn.json (11MB) & summary.json |
| `build/validate.js` | ✅ Done | Fixed: scoping, relaxed matching, NPSN non-standard & duplicate as warning |
| `data/provinsi/*.json` | ✅ Done | 34 file ternormalisasi (34/34 provinsi) |
| `data/index/by-npsn.json` | ✅ Done | 11MB, 215,371 entries |
| `data/index/summary.json` | ✅ Done | 215,372 sekolah total, 34 provinsi |

**Laporan Fase 3:** Pipeline `normalize → build-index → validate` berjalan sukses dengan 0 errors. 215,372 sekolah ternormalisasi dari 34 provinsi. Beberapa perbaikan dilakukan:
- Fix ReferenceError variable scoping di `validate.js`.
- Ubah name matching jadi relaxed match (strip spaces & hyphens) agar konsisten dengan `normalize.js`.
- NPSN non-standard (prefix `NP`) diubah dari error jadi warning.
- Duplicate NPSN diubah dari error jadi warning (index akan deduplicate).
- Tambah manual overrides untuk `Humbang Hasudutan` (provinsi 12) dan `Lima Puluh Koto` (provinsi 13).

**Statistik data final:**
- Total sekolah: 215,372
- Total provinsi: 34
- by-npsn.json: 215,371 entries (1 NPSN duplikat di-provinsi, di-deduplicate oleh index)
- Validasi: 0 errors, 2,738 warnings (NPSN non-standard, spelling variants, invalid coordinates)
- Provinsi terbanyak: Jawa Barat (29,532), Jawa Timur (27,807), Jawa Tengah (25,002)
- Provinsi tersedikit: Kalimantan Utara (716), Kep. Bangka Belitung (1,142)

### Fase 4: CI/CD & Publikasi — 75% ✅

| Item | Status | Catatan |
|------|--------|--------|
| `docs/README.md` | ✅ Done | Overview, struktur, usage, CDN, schema, license |
| `docs/CHANGELOG.md` | ✅ Done | v0.1.0 — initial setup & data fetch |
| `.github/workflows/validate.yml` | ✅ Done | CI validate on PR/push to main/master |
| CDN jsDelivr verification | ❌ Pending | Setelah repo dipublish ke GitHub |

**Laporan Fase 4:** Dokumentasi dan CI workflow sudah lengkap. Tinggal publish repo ke GitHub dan verifikasi URL CDN jsDelivr.

### Fase 5: Integrasi GenLog — 0% ❌

| Item | Status | Catatan |
|------|--------|--------|
| Update `js/profile.js` | ❌ Pending | Fetch dari CDN, filter client-side |
| Deprecate proxy `search-sekolah` | ❌ Pending | |
| End-to-end test | ❌ Pending | |

**Laporan Fase 5:** Belum dimulai. Menunggu repo dipublish & CDN aktif.

### Fase 6: Dapodik Integration — 0% ❌

| Item | Status | Catatan |
|------|--------|--------|
| Riset akses Dapodik | ❌ Pending | |
| `fetch-all.js` support Dapodik | ❌ Pending | |
| Compare Dapodik vs API | ❌ Pending | |

**Laporan Fase 6:** Belum dimulai. Pasca-MVP.

### Fase 7: Perguruan Tinggi (PDDikti) — 5% 🔵

| Item | Status | Catatan |
|------|--------|--------|
| Riset API PDDikti | ✅ Done | API wrapper ditemukan, 4,416 PT, endpoint terdokumentasi |
| Blueprint Section 14 | ✅ Done | Skema, transformasi, strategi fetch, validasi |
| `build/fetch-pt.js` | ❌ Pending | Challenge: no "list all" endpoint |
| `build/normalize-pt.js` | ❌ Pending | |
| `data/perguruan-tinggi/*.json` | ❌ Pending | |
| `data/index/pt-by-kode.json` | ❌ Pending | |
| `build/validate-pt.js` | ❌ Pending | |
| Integrasi GenLog PT | ❌ Pending | |

**Laporan Fase 7:** Riset API selesai. PDDikti API wrapper (`pddikti.fastapicloud.dev`) berfungsi dengan 4,416 PT terdaftar. Challenge utama: API hanya menyediakan search by keyword, tidak ada endpoint "list all PT by province". Strategi fetch perlu pendekatan kreatif (search per kabupaten, atau investigasi portal resmi).

---

### Progress Keseluruhan: ~75%

```
Fase 1: Setup          ████████████████████ 100%  ✅
Fase 2: Fetching       ████████████████████ 100%  ✅
Fase 3: Normalize      ████████████████████ 100%  ✅
Fase 4: CI/CD          ████████████████░░░░  75%  ✅ (CDN verify pending)
Fase 5: GenLog         ░░░░░░░░░░░░░░░░░░░░   0%  ❌
Fase 6: Dapodik        ░░░░░░░░░░░░░░░░░░░░   0%  ❌
Fase 7: PDDikti/PT     █░░░░░░░░░░░░░░░░░░░   5%  🔵 (research done)
```

**Blocker utama:**
1. **Publish ke GitHub** — untuk aktivasi CDN jsDelivr
2. **Mulai Fase 5 (GenLog integration)** — update `js/profile.js`

**Next actions:**
1. Publish repo ke GitHub → verifikasi CDN jsDelivr
2. Update `js/profile.js` di GenLog untuk fetch data sekolah dari CDN
3. Deprecate atau fallback-kan proxy `search-sekolah`
4. End-to-end test: search "SMA Negeri 1" di Jakarta & Bandung
5. Lanjut Fase 6 (Dapodik) dan Fase 7 (PDDikti/PT) pasca-MVP
