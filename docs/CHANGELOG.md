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
- Raw data fetched: 31/34 provinsi (missing: Sumatera Utara, Sumatera Barat, Riau)
- Total raw records: ~190,163 sekolah
