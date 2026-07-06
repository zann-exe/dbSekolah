# genlog-sekolah-data

Database sekolah seluruh Indonesia yang ter-normalisasi dan sinkron dengan kode wilayah Kemendagri.

## Sumber Data

### Sekolah K-12
- **Primary (target)**: Dapodik — `https://dapodik.kemdikbud.go.id`
- **Fallback (saat ini)**: `api-sekolah-indonesia.vercel.app` (wrapper Dapodik)

### Perguruan Tinggi (PDDikti)
- **Primary (target)**: PDDikti frontend — `https://api-frontend.kemdikbud.go.id/loadpt`
- **Fetch source (saat ini)**: GitHub mirror `mzakiyuddin/daftar-perguruan-tinggi-indonesia` (data dari `loadpt`, diperbarui setiap hari)

## Struktur Repo

```
genlog-sekolah-data/
├── data/
│   ├── provinsi/           ← Data sekolah K-12 ternormalisasi per provinsi
│   ├── perguruan-tinggi/   ← Data PT ternormalisasi (all-pt.json + per provinsi)
│   ├── index/              ← Index by-npsn, pt-by-kode, & summary
│   └── wilayah/            ← Referensi wilayah Kemendagri (dari GenLog)
├── build/                  ← Build scripts
├── docs/                   ← Dokumentasi
├── raw/                    ← Raw data sekolah (gitignored)
├── raw-pt/                 ← Raw data PT (gitignored)
└── package.json
```

## Cara Penggunaan

### Prerequisites

- Node.js v18+ (built-in `fetch` API)

### Build Pipeline — Sekolah K-12

```bash
# 1. Fetch raw data dari API
npm run fetch

# 2. Normalisasi raw data → data/provinsi/{id}.json
npm run normalize

# 3. Generate index (by-npsn.json & summary.json)
npm run build-index

# 4. Validasi data
npm run validate

# Atau jalankan semua sekaligus:
npm run build-all
```

### Build Pipeline — Perguruan Tinggi

```bash
# 1. Fetch PT list dari GitHub mirror
npm run fetch-pt

# 2. Normalisasi → data/perguruan-tinggi/{id}.json
npm run normalize-pt

# 3. Validasi data PT
npm run validate-pt

# Atau jalankan semua sekaligus:
npm run build-pt
```

### Akses via CDN (jsDelivr)

```
# Sekolah K-12
https://cdn.jsdelivr.net/gh/zann-exe/dbSekolah@master/data/provinsi/31.json

# Perguruan Tinggi
https://cdn.jsdelivr.net/gh/zann-exe/dbSekolah@master/data/perguruan-tinggi/all-pt.json
https://cdn.jsdelivr.net/gh/zann-exe/dbSekolah@master/data/perguruan-tinggi/31.json
```

### Skema Data

Lihat [`SCHEMA.md`](./SCHEMA.md) dan blueprint `dbsekolah.md` Section 14 untuk detail field.

## Integrasi dengan GenLog

### Sekolah K-12
1. Fetch file provinsi dari CDN saat user memilih provinsi
2. Filter client-side by `kabupaten_id` saat user memilih kabupaten
3. Search client-side by nama sekolah

### Perguruan Tinggi (pending)
1. Fetch `all-pt.json` atau file provinsi dari CDN
2. Search client-side by nama PT
3. (Pasca-MVP) Filter by `kabupaten_id` setelah detail enrichment

## License

- **Code (build scripts)**: MIT
- **Data**: CC-BY 4.0
- **Atribusi sumber**: Dapodik Kemendikbud RI
