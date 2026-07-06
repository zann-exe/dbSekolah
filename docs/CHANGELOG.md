# Changelog

## v0.2.0 (unreleased) — PDDikti PT Data

### Added
- `build/fetch-pt.js` — fetch data PT dari GitHub mirror `mzakiyuddin/daftar-perguruan-tinggi-indonesia`
- `build/mapping-kode-pt.json` — mapping 3-digit prefix `kode_pt` → `provinsi_id` Kemendagri
- `build/normalize-pt.js` — filter PT luar negeri (`90xxxx`), klasifikasi `bentuk_pt`, `status`, mapping provinsi
- `build/validate-pt.js` — validasi duplikat `kode_pt`, province ID valid, index coverage
- `package.json` scripts: `fetch-pt`, `normalize-pt`, `validate-pt`, `build-pt`

### Data
- Raw records: 10,219 (dari `loadpt` mirror)
- PT Indonesia unik: 6,600
- PT mapped to province: 6,318 (~95,7%)
- PT unmapped: 282 (~4,3%, mayoritas STT/STAI tanpa nama kota)
- Output: `data/perguruan-tinggi/all-pt.json` + 34 file provinsi + `data/index/pt-by-kode.json`

### Notes
- Detail enrichment (kabupaten, koordinat, akreditasi, kontak) masih pending pasca-MVP.
- CDN jsDelivr PT data aktif: `https://cdn.jsdelivr.net/gh/zann-exe/dbSekolah@master/data/perguruan-tinggi/`

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
