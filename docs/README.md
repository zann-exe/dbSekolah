# genlog-sekolah-data

Database sekolah seluruh Indonesia yang ter-normalisasi dan sinkron dengan kode wilayah Kemendagri.

## Sumber Data

- **Primary (target)**: Dapodik — `https://dapodik.kemdikbud.go.id`
- **Fallback (saat ini)**: `api-sekolah-indonesia.vercel.app` (wrapper Dapodik)

## Struktur Repo

```
genlog-sekolah-data/
├── data/
│   ├── provinsi/          ← Data sekolah ternormalisasi per provinsi
│   ├── index/             ← Index by-npsn & summary
│   └── wilayah/           ← Referensi wilayah Kemendagri (dari GenLog)
├── build/                 ← Build scripts
├── docs/                  ← Dokumentasi
├── raw/                   ← Raw data (gitignored)
└── package.json
```

## Cara Penggunaan

### Prerequisites

- Node.js v18+ (built-in `fetch` API)

### Build Pipeline

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

### Akses via CDN (jsDelivr)

```
https://cdn.jsdelivr.net/gh/genlog/genlog-sekolah-data@latest/data/provinsi/31.json
```

### Skema Data

Lihat [`SCHEMA.md`](./SCHEMA.md) untuk detail field.

## Integrasi dengan GenLog

1. Fetch file provinsi dari CDN saat user memilih provinsi
2. Filter client-side by `kabupaten_id` saat user memilih kabupaten
3. Search client-side by nama sekolah

## License

- **Code (build scripts)**: MIT
- **Data**: CC-BY 4.0
- **Atribusi sumber**: Dapodik Kemendikbud RI
