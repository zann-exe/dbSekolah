# Blueprint: Database Sekolah Indonesia (GenLog-Sekolah-Data)

## Status: PROPOSAL — Menunggu Persetujuan

Dibuat: 2026-07-06
Mode: Discuss (blueprint, belum implementasi)

---

## 0. Prinsip Utama (WAJIB DIPATUHI)

Blueprint ini dirancang untuk diimplementasikan oleh agent di **repo terpisah** dari GenLog. Berikut prinsip yang tidak boleh dilanggar:

### 0.1 Repo Terpisah — GenLog Tetap Bersih
- Database sekolah dibuat di repo baru: `genlog-sekolah-data`
- **TIDAK BOLEH** menaruh data sekolah, build scripts, atau raw data di dalam repo GenLog
- GenLog hanya mengakses data via CDN URL (jsDelivr/raw GitHub) — tidak ada file data lokal
- Satu-satunya perubahan di GenLog adalah: update `js/profile.js` untuk fetch dari CDN, dan deprecate proxy `search-sekolah`

### 0.2 Sumber Data Terpercaya
- **Sumber utama**: Dapodik (Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi RI) — `https://dapodik.kemdikbud.go.id`
- **Sumber fallback**: `api-sekolah-indonesia.vercel.app` (wrapper Dapodik, bukan sumber resmi)
- **DILARANG** menggunakan data dari scraper random, blog, atau sumber tidak verifiable
- Setiap record harus bisa ditelusuri ke sumber resmi (NPSN terdaftar di Dapodik)
- Jika Dapodik tidak bisa diakses, dokumentasikan kendala dan gunakan fallback dengan catatan jelas

### 0.3 Konsistensi Wilayah — WAJIB
Data wilayah adalah fondasi database sekolah. Inkonsistensi = data rusak.

**Kode Wilayah:**
- `provinsi_id`: 2-digit Kemendagri (contoh: `"31"` = DKI Jakarta) — **sama** dengan `api/wilayah/provinces.json` di GenLog
- `kabupaten_id`: 4-digit Kemendagri (contoh: `"3173"` = Jakarta Pusat) — **sama** dengan `api/wilayah/regencies/{id}.json` di GenLog
- Kode wilayah di file sekolah **HARUS** match 100% dengan kode di file wilayah GenLog

**Penulisan Nama Wilayah — Aturan Normalisasi:**
- **Provinsi**: Tanpa prefix. `"Prov. D.K.I. Jakarta"` → `"DKI Jakarta"`. `"Prov. Jawa Barat"` → `"Jawa Barat"`
- **Kabupaten/Kota**: Tanpa prefix. `"Kab. Bandung"` → `"Bandung"`. `"Kota Jakarta Selatan"` → `"Jakarta Selatan"`. `"Kabupaten Bogor"` → `"Bogor"`
- **Kecamatan**: Tanpa prefix. `"Kec. Cempaka Putih"` → `"Cempaka Putih"`
- **Case**: Title Case untuk nama wilayah (bukan ALL CAPS seperti API asli)
- **Spasi**: Single space, trim leading/trailing. `"D.K.I."` → `"DKI"` (titik dihapus untuk singkatan)
- **Konsistensi**: Nama yang sama harus ditulis sama persis di semua record. Tidak boleh `"Jakarta Pusat"` di satu record dan `"Jakarta pusat"` di record lain

**Validasi Konsistensi:**
- Build script `validate.js` WAJIB cek: setiap `provinsi_id` di data sekolah ada di `wilayah/provinces.json`
- Setiap `kabupaten_id` di data sekolah ada di `wilayah/regencies/{provinsi_id}.json`
- Nama `provinsi` dan `kabupaten` di data sekolah harus match dengan nama di file wilayah (setelah normalisasi)
- Jika ada mismatch → **build gagal**, tidak boleh publish

### 0.4 Self-Contained untuk Agent Implementasi
- Blueprint ini harus cukup lengkap untuk agent lain mengimplementasikan tanpa context tambahan
- Semua keputusan desain, mapping, dan aturan normalisasi sudah tertulis di sini
- Agent implementasi boleh membaca file GenLog (`api/wilayah/`, `js/profile.js`, `server.js`) sebagai referensi, tapi **semua kode dan data dibuat di repo baru**
- Jika ada hal yang belum jelas di blueprint, agent harus tanya ke user — jangan asumsi

---

## 1. Latar Belakang & Masalah

### Masalah API saat ini (`api-sekolah-indonesia.vercel.app`)
- Endpoint search `/sekolah/s` tidak mengurutkan hasil berdasarkan wilayah → query umum seperti "sma negeri 1" tidak menemukan sekolah di wilayah spesifik (Jakarta tidak muncul di 10 halaman pertama dari 696 hasil)
- `kode_prop` API berbeda total dari ID wilayah frontend (lihat Section 5)
- Filter `kabupaten` di endpoint `/sekolah` tidak berfungsi
- Nama wilayah tidak konsisten: `"Prov. D.K.I. Jakarta"`, `"Kab. Bandung"`, `"Kota Jakarta Selatan"`
- Status sekolah singkat: `"N"` / `"S"` (tidak deskriptif)
- Koordinat sebagai string, bukan number
- API adalah wrapper third-party, bukan sumber resmi

### Tujuan
Membuat database sekolah Indonesia yang:
1. **Terstruktur & konsisten** — nama wilayah dinormalisasi, ID cocok dengan frontend
2. **Searchable by wilayah** — filter provinsi + kabupaten/kota di sisi data, bukan tergantung urutan API
3. **Open source** — repo public di Git, bisa dipakai komunitas
4. **Authoritative** — merujuk Dapodik sebagai sumber utama, API existing sebagai fallback

---

## 2. Arsitektur Repo

### Nama Repo
`genlog-sekolah-data` (GitHub public repository)

### Struktur Folder
```
genlog-sekolah-data/
├── data/
│   ├── provinsi/
│   │   ├── 11.json          ← Aceh
│   │   ├── 12.json          ← Sumatera Utara
│   │   ├── ...
│   │   ├── 31.json          ← DKI Jakarta (~4,800 sekolah, ~1.5MB)
│   │   ├── 32.json          ← Jawa Barat (~29,532 sekolah, ~9MB)
│   │   ├── 33.json          ← Jawa Tengah (~25,002 sekolah, ~8MB)
│   │   ├── 35.json          ← Jawa Timur (~27,807 sekolah, ~8.5MB)
│   │   └── 94.json          ← Papua
│   ├── index/
│   │   ├── by-npsn.json     ← Index NPSN → {provinsi_id, kabupaten_id} untuk lookup cepat
│   │   └── summary.json     ← Metadata: jumlah sekolah per provinsi, last update, dll
│   └── wilayah/
│       ├── provinces.json   ← Salinan dari GenLog (ID Kemendagri 2-digit)
│       └── regencies/
│           ├── 11.json
│           ├── 31.json
│           └── ...
├── build/
│   ├── fetch-all.js         ← Script download dari API/Dapodik per provinsi
│   ├── normalize.js         ← Script normalisasi & transformasi struktur
│   ├── build-index.js       ← Script generate index by-npsn & summary
│   ├── validate.js          ← Script validasi: cek NPSN duplikat, wilayah kosong, dll
│   └── mapping-kode-prop.json  ← Mapping API kode_prop → frontend province_id
├── docs/
│   ├── README.md            ← Dokumentasi repo
│   ├── SCHEMA.md            ← Skema data detail
│   └── CHANGELOG.md         ← Riwayat update data
├── .github/
│   └── workflows/
│       └── validate.yml     ← CI: validasi data saat PR
├── .gitignore
├── LICENSE                  ← MIT atau CC-BY 4.0
└── package.json
```

### Kenapa split per provinsi?
- File terbesar (Jawa Barat ~9MB) masih manageable di Git
- User hanya load provinsi yang dipilih → hemat bandwidth
- Update incremental: fix data 1 provinsi tidak perlu re-commit semua
- Paralel fetch: build script bisa download multiple provinsi sekaligus

---

## 3. Skema Data

### 3.1 File Provinsi (`data/provinsi/{id}.json`)

```json
[
  {
    "npsn": "20104775",
    "sekolah": "SD MELANIA III",
    "bentuk": "SD",
    "status": "swasta",
    "provinsi_id": "31",
    "provinsi": "DKI Jakarta",
    "kabupaten_id": "3173",
    "kabupaten": "Jakarta Pusat",
    "kecamatan": "Cempaka Putih",
    "alamat": "Jl. Percetakan Negara No. 31",
    "lintang": -6.1824,
    "bujur": 106.8667
  }
]
```

### 3.2 Perubahan vs API asli

| Field API Asli          | Field Baru       | Transformasi                                    |
|-------------------------|------------------|-------------------------------------------------|
| `kode_prop: "010000  "` | `provinsi_id`    | Mapping ke ID Kemendagri (lihat Section 5)      |
| `propinsi: "Prov. D.K.I. Jakarta"` | `provinsi` | Strip "Prov. ", normalisasi spasi/titik       |
| `kode_kab_kota: "016000  "` | `kabupaten_id` | Mapping ke ID Kemendagri regency               |
| `kabupaten_kota: "Kota Jakarta Pusat"` | `kabupaten` | Strip "Kab. ", "Kota ", normalisasi       |
| `kecamatan: "Kec. Cempaka Putih"` | `kecamatan` | Strip "Kec. ", normalisasi                   |
| `status: "S"`           | `status`         | `"N"` → `"negeri"`, `"S"` → `"swasta"`         |
| `lintang: "-6.1824000"` | `lintang`        | String → float                                  |
| `bujur: "106.8667000"`  | `bujur`          | String → float                                  |
| `alamat_jalan`          | `alamat`         | Trim whitespace                                 |
| `id: "207A8895-..."`    | (dihapus)        | Tidak relevan, NPSN sudah unique                |
| `sekolah`               | `sekolah`        | Trim, title case preservation                   |
| `bentuk`                | `bentuk`         | Uppercase konsisten: SD, SMP, SMA, SMK, dll     |

### 3.3 Index (`data/index/by-npsn.json`)

```json
{
  "20104775": { "provinsi_id": "31", "kabupaten_id": "3173" },
  "20201856": { "provinsi_id": "32", "kabupaten_id": "3201" },
  ...
}
```

### 3.4 Summary (`data/index/summary.json`)

```json
{
  "last_update": "2026-07-06",
  "source": "Dapodik",
  "total_sekolah": 215373,
  "per_provinsi": {
    "11": { "nama": "ACEH", "jumlah": 5290 },
    "31": { "nama": "DKI JAKARTA", "jumlah": 4800 },
    "32": { "nama": "JAWA BARAT", "jumlah": 29532 },
    ...
  }
}
```

---

## 4. Build Pipeline

### Tahap 1: Fetch Raw Data
```
API/Dapodik → raw/{provinsi_id}.json (struktur asli, belum dinormalisasi)
```

**Source priority (lihat Section 0.2 untuk prinsip lengkap):**
1. **Dapodik** (`https://dapodik.kemdikbud.go.id`) — data resmi Kemendikbudristek RI
2. **API existing** (`api-sekolah-indonesia.vercel.app/sekolah?provinsi={kode_prop}`) — fallback jika Dapodik sulit diakses

**Cara fetch (fallback API):**
- Query `/sekolah?provinsi={kode_prop}&perPage=100&page={n}` hingga semua halaman terambil
- `total_data` dari response page 1 menentukan jumlah halaman
- Rate limit: 1 request per 500ms (anti-throttle)
- Retry: 3x dengan backoff exponential

### Tahap 2: Normalize
```
raw/{provinsi_id}.json → data/provinsi/{provinsi_id}.json (struktur baru)
```

- Mapping `kode_prop` → `provinsi_id` via `mapping-kode-prop.json`
- Mapping `kode_kab_kota` → `kabupaten_id` via lookup di `wilayah/regencies/`
- Strip prefix wilayah ("Prov. ", "Kab. ", "Kota ", "Kec. ")
- Konversi `status`: `"N"` → `"negeri"`, `"S"` → `"swasta"`
- Konversi koordinat string → float
- Trim semua field string
- Validasi NPSN: harus 8 digit numeric

### Tahap 3: Build Index
```
data/provinsi/*.json → data/index/by-npsn.json + summary.json
```

- Iterasi semua file provinsi
- Build map NPSN → {provinsi_id, kabupaten_id}
- Hitung total per provinsi
- Generate summary metadata

### Tahap 4: Validate
```
data/**/*.json → report.txt
```

- Cek NPSN duplikat across provinsi
- Cek field kosong (sekolah, npsn, provinsi_id, kabupaten_id)
- Cek koordinat invalid (lintang -90..90, bujur -180..180)
- Cek `bentuk` hanya nilai valid: SD, SMP, SMA, SMK, SLB, MI, MTs, MA, MAK, TK, RA, dll
- Cek semua `provinsi_id` dan `kabupaten_id` ada di wilayah data
- **Cek konsistensi nama**: `provinsi` di data sekolah harus match `provinces.json`, `kabupaten` harus match `regencies/{id}.json` (setelah normalisasi keduanya)
- **Cek case konsistensi**: tidak boleh ada variasi penulisan nama wilayah yang sama (misal: "Jakarta Pusat" vs "jakarta pusat" vs "JAKARTA PUSAT")
- **Build gagal jika ada mismatch** — tidak boleh publish data yang tidak konsisten

---

## 5. Mapping kode_prop API → Province ID Frontend

API menggunakan sistem kode lama (2-digit + 0000), frontend menggunakan ID Kemendagri 2-digit. Mapping **tidak urut**:

| kode_prop API | Provinsi API              | Frontend ID | Frontend Name           |
|---------------|---------------------------|-------------|-------------------------|
| `010000`      | Prov. D.K.I. Jakarta      | `31`        | DKI JAKARTA             |
| `020000`      | Prov. Jawa Barat          | `32`        | JAWA BARAT              |
| `030000`      | Prov. Jawa Tengah         | `33`        | JAWA TENGAH             |
| `040000`      | Prov. D.I. Yogyakarta     | `34`        | DI YOGYAKARTA           |
| `050000`      | Prov. Jawa Timur          | `35`        | JAWA TIMUR              |
| `060000`      | Prov. Aceh                | `11`        | ACEH                    |
| `110000`      | Prov. Sumatera Selatan    | `16`        | SUMATERA SELATAN        |

> **TODO**: Mapping lengkap 34 provinsi harus di-build dengan query API satu per satu di tahap implementasi. File `mapping-kode-prop.json` akan menyimpan mapping final.

### Mapping `kode_kab_kota` → `kabupaten_id`
- API: `kode_kab_kota` = 6-digit (contoh: `"016000  "` = Jakarta Pusat)
- Frontend: `kabupaten_id` = 4-digit Kemendagri (contoh: `"3173"` = Jakarta Pusat)
- Strategi: match by nama kabupaten (setelah normalisasi) antara API response dan `wilayah/regencies/{provinsi_id}.json`
- **PENTING**: Jika match by nama gagal (karena perbedaan penulisan), log warning dan lakukan manual review. Jangan skip.
- File `mapping-kode-kab.json` per provinsi akan menyimpan mapping final untuk reproducibility

---

## 6. Estimasi Ukuran & Performance

| Provinsi        | Jumlah Sekolah | Estimasi Ukuran |
|-----------------|----------------|-----------------|
| Jawa Barat      | 29,532         | ~9 MB           |
| Jawa Timur      | 27,807         | ~8.5 MB         |
| Jawa Tengah     | 25,002         | ~8 MB           |
| Sumatera Selatan| 6,860          | ~2 MB           |
| Aceh            | 5,290          | ~1.6 MB         |
| DKI Jakarta     | 4,800          | ~1.5 MB         |
| DI Yogyakarta   | 2,736          | ~0.8 MB         |
| **Total Nasional** | **~215,373** | **~65 MB**    |

### Load strategy di GenLog
- Frontend load `data/provinsi/{id}.json` hanya saat user memilih provinsi tersebut
- File di-host via raw GitHub URL atau jsDelivr CDN: `https://cdn.jsdelivr.net/gh/genlog/genlog-sekolah-data@latest/data/provinsi/31.json`
- Search dilakukan client-side di array sekolah (filter by `kabupaten_id` + nama sekolah)
- Tidak perlu proxy server untuk search lagi — semua di frontend
- Index `by-npsn.json` (~3-4MB) optional: untuk validasi NPSN cepat tanpa load full provinsi

---

## 7. Integrasi dengan GenLog

### Perubahan di GenLog (saat implementasi, bukan sekarang)

1. **`js/profile.js`** — School TomSelect `load` function:
   - Ganti proxy call dengan fetch langsung ke CDN raw JSON provinsi
   - Filter client-side: `data.filter(s => s.kabupaten_id === regencyId && s.sekolah.toLowerCase().includes(query))`
   - Cache provinsi data di memory setelah first load

2. **`server.js` / `api/search-sekolah.js`**:
   - Bisa di-deprecate atau jadi fallback
   - Atau ubah untuk baca dari local file jika self-hosted

3. **`api/wilayah/`**:
   - Tetap dipertahankan untuk provinsi/regency dropdown
   - Data sekolah di repo terpisah, diakses via CDN

### Flow baru:
```
User pilih provinsi → fetch CDN data/provinsi/{id}.json → cache di memory
User pilih kabupaten → filter cached data by kabupaten_id
User ketik nama sekolah → filter cached data by sekah.includes(query)
```

---

## 8. Update Strategy

### Frekuensi
- Data Dapodik update per semester (Februari & Agustus)
- Rekomendasi: rebuild data setiap semester atau saat ada perubahan signifikan

### Proses
1. Jalankan `build/fetch-all.js` → download raw data terbaru
2. Jalankan `build/normalize.js` → transformasi struktur
3. Jalankan `build/build-index.js` → regenerate index
4. Jalankan `build/validate.js` → pastikan tidak ada error
5. Commit dengan format: `data: update semester ganjil 2026/2027`
6. Tag release: `v2026.2` (tahun.suku)

### CI/CD
- GitHub Actions: jalankan `validate.js` pada setiap PR
- Auto-reject jika ada NPSN duplikat atau field wajib kosong

---

## 9. License & Kontribusi

- **Data**: CC-BY 4.0 (bebas pakai dengan atribusi)
- **Code (build scripts)**: MIT
- **Atribusi sumber**: Dapodik Kemendikbud RI
- **Kontribusi**: Community bisa submit PR untuk koreksi data sekolah (nama salah, koordinat salah, dll)

---

## 10. Roadmap Implementasi

### Phase 1: Foundation (MVP)
- [ ] Buat repo `genlog-sekolah-data`
- [ ] Build `mapping-kode-prop.json` (query API 34 provinsi satu per satu)
- [ ] `fetch-all.js` — download raw data dari API existing (fallback)
- [ ] `normalize.js` — transformasi struktur
- [ ] Test dengan 3 provinsi: DKI Jakarta, Jawa Barat, DI Yogyakarta
- [ ] Publish ke GitHub

### Phase 2: Complete Data
- [ ] Fetch semua 34 provinsi
- [ ] `build-index.js` — generate by-npsn & summary
- [ ] `validate.js` — full validation
- [ ] CI/CD GitHub Actions
- [ ] README.md & SCHEMA.md

### Phase 3: Dapodik Integration
- [ ] Riset akses data Dapodik (API/CSV download)
- [ ] `fetch-all.js` support Dapodik sebagai primary source
- [ ] API existing jadi fallback
- [ ] Compare data Dapodik vs API existing untuk verifikasi

### Phase 4: GenLog Integration (Sekolah K-12)
- [ ] Update `js/profile.js` — fetch dari CDN, filter client-side
- [ ] Deprecate atau fallback-kan proxy `search-sekolah`
- [ ] Test end-to-end: pilih provinsi → kabupaten → search sekolah
- [ ] Verifikasi "sma negeri 1" di Jakarta muncul dengan benar

### Phase 5: Perguruan Tinggi (PDDikti Data)
- [x] Riset API PDDikti (`pddikti.kemdikbud.go.id`) — lihat Section 14
- [x] `build/fetch-pt.js` — download data perguruan tinggi dari GitHub mirror
- [x] `build/normalize-pt.js` — normalisasi struktur data PT (6.600 PT unik, mapping provinsi ~95,7%)
- [x] `data/perguruan-tinggi/{provinsi_id}.json` — output per provinsi (34 file)
- [x] `data/perguruan-tinggi/all-pt.json` — output seluruh PT
- [x] `data/index/pt-by-kode.json` — index kode PT → {provinsi_id, kabupaten_id, nama_pt}
- [x] `build/validate-pt.js` — validasi data PT (kode duplikat, wilayah match)
- [ ] Update `docs/SCHEMA.md` dengan skema data perguruan tinggi
- [ ] Integrasi GenLog: tambah dropdown/search perguruan tinggi di profile

---

## 11. Risiko & Mitigasi

| Risiko                          | Mitigasi                                            |
|---------------------------------|-----------------------------------------------------|
| API existing down/rate-limited   | Cache raw data di Git, Dapodik sebagai primary     |
| Dapodik sulit diakses            | API existing sebagai fallback, data sudah di-cache |
| Data 65MB membebani repo         | Git LFS atau split per provinsi (sudah direncanakan) |
| Mapping kode_prop tidak lengkap  | Build script query semua 34 provinsi di Phase 1    |
| NPSN duplikat antar provinsi     | Validate script akan flag, investigasi manual       |
| CDN rate limit (jsDelivr)        | Self-host alternative atau cache di service worker  |
| PDDikti API unavailable (503)    | Cache raw data di Git, gunakan endpoint alternatif |
| PDDikti API rate limit           | Throttle request, cache hasil, gunakan endpoint high-traffic |

---

## 12. Open Questions

1. **GitHub organization**: Buat org baru `genlog-data` atau pakai akun pribadi?
2. **Git LFS**: Apakah perlu Git LFS untuk file >5MB, atau plain Git cukup?
3. **Dapodik access**: Apakah perlu registrasi/API key untuk akses data Dapodik?
4. **Incremental update**: Apakah perlu diff data lama vs baru untuk tracking perubahan sekolah?
5. **Search index**: Apakah perlu pre-built search index (e.g., FlexSearch) atau filter array biasa cukup cepat untuk 30K records?
6. **PDDikti API key**: Apakah PDDikti API (pddikti.rone.dev) memerlukan API key atau open access?
7. **PDDikti data scope**: Apakah perlu include data prodi & dosen, atau cukup data PT saja?
8. **PDDikti endpoint choice**: Gunakan `pddikti.rone.dev` (low traffic) atau `pddikti.fastapicloud.dev` (high traffic)?

---

## 13. Checklist untuk Agent Implementasi

Agent yang akan mengimplementasikan blueprint ini WAJIB memenuhi semua checklist berikut sebelum menganggap tugas selesai:

### Repo & Struktur
- [ ] Repo `genlog-sekolah-data` dibuat terpisah dari GenLog
- [ ] Tidak ada file data atau build script di dalam repo GenLog
- [ ] Struktur folder sesuai Section 2
- [ ] `package.json` dengan scripts: `fetch`, `normalize`, `build-index`, `validate`, `build-all`

### Sumber Data
- [ ] `fetch-all.js` mencoba Dapodik sebagai source utama
- [ ] Fallback ke API existing terdokumentasi dengan jelas di code dan README
- [ ] Setiap record memiliki NPSN yang valid (8 digit numeric)
- [ ] Tidak ada data dari sumber tidak terpercaya

### Konsistensi Wilayah
- [ ] `wilayah/provinces.json` dicopy dari GenLog (`api/wilayah/provinces.json`)
- [ ] `wilayah/regencies/` dicopy dari GenLog (`api/wilayah/regencies/`)
- [ ] Setiap `provinsi_id` di data sekolah match dengan `provinces.json`
- [ ] Setiap `kabupaten_id` di data sekolah match dengan `regencies/{id}.json`
- [ ] Nama provinsi & kabupaten di data sekolah konsisten dengan file wilayah (setelah normalisasi)
- [ ] Tidak ada variasi penulisan nama wilayah yang sama (case-sensitive check)
- [ ] `validate.js` me-reject build jika ada mismatch wilayah

### Normalisasi Data
- [ ] Prefix wilayah di-strip: "Prov. ", "Kab. ", "Kota ", "Kec. "
- [ ] `status`: "N" → "negeri", "S" → "swasta"
- [ ] Koordinat: string → float
- [ ] Nama sekolah: trim whitespace, preserve case asli
- [ ] `bentuk`: uppercase konsisten
- [ ] Field `id` (UUID) dihapus

### Mapping
- [ ] `mapping-kode-prop.json` lengkap untuk semua 34 provinsi
- [ ] `mapping-kode-kab.json` per provinsi (jika diperlukan)
- [ ] Mapping diverifikasi: query API dengan kode_prop, cek nama provinsi match

### Output
- [ ] `data/provinsi/{id}.json` untuk semua 34 provinsi
- [ ] `data/index/by-npsn.json` generated
- [ ] `data/index/summary.json` generated
- [ ] `docs/README.md` dengan instruksi penggunaan
- [ ] `docs/SCHEMA.md` dengan dokumentasi field
- [ ] `docs/CHANGELOG.md` untuk versioning
- [ ] CI/CD GitHub Actions untuk validate on PR

### Integrasi GenLog — Sekolah K-12 (Phase 4, setelah data siap)
- [ ] `js/profile.js` update: fetch dari CDN, filter client-side
- [ ] Proxy `search-sekolah` di-deprecate atau jadi fallback
- [ ] Test: search "sma negeri 1" di DKI Jakarta → hasil muncul
- [ ] Test: search "sma negeri 1" di Jawa Barat → hasil muncul
- [ ] Test: NPSN search untuk sekolah swasta (mis. Al Azhar) → hasil muncul

### Perguruan Tinggi (Phase 5)
- [x] `build/fetch-pt.js` download data PT dari GitHub mirror
- [x] `build/normalize-pt.js` normalisasi struktur data PT
- [x] `data/perguruan-tinggi/{provinsi_id}.json` untuk 34 provinsi ter-mapping
- [x] `data/perguruan-tinggi/all-pt.json` generated
- [x] `data/index/pt-by-kode.json` generated
- [x] `build/validate-pt.js` validasi data PT
- [ ] `docs/SCHEMA.md` diupdate dengan skema PT
- [ ] Integrasi GenLog: search perguruan tinggi di profile

---

## 14. Data Perguruan Tinggi (PDDikti)

### 14.1 Latar Belakang

Data sekolah K-12 (SD–SMA/SMK) berasal dari Dapodik. Perguruan tinggi dikelola sistem terpisah: **PDDikti** (Pangkalan Data Pendidikan Tinggi) di `pddikti.kemdikbud.go.id`. Database sekolah dan perguruan tinggi memiliki struktur, sumber, dan skema yang berbeda, sehingga ditangani sebagai phase terpisah.

### 14.2 Sumber Data PDDikti

**Sumber resmi**: PDDikti Kemendikbudristek RI — `https://pddikti.kemdikbud.go.id`

**API wrapper (tidak resmi, community-maintained)**:
- **Low traffic** (<500 req/day): `https://pddikti.rone.dev`
- **High traffic** (>500 req/day): `https://pddikti.fastapicloud.dev`
- API docs: `https://pddikti.rone.dev/api/docs` (Swagger) atau `https://pddikti.rone.dev/api/redoc` (ReDoc)
- GitHub: `https://github.com/ridwaanhall/api-pddikti`
- **Catatan**: Ini bukan API resmi Kemendikbud. Data © PDDikti, API maintained by ridwaanhall / RoneAI.

**API resmi PDDikti** (untuk investigasi langsung):
- Portal: `https://pddikti.kemdikbud.go.id`
- Admin: `https://pddikti-admin.kemdikbud.go.id`
- Endpoint pencarian PT: `https://pddikti.kemdikbud.go.id/pt`
- **Endpoint list all PT**: `https://api-frontend.kemdikbud.go.id/loadpt` — mengembalikan seluruh daftar PT (10.219 records, termasuk PT luar negeri). Endpoint ini tidak terdokumentasi secara publik tetapi digunakan oleh frontend PDDikti.

**GitHub mirror** (community-maintained, data diperbarui setiap hari):
- Repo: `https://github.com/mzakiyuddin/daftar-perguruan-tinggi-indonesia`
- JSON: `https://raw.githubusercontent.com/mzakiyuddin/daftar-perguruan-tinggi-indonesia/main/data/data.json`
- CSV: `https://raw.githubusercontent.com/mzakiyuddin/daftar-perguruan-tinggi-indonesia/main/data/data.csv`
- Excel: `https://raw.githubusercontent.com/mzakiyuddin/daftar-perguruan-tinggi-indonesia/main/data/data.xlsx`
- Digunakan sebagai sumber fetch untuk project ini karena lebih stabil dan menyediakan list all PT (tidak seperti API wrapper yang hanya search by keyword).

### 14.3 Statistik PDDikti

Berdasarkan query API (2026-07-06):
- **Total perguruan tinggi aktif** (API wrapper): 4,416 PT
- **Total records** (API resmi frontend `loadpt` / GitHub mirror): 10.219 records (termasuk PT luar negeri dan historis)
- **Total PT Indonesia unik** setelah filter & normalize: 6,600 PT
- **PT dengan provinsi ter-mapping**: 6,318 (~95,7%)
- **PT unmapped**: 282 (~4,3%, mayoritas STT/STAI tanpa nama kota)
- **Distribusi per provinsi** (hasil normalize):

| Provinsi                    | Jumlah PT |
|-----------------------------|-----------|
| JAWA BARAT                  | 949       |
| JAWA TIMUR                  | 743       |
| JAWA TENGAH                 | 591       |
| DKI JAKARTA                 | 556       |
| SUMATERA UTARA              | 484       |
| SUMATERA BARAT              | 354       |
| SULAWESI SELATAN            | 312       |
| KALIMANTAN TIMUR            | 278       |
| SUMATERA SELATAN            | 261       |
| DI YOGYAKARTA               | 204       |
| ACEH                        | 185       |
| SULAWESI BARAT              | 167       |
| NUSA TENGGARA BARAT         | 145       |
| RIAU                        | 122       |
| LAMPUNG                     | 114       |
| PAPUA BARAT                 | 112       |
| SULAWESI UTARA              | 103       |
| NUSA TENGGARA TIMUR         | 100       |
| BALI                        | 83        |
| JAMBI                       | 66        |
| GORONTALO                   | 62        |
| MALUKU                      | 51        |
| BANTEN                      | 40        |
| MALUKU UTARA                | 38        |
| KEPULAUAN RIAU              | 37        |
| KALIMANTAN BARAT            | 29        |
| PAPUA                       | 27        |
| SULAWESI TENGAH             | 21        |
| KEPULAUAN BANGKA BELITUNG   | 20        |
| KALIMANTAN SELATAN          | 19        |
| SULAWESI TENGGARA           | 18        |
| KALIMANTAN TENGAH           | 13        |
| BENGKULU                    | 11        |
| KALIMANTAN UTARA            | 3         |
| UNMAPPED                    | 282       |

### 14.4 Endpoint API PDDikti (Wrapper)

**Search**:
- `GET /api/search/all/{keyword}/` — search PT, prodi, dosen, mahasiswa
- `GET /api/search/pt/{keyword}/` — search universitas/PT by keyword

**Universitas (PT)**:
- `GET /api/pt/detail/{id_pt}/` — detail PT (alamat, provinsi, kabupaten, koordinat, akreditasi, dll)
- `GET /api/pt/prodi/{id_pt}/{id_thsmt}` — prodi per semester
- `GET /api/pt/rasio/{id_pt}/` — rasio dosen-mahasiswa
- `GET /api/pt/mahasiswa/{id_pt}/` — metrik mahasiswa
- `GET /api/pt/biaya-kuliah/{id_pt}/` — range biaya kuliah
- `GET /api/pt/fasilitas/{id_pt}/` — fasilitas
- `GET /api/pt/logo/{id_pt}/` — logo PT

**Statistik**:
- `GET /api/stats/pt-count/` — total jumlah PT
- `GET /api/stats/pt-count-province/` — jumlah PT per provinsi
- `GET /api/stats/pt-count-akreditasi/` — jumlah PT per akreditasi
- `GET /api/stats/pt-count-bentuk-pt/` — jumlah PT per jenis (Universitas, Institut, Politeknik, dll)

### 14.5 Skema Data Perguruan Tinggi

**Struktur file**: `data/perguruan-tinggi/{provinsi_id}.json` dan `data/perguruan-tinggi/all-pt.json`

```json
[
  {
    "id_sp": "00000000-0000-0000-0000-000000000000",
    "kode_pt": "001037",
    "nama_pt": "Universitas Negeri Jakarta",
    "nama_singkat": "",
    "bentuk_pt": "Universitas",
    "status": "negeri",
    "provinsi_id": "31",
    "provinsi": "DKI JAKARTA",
    "kabupaten_id": "",
    "kabupaten": "",
    "kecamatan": "",
    "alamat": "",
    "lintang": null,
    "bujur": null,
    "akreditasi": "",
    "kelompok": "Perguruan Tinggi Negeri"
  }
]
```

**Catatan**: Field `id_sp`, `kabupaten_id`, `kabupaten`, `kecamatan`, `alamat`, `lintang`, `bujur`, `akreditasi`, dan `nama_singkat` masih kosong pada output MVP karena sumber list (`loadpt`) hanya menyediakan `id_sp`, `kode_pt`, dan `nama_pt`. Enrichment detail bisa dilakukan pasca-MVP via API detail atau sumber alternatif.

### 14.6 Transformasi vs API Asli

| Field API PDDikti / Mirror  | Field Baru       | Transformasi                                    |
|-----------------------------|------------------|-------------------------------------------------|
| `id_sp`                     | `id_sp`          | Preserve (internal PDDikti, digunakan untuk enrichment) |
| `kode_pt: "001037  "`       | `kode_pt`        | Trim whitespace, 6 digit                        |
| `nama_pt`                   | `nama_pt`        | Trim, preserve case                             |
| `nm_singkat`                | `nama_singkat`   | Kosong (tidak tersedia di sumber list)          |
| `kelompok`                  | `kelompok`       | Dihitung dari `status` — "Perguruan Tinggi Negeri" / "Perguruan Tinggi Swasta" |
| `pembina`                   | —                | Tidak tersedia di sumber list (pasca-MVP)       |
| `status_pt`                 | `status`         | Dihitung dari prefix kode PT dan keyword nama (negeri/swasta) |
| `akreditasi_pt`             | `akreditasi`     | Kosong (tidak tersedia di sumber list)          |
| `provinsi_pt`               | `provinsi`       | Mapping via `build/mapping-kode-pt.json` (3-digit prefix) dan fallback keyword nama |
| `kab_kota_pt`               | `kabupaten`      | Kosong (tidak tersedia di sumber list)          |
| `kecamatan_pt`              | `kecamatan`      | Kosong                                          |
| `lintang_pt`                | `lintang`        | Kosong                                          |
| `bujur_pt`                  | `bujur`          | Kosong                                          |
| `tgl_berdiri_pt`            | `tgl_berdiri`    | Tidak tersedia                                  |
| `kode_pos`                  | `kode_pos`       | Tidak tersedia                                  |
| `email`, `no_tel`, `website`| —                | Tidak tersedia                                  |
| `alamat`                    | `alamat`         | Tidak tersedia                                  |

**Field turunan**:
- `provinsi_id`: Mapping dari 3-digit prefix `kode_pt` → `build/mapping-kode-pt.json` → Kemendagri ID; fallback keyword matching dari nama PT.
- `kabupaten_id`: Belum diisi (perlu enrichment detail).
- `bentuk_pt`: Klasifikasi dari `nama_pt` — Universitas, Institut, Sekolah Tinggi, Politeknik, Akademi, Lainnya.
- `status`: "negeri" / "swasta" dari prefix kode PT dan keyword nama (e.g., "Negeri", "Kementerian", "Politeknik Negeri").

### 14.7 Strategi Fetch PDDikti

**Masalah**: API PDDikti wrapper (`pddikti.rone.dev` / `pddikti.fastapicloud.dev`) tidak menyediakan endpoint "list all PT by province". Hanya search by keyword, dengan pagination yang tidak dapat diandalkan untuk enumerasi lengkap.

**Solusi**: Gunakan **API resmi frontend PDDikti** endpoint `https://api-frontend.kemdikbud.go.id/loadpt` yang mengembalikan seluruh daftar PT. Untuk stabilitas, fetch dari **GitHub mirror** `mzakiyuddin/daftar-perguruan-tinggi-indonesia` yang diperbarui setiap hari dari endpoint tersebut.

**Pipeline Fase 7**:
1. `build/fetch-pt.js`: Download `data.json` dari GitHub mirror → `raw-pt/pt.json`.
2. `build/normalize-pt.js`:
   - Filter PT luar negeri (`90xxxx`) dan record tanpa kode.
   - Mapping `provinsi_id` via `build/mapping-kode-pt.json` (3-digit prefix → Kemendagri) dan fallback keyword matching dari nama PT.
   - Klasifikasi `bentuk_pt` dan `status` (negeri/swasta).
   - Output `data/perguruan-tinggi/all-pt.json` dan `data/perguruan-tinggi/{provinsi_id}.json`.
   - Generate `data/index/pt-by-kode.json`.
3. `build/validate-pt.js`: Validasi struktur, duplikat, dan province ID.

**Run scripts**:
```bash
npm run fetch-pt
npm run normalize-pt
npm run validate-pt
# atau sekaligus
npm run build-pt
```

**Enrichment pasca-MVP**:
- Untuk mengisi `kabupaten`, `koordinat`, `akreditasi`, `alamat`, `kontak`, dan `tgl_berdiri`, perlu hit API detail per PT (e.g., wrapper API `/api/pt/detail/{id_pt}/`) atau integrasi dengan data lain.
- Rate limit wrapper: <500 req/day (`pddikti.rone.dev`), >500 req/day (`pddikti.fastapicloud.dev`). Gunakan throttle, retry backoff, dan cache.

### 14.8 Validasi Data PT

- Cek `kode_pt` duplikat across provinsi.
- Cek field kosong untuk field required: `nama_pt`, `kode_pt`, `bentuk_pt`, `status`, `provinsi_id`, `provinsi`.
- Cek `provinsi_id` valid (terdaftar di `provinces.json`).
- Cek `bentuk_pt` hanya nilai valid: `Universitas`, `Institut`, `Sekolah Tinggi`, `Politeknik`, `Akademi`, `Lainnya`.
- Cek index `data/index/pt-by-kode.json` mencakup seluruh `kode_pt`.
- Cek per-province file `data/perguruan-tinggi/{provinsi_id}.json` tersedia untuk setiap provinsi yang ter-mapping.
- Koordinat, kabupaten, akreditasi, dan field kontak sengaja tidak divalidasi pada MVP karena belum diisi (perlu enrichment pasca-MVP).
- **Build gagal jika ada mismatch pada field required atau duplikat `kode_pt`**. Setelah validasi lulus, pipeline bisa commit & push.

### 14.9 Index Perguruan Tinggi

**`data/index/pt-by-kode.json`**:
```json
{
  "001037": { "provinsi_id": "31", "kabupaten_id": "", "nama_pt": "Universitas Negeri Jakarta" },
  "031005": { "provinsi_id": "31", "kabupaten_id": "", "nama_pt": "Universitas Jakarta" }
}
```

**Catatan**: `kabupaten_id` kosong pada MVP karena belum di-enrich. Index tetap berguna untuk lookup cepat `kode_pt` → `provinsi_id`.

**Update `data/index/summary.json`** — tambah section PT:
```json
{
  "last_update": "2026-07-06",
  "source": "Dapodik / Fallback API",
  "total_sekolah": 215373,
  "total_pt": 4416,
  "per_provinsi": { },
  "per_provinsi_pt": {
    "31": { "nama": "DKI JAKARTA", "jumlah_pt": 565 },
    "32": { "nama": "JAWA BARAT", "jumlah_pt": 877 }
  }
}
```
