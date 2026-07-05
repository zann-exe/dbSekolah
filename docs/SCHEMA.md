# Skema Data (SCHEMA.md)

Dokumen ini menjelaskan struktur data JSON yang dihasilkan oleh build pipeline dalam repositori ini.

---

## 1. File Provinsi (`data/provinsi/{provinsi_id}.json`)

Setiap provinsi disimpan dalam satu file JSON yang berisi array objek sekolah. Nama file adalah `provinsi_id` (2-digit kode wilayah Kemendagri, contoh: `31.json` untuk DKI Jakarta).

### Contoh Data:
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

### Detail Field:
| Nama Field | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `npsn` | String | Nomor Pokok Sekolah Nasional (8 digit numerik, unik secara nasional). |
| `sekolah` | String | Nama sekolah (Title Case, spasi ganda dibersihkan, whitespace di-trim). |
| `bentuk` | String | Bentuk pendidikan (SD, SMP, SMA, SMK, MI, MTs, MA, SLB, TK, dll. dalam UPPERCASE). |
| `status` | String | Status sekolah: `"negeri"` atau `"swasta"` (lowercase). |
| `provinsi_id` | String | Kode wilayah provinsi 2-digit sesuai standard Kemendagri (contoh: `"31"`). |
| `provinsi` | String | Nama provinsi yang dinormalisasi (contoh: `"DKI Jakarta"`). |
| `kabupaten_id` | String | Kode wilayah kabupaten/kota 4-digit sesuai standard Kemendagri (contoh: `"3173"`). |
| `kabupaten` | String | Nama kabupaten/kota yang dinormalisasi (contoh: `"Jakarta Pusat"`). |
| `kecamatan` | String | Nama kecamatan yang dinormalisasi (contoh: `"Cempaka Putih"`). |
| `alamat` | String | Alamat jalan sekolah (whitespace di-trim). |
| `lintang` | Number/Float | Garis lintang (latitude) posisi geografis sekolah. Nilai null jika tidak valid/tidak ada. |
| `bujur` | Number/Float | Garis bujur (longitude) posisi geografis sekolah. Nilai null jika tidak valid/tidak ada. |

---

## 2. File Indeks NPSN (`data/index/by-npsn.json`)

File indeks global untuk pencarian cepat. Memetakan NPSN ke ID provinsi dan kabupatennya.

### Contoh Data:
```json
{
  "20104775": { "provinsi_id": "31", "kabupaten_id": "3173" },
  "20201856": { "provinsi_id": "32", "kabupaten_id": "3201" }
}
```

---

## 3. File Summary metadata (`data/index/summary.json`)

Metadata ringkas mengenai database keseluruhan.

### Contoh Data:
```json
{
  "last_update": "2026-07-06",
  "source": "Dapodik / Fallback API",
  "total_sekolah": 215373,
  "per_provinsi": {
    "11": { "nama": "ACEH", "jumlah": 5290 },
    "31": { "nama": "DKI JAKARTA", "jumlah": 4800 },
    "32": { "nama": "JAWA BARAT", "jumlah": 29532 }
  }
}
```
