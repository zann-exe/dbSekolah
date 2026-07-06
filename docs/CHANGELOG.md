# Changelog

## v0.1.0 — 2026-07-06

### Added
- Repo `genlog-sekolah-data` diinisialisasi terpisah dari GenLog
- Data wilayah referensi (34 provinsi, 34 file regencies) dicopy dari GenLog
- `build/map-provinces.js` — script pemetaan kode_prop API → provinsi_id Kemendagri
- `build/mapping-kode-prop.json` — mapping 34 provinsi
- `build/fetch-all.js` — script fetching raw data dengan retry & concurrency
- `build/normalize.js` — script normalisasi & transformasi struktur
- `build/build-index.js` — script generate by-npsn.json & summary.json
- `build/validate.js` — script validasi (NPSN duplikat, wilayah, koordinat, bentuk, case)
- `docs/SCHEMA.md` — dokumentasi skema data
- `docs/README.md` — dokumentasi repo
- `package.json` dengan scripts: fetch, normalize, build-index, validate, build-all

### Data
- Raw data fetched: 34/34 provinsi lengkap (termasuk 3 provinsi sebelumnya missing: Sumatera Utara, Sumatera Barat, Riau)
- Total sekolah: 215,372
- by-npsn.json: 215,371 entries (1 NPSN duplikat di source data)
- Validasi: 0 errors, 2,738 warnings

### Fixed
- `build/validate.js`: fix `ReferenceError` variable scoping
- `build/validate.js`: relaxed matching untuk provinsi/kabupaten names
- `build/validate.js`: non-standard NPSN & duplicate NPSN diubah ke warning
- `build/normalize.js`: tambah manual overrides untuk `Humbang Hasudutan` (12) dan `Lima Puluh Koto` (13)

### Published
- Initial commit & push ke `https://github.com/zann-exe/dbSekolah`
- CDN jsDelivr aktif: `https://cdn.jsdelivr.net/gh/zann-exe/dbSekolah@master/`
