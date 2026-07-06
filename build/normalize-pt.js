import fs from 'fs';
import path from 'path';

const rawFile = path.resolve('raw-pt/pt.json');
const outputDir = path.resolve('data/perguruan-tinggi');
const indexDir = path.resolve('data/index');
const allPtPath = path.join(outputDir, 'all-pt.json');

if (!fs.existsSync(rawFile)) {
    console.error('raw-pt/pt.json not found! Run build/fetch-pt.js first.');
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const provinces = JSON.parse(fs.readFileSync(path.resolve('data/wilayah/provinces.json'), 'utf8'));
const prefixMap = JSON.parse(fs.readFileSync(path.resolve('build/mapping-kode-pt.json'), 'utf8'));

// Load existing enriched data to preserve enriched fields
const enrichedData = {};
if (fs.existsSync(allPtPath)) {
    const existing = JSON.parse(fs.readFileSync(allPtPath, 'utf8'));
    for (const pt of existing) {
        if (pt.kode_pt) {
            enrichedData[pt.kode_pt] = {
                kabupaten_id: pt.kabupaten_id || '',
                kabupaten: pt.kabupaten || '',
                kecamatan: pt.kecamatan || '',
                alamat: pt.alamat || '',
                lintang: pt.lintang || null,
                bujur: pt.bujur || null,
                akreditasi: pt.akreditasi || '',
                pembina: pt.pembina || '',
                status_aktif: pt.status_aktif || ''
            };
        }
    }
    console.log(`Loaded enriched data for ${Object.keys(enrichedData).length} PT records`);
}

const provById = Object.fromEntries(provinces.map(p => [p.id, p.name]));

// Build city/regency keywords from existing wilayah data
const provinceKeywords = [];
for (const prov of provinces) {
    const regencyFile = path.resolve(`data/wilayah/regencies/${prov.id}.json`);
    if (fs.existsSync(regencyFile)) {
        const regencies = JSON.parse(fs.readFileSync(regencyFile, 'utf8'));
        for (const reg of regencies) {
            // Strip KAB./KOTA prefix and use bare name as keyword
            const bare = reg.name.replace(/^(KABUPATEN|KOTA)\s+/i, '').trim();
            if (bare.length > 3) provinceKeywords.push([bare.toUpperCase(), prov.id]);
        }
    }
    // Add province name itself
    provinceKeywords.push([prov.name, prov.id]);
}

// Extra manual keywords (cities, districts, abbreviations)
const extraKeywords = [
    ['BANDA ACEH', '11'], ['LHOKSEUMAWE', '11'], ['LANGSA', '11'], ['MEULABOH', '11'], ['SIGLI', '11'], ['ACEH', '11'],
    ['MEDAN', '12'], ['PADANG SIDEMPUAN', '12'], ['SIBOLGA', '12'], ['PEMATANG SIANTAR', '12'], ['TANJUNG BALAI', '12'], ['TEBING TINGGI', '12'], ['BINJAI', '12'], ['SUMATERA UTARA', '12'], ['SUMUT', '12'],
    ['PADANG', '13'], ['BUKITTINGGI', '13'], ['SOLOK', '13'], ['SAWAH LUNTO', '13'], ['PARIAMAN', '13'], ['PAYAKUMBUH', '13'], ['SUMATERA BARAT', '13'], ['SUMBAR', '13'],
    ['PEKANBARU', '14'], ['DUMAI', '14'], ['RIAU', '14'],
    ['JAMBI', '15'], ['SUNGAI PENUH', '15'],
    ['PALEMBANG', '16'], ['LUBUKLINGGAU', '16'], ['PRABUMULIH', '16'], ['PAGAR ALAM', '16'], ['SUMATERA SELATAN', '16'], ['SUMSEL', '16'],
    ['BENGKULU', '17'],
    ['BANDAR LAMPUNG', '18'], ['METRO', '18'], ['LAMPUNG', '18'],
    ['PANGKAL PINANG', '19'], ['BANGKA BELITUNG', '19'], ['BANGKA', '19'], ['BELITUNG', '19'],
    ['BATAM', '21'], ['TANJUNG PINANG', '21'], ['KEPULAUAN RIAU', '21'], ['KEPRI', '21'],
    ['JAKARTA', '31'], ['DKI JAKARTA', '31'],
    ['BANDUNG', '32'], ['BEKASI', '32'], ['BOGOR', '32'], ['DEPOK', '32'], ['CIMAHI', '32'], ['SUKABUMI', '32'], ['TASIKMALAYA', '32'], ['CIANJUR', '32'], ['GARUT', '32'], ['JAWA BARAT', '32'], ['JABAR', '32'],
    ['SEMARANG', '33'], ['SURAKARTA', '33'], ['SOLO', '33'], ['KUDUS', '33'], ['PATI', '33'], ['PEKALONGAN', '33'], ['SALATIGA', '33'], ['TEGAL', '33'], ['PURBALINGGA', '33'], ['JEPARA', '33'], ['DEMAK', '33'], ['KLATEN', '33'], ['WONOGIRI', '33'], ['JAWA TENGAH', '33'], ['JATENG', '33'],
    ['YOGYAKARTA', '34'], ['YOGYA', '34'], ['DI YOGYAKARTA', '34'], ['BANTUL', '34'], ['SLEMAN', '34'], ['KULON PROGO', '34'], ['GUNUNG KIDUL', '34'], ['DIY', '34'],
    ['SURABAYA', '35'], ['MALANG', '35'], ['MOJOKERTO', '35'], ['KEDIRI', '35'], ['BLITAR', '35'], ['MADIUN', '35'], ['PROBOLINGGO', '35'], ['PASURUAN', '35'], ['BATU', '35'], ['JEMBER', '35'], ['SIDOARJO', '35'], ['GRESIK', '35'], ['BANGKALAN', '35'], ['JAWA TIMUR', '35'], ['JATIM', '35'],
    ['TANGERANG', '36'], ['SERANG', '36'], ['CILEGON', '36'], ['BANTEN', '36'],
    ['DENPASAR', '51'], ['BALI', '51'],
    ['MATARAM', '52'], ['BIMA', '52'], ['LOMBOK', '52'], ['NTB', '52'], ['NUSA TENGGARA BARAT', '52'],
    ['KUPANG', '53'], ['ENDE', '53'], ['NTT', '53'], ['NUSA TENGGARA TIMUR', '53'],
    ['PONTIANAK', '61'], ['SINGKAWANG', '61'], ['KALIMANTAN BARAT', '61'], ['KALBAR', '61'],
    ['PALANGKARAYA', '62'], ['KALIMANTAN TENGAH', '62'], ['KALTENG', '62'],
    ['BANJARMASIN', '63'], ['BANJARBARU', '63'], ['KALIMANTAN SELATAN', '63'], ['KALSEL', '63'],
    ['SAMARINDA', '64'], ['BALIKPAPAN', '64'], ['BONTANG', '64'], ['TARAKAN', '64'], ['KALIMANTAN TIMUR', '64'], ['KALTIM', '64'],
    ['TANJUNG SELOR', '65'], ['KALIMANTAN UTARA', '65'], ['KALUT', '65'],
    ['MANADO', '71'], ['TOMOHON', '71'], ['BITUNG', '71'], ['SULAWESI UTARA', '71'], ['SULUT', '71'],
    ['PALU', '72'], ['SULAWESI TENGAH', '72'], ['SULTENG', '72'],
    ['MAKASSAR', '73'], ['PALOPO', '73'], ['PAREPARE', '73'], ['SULAWESI SELATAN', '73'], ['SULSEL', '73'],
    ['KENDARI', '74'], ['BAU BAU', '74'], ['SULAWESI TENGGARA', '74'], ['SULTENGGRA', '74'],
    ['GORONTALO', '75'],
    ['MAMUJU', '76'], ['SULAWESI BARAT', '76'], ['SULBAR', '76'],
    ['AMBON', '81'], ['TUAL', '81'], ['MALUKU', '81'],
    ['TERNATE', '82'], ['TIDORE', '82'], ['MALUKU UTARA', '82'], ['MALUT', '82'],
    ['JAYAPURA', '94'], ['SORONG', '92'], ['MANOKWARI', '92'], ['PAPUA', '94'], ['PAPUA BARAT', '92'],
    // Specific institutions / aliases
    ['SUNAN KALIJAGA', '34'], ['SYARIF HIDAYATULLAH', '31'], ['MAULANA MALIK IBRAHIM', '35'], ['SUNAN AMPEL', '35'], ['SUNAN GUNUNG DJATI', '32'], ['SRIWIJAYA', '16'], ['UJUNG PANDANG', '73'], ['MADURA', '35'], ['PANGKAJENE KEPULAUAN', '73'], ['PANGKEP', '73'], ['NUSA UTARA', '71'], ['AR-RANIRY', '11'], ['MALIKUSSALEH', '11'], ['CIPASUNG', '32'], ['AHMAD DAHLAN', '34'], ['SABAK', '13'], ['BARUMUN RAYA SIBUHUAN', '12'], ['SIBUHUAN', '12'], ['TORAJA', '73'], ['SENTANI', '94'], ['LARANTUKA', '53'], ['ATAMBUA', '53'], ['MAUMERE', '53'], ['RUTENG', '53'], ['TANJUNG KARANG', '18'], ['CURUG', '36'], ['BAROMBONG', '73'], ['MALAHAYATI', '11'], ['AL-KHAIRAT', '73'], ['PEMEKASAN', '35'], ['CIPANAS', '32'], ['MOOAT', '71'], ['MUMTAZ', '33'], ['TUANKU TAMBUSAI', '14'], ['FAQIH ASY`ARI', '35'], ['AL-KAUTSAR', '33'], ['INJILI INDONESIA', '33'], ['HKBP SIPOHOLON', '12'], ['STTSA', '32'], ['TABERNAKEL LAWANG', '35'], ['INALTA', '12'], ['PENTAKOSTA MOOAT', '71'], ['GEREJA INJILI DI INDONESIA', '33'], ['LEDALERO', '53'], ['STO. YOHANES SALIB', '53'], ['ST. PETRUS', '53'], ['ST. BENEDIKTUS', '53'], ['ST.SIRILUS', '53'], ['STIKPAR', '73'], ['LEDLERO', '53'], ['NITA', '53'], ['ELKATARIE', '35'], ['MADANI NUSANTARA', '33'], ['TUAH NEGERI', '14'], ['Fahmina', '12'], ['SUNAN DOE', '35'], ['ZAINUL HASAN GENGGONG', '35'], ['MUJADDID', '13'], ['ALIF MUHAMMAD IMAM SYAFI\'I', '35'], ['Zainul Hasan Genggong', '35'], ['Cikarang Barat', '32'], ['Cikarang', '32'], ['ASH-SHIDDIQ', '32'], ['STEI GLOBAL', '32'], ['Fitrah Insani', '32'], ['Misbahudin Ahmad', '32'], ['Bau-Bau', '74'], ['Bau Bau', '74'], ['Al-Syaikh Abdul Wahid', '74'], ['STIT Mumtaz', '33'], ['Al-Khairat', '73'], ['PANGANDARAN', '32'], ['TAMBARANGAN RANTAU TAPIN', '63'], ['TANJUNG REDEB BERAU', '64'], ['SEGERAN INDRAMAYU', '32'], ['PANGERAN DHARMA KUSUMA', '32'], ['Indramayu', '32'], ['Saleh Budiman', '12'], ['Watampone', '73'], ['Mandailing Natal', '12'], ['Majene', '76'], ['Bengkalis', '14'], ['Wonogiri', '33'], ['Bone', '73'], ['Takengon', '11'], ['Purwokerto', '33'], ['Ponorogo', '35'], ['Madura', '35'], ['Kerinci', '15'], ['Bukittinggi', '13'], ['Lampung', '18'], ['Lamongan', '35'], ['Kota Banjar', '32'], ['Pare', '35'], ['Tegal', '33'], ['Jombang', '35'], ['Temanggung', '33'], ['Majenang', '33'], ['Kendal', '33'], ['Donggala', '72'], ['Kotawaringin Timur', '62'], ['Kolaka', '74'], ['Dairi', '12'], ['Lahat', '16'], ['Gunungsitoli', '12'], ['Kabanjahe', '12'], ['Karo', '12'], ['Kupang', '53'], ['Ende', '53'], ['Sipoholon', '12'], ['Lawang', '35'], ['Palangka Raya', '62'], ['Tampung Penyang', '62'], ['Manokwari', '92'], ['Sorong', '92'], ['Deiyai', '94'], ['Timika', '94'], ['Jayapura', '94'], ['Merauke', '94'], ['Barabai', '63'], ['Nad', '12'], ['Mukhtar Syafaat', '35'], ['Abdul Chalim', '35'], ['Darullughah Wadda`wah', '35'], ['Al-Aziziyah', '35'], ['Al-Hikmah', '35'], ['Al-Falah', '35'], ['Al-Amien', '35'], ['Islam Darussalam', '35'], ['Bunga Bangsa', '32'], ['Azzahra', '32'], ['Internasional Indonesia', '31'], ['Sungai', '16'], ['Kuantan Singingi', '14'], ['Rokan Hilir', '14'], ['Husada Gemilang', '14'], ['Pekanbaru', '14'], ['Sempena Negeri', '14'], ['Lingga', '21'], ['Pengadaan Nasional', '31'], ['Digital Kreatif Malay', '21'], ['Batam', '21'], ['Bangka', '19'], ['Lombok', '52'], ['Sumbawa', '52'], ['Bima', '52'], ['Dompu', '52'], ['Sumbawa Barat', '52'], ['Sumbawa Besar', '52'], ['Mataram', '52'], ['Gianyar', '51'], ['Badung', '51'], ['Tabanan', '51'], ['Buleleng', '51'], ['Karangasem', '51'], ['Bangli', '51'], ['Jembrana', '51'], ['Klungkung', '51'], ['Bali', '51'], ['Klaten', '33'], ['Bantul', '34'], ['Sleman', '34'], ['Bantul', '34'], ['Sukoharjo', '33'], ['Karanganyar', '33'], ['Boyolali', '33'], ['Sragen', '33'], ['Gro', '33'], ['Grobogan', '33'], ['Blora', '33'], ['Rembang', '33'], ['Pati', '33'], ['Kudus', '33'], ['Jepara', '33'], ['Demak', '33'], ['Semarang', '33'], ['Salatiga', '33'], ['Pekalongan', '33'], ['Tegal', '33'], ['Brebes', '33'], ['Pemalang', '33'], ['Batang', '33'], ['Kendal', '33'], ['Banyumas', '33'], ['Cilacap', '33'], ['Purbalingga', '33'], ['Banjarnegara', '33'], ['Kebumen', '33'], ['Purworejo', '33'], ['Wonosobo', '33'], ['Temanggung', '33'], ['Magelang', '33'], ['Kulon Progo', '34'], ['Gunung Kidul', '34'], ['Bantul', '34'], ['Sleman', '34'], ['Kota Yogyakarta', '34'], ['Yogyakarta', '34'], ['Cilacap', '33'], ['Banyuwangi', '35'], ['Bondowoso', '35'], ['Situbondo', '35'], ['Jember', '35'], ['Lumajang', '35'], ['Probolinggo', '35'], ['Malang', '35'], ['Batu', '35'], ['Pasaruan', '35'], ['Sidoarjo', '35'], ['Mojokerto', '35'], ['Jombang', '35'], ['Nganjuk', '35'], ['Madiun', '35'], ['Magetan', '35'], ['Ngawi', '35'], ['Bojonegoro', '35'], ['Tuban', '35'], ['Lamongan', '35'], ['Gresik', '35'], ['Surabaya', '35'], ['Sidoarjo', '35'], ['Bangkalan', '35'], ['Sampang', '35'], ['Pamekasan', '35'], ['Sumenep', '35'], ['Kediri', '35'], ['Blitar', '35'], ['Tulungagung', '35'], ['Trenggalek', '35'], ['Pacitan', '35'], ['Ponorogo', '35'], ['Trenggalek', '35'], ['Sukabumi', '32'], ['Cianjur', '32'], ['Bogor', '32'], ['Bekasi', '32'], ['Depok', '32'], ['Karawang', '32'], ['Purwakarta', '32'], ['Subang', '32'], ['Indramayu', '32'], ['Majalengka', '32'], ['Sumedang', '32'], ['Tasikmalaya', '32'], ['Garut', '32'], ['Ciamis', '32'], ['Kuningan', '32'], ['Cirebon', '32'], ['Bandung', '32'], ['Banjar', '32'], ['Cimahi', '32'], ['Garut', '32'], ['Bogor', '32'], ['Sukabumi', '32'], ['Banten', '36'], ['Lebak', '36'], ['Pandeglang', '36'], ['Serang', '36'], ['Tangerang', '36'], ['Cilegon', '36'], ['Tangerang Selatan', '36'], ['Jakarta', '31'], ['Bogor', '32'], ['Tangerang', '36'], ['Bekasi', '32'], ['Depok', '32'], ['Jakarta Barat', '31'], ['Jakarta Pusat', '31'], ['Jakarta Selatan', '31'], ['Jakarta Timur', '31'], ['Jakarta Utara', '31'], ['Kepulauan Seribu', '31']
];

for (const [kw, id] of extraKeywords) {
    provinceKeywords.push([kw, id]);
}

// Sort by longest keyword first to avoid partial matches
provinceKeywords.sort((a, b) => b[0].length - a[0].length);

const negeriPrefixes = ['001', '002', '003', '004', '005', '006', '342', '413', '415', '423', '425', '433', '443', '453', '463', '471', '473', '474', '475', '483', '493', '495', '500', '504', '513', '525', '535'];
const negeriKeywords = ['NEGERI', 'KEMENKES', 'KEMENDIKBUD', 'KEMENHUB', 'KEMENHAN', 'KEMENTERIAN', 'ANGKATAN', 'AKADEMI MILITER', 'AKADEMI ANGKATAN', 'POLITEKNIK STATISTIKA', 'POLITEKNIK KEUANGAN NEGARA', 'SEKOLAH TINGGI AKUNTANSI NEGARA', 'LEMBAGA ADMINISTRASI NEGARA', 'UNIVERSITAS PERTAHANAN', 'POLITEKNIK NEGERI', 'INSTITUT TEKNOLOGI BANDUNG', 'INSTITUT TEKNOLOGI SEPULUH NOVEMBER', 'INSTITUT PERTANIAN BOGOR', 'UNIVERSITAS GADJAH MADA', 'UNIVERSITAS INDONESIA', 'UNIVERSITAS AIRLANGGA', 'UNIVERSITAS HASANUDDIN', 'UNIVERSITAS ANDALAS', 'UNIVERSITAS PADJADJARAN', 'UNIVERSITAS DIPONEGORO', 'UNIVERSITAS BRAWIJAYA', 'UNIVERSITAS SYIAH KUALA', 'UNIVERSITAS NEGERI', 'UNIVERSITAS ISLAM NEGERI', 'UNIVERSITAS KRISTEN INDONESIA', 'UNIVERSITAS KATOLIK', 'UNIVERSITAS HINDU', 'UNIVERSITAS BORNEO', 'POLITEKNIK NEGERI', 'INSTITUT AGAMA ISLAM NEGERI', 'INSTITUT AGAMA KRISTEN NEGERI', 'INSTITUT AGAMA HINDU NEGERI', 'SEKOLAH TINGGI AGAMA NEGERI', 'SEKOLAH TINGGI AGAMA ISLAM NEGERI', 'SEKOLAH TINGGI AGAMA KRISTEN NEGERI', 'SEKOLAH TINGGI AGAMA HINDU NEGERI', 'SEKOLAH TINGGI AGAMA BUDDHA NEGERI', 'SEKOLAH TINGGI TEKNOLOGI NUKLIR', 'SEKOLAH TINGGI ILMU STATISTIK', 'SEKOLAH TINGGI PERTANAHAN NASIONAL', 'SEKOLAH TINGGI SENI INDONESIA', 'SEKOLAH TINGGI TEKNOLOGI ANGKATAN', 'SEKOLAH TINGGI PERIKANAN', 'SEKOLAH TINGGI KHONGHUCU', 'AKADEMI ANGKATAN', 'AKADEMI KEPOLISIAN', 'AKADEMI METEOROLOGI', 'AKADEMI KOMUNITAS NEGERI', 'AKADEMI KOMUNITAS INDUSTRI', 'AKADEMI ILMU PEMasyarakatan', 'AKADEMI IMIGRASI', 'AKADEMI MINYAK DAN GAS', 'AKADEMI PERIKANAN', 'AKADEMI PIMPINAN PERUSAHAAN', 'AKADEMI TEKNIK INDUSTRI', 'POLITEKNIK PERTANIAN NEGERI', 'POLITEKNIK MANUFAKTUR NEGERI', 'POLITEKNIK PERKAPALAN NEGERI', 'POLITEKNIK ELEKTRONIK NEGERI', 'POLITEKNIK TRANSPORTASI DARAT', 'POLITEKNIK KEUANGAN NEGARA', 'POLITEKNIK STATISTIKA', 'POLITEKNIK KELAUTAN', 'POLITEKNIK ILMU PELAYARAN', 'POLITEKNIK PERIKANAN', 'POLITEKNIK SIBER DAN SANDI', 'POLITEKNIK KESEJAHTERAAN SOSIAL', 'POLITEKNIK PENDIDIKAN', 'POLITEKNIK PEKERJAAN UMUM', 'POLITEKNIK KETENAGAKERJAAN', 'POLITEKNIK KONSTRUKSI', 'POLITEKNIK ENERGI', 'POLITEKNIK PARIWISATA', 'POLITEKNIK INDUSTRI', 'POLITEKNIK KELAUTAN DAN PERIKANAN', 'POLITEKNIK PERHUBUNGAN', 'POLITEKNIK MANUFAKTUR', 'POLITEKNIK PERTANIAN', 'POLITEKNIK TEKNOLOGI NUKLIR'];

function detectBentuk(name) {
    const n = name.toUpperCase();
    if (n.startsWith('UNIVERSITAS')) return 'Universitas';
    if (n.startsWith('INSTITUT')) return 'Institut';
    if (n.startsWith('POLITEKNIK')) return 'Politeknik';
    if (n.startsWith('SEKOLAH TINGGI')) return 'Sekolah Tinggi';
    if (n.startsWith('AKADEMI')) return 'Akademi';
    if (n.startsWith('STMIK') || n.startsWith('STKIP') || n.startsWith('STAIN') || n.startsWith('STAI') || n.startsWith('STIE') || n.startsWith('STIKES') || n.startsWith('STT ') || n.startsWith('STIT ') || n.startsWith('ST ') || n.startsWith('STTM ') || n.startsWith('STIEP')) return 'Sekolah Tinggi';
    if (n.startsWith('IAIN') || n.startsWith('UIN')) return 'Universitas';
    return 'Lainnya';
}

function detectStatus(record) {
    const prefix = (record.kode_pt || '').slice(0, 3);
    const name = (record.nama_pt || '').toUpperCase();
    if (negeriPrefixes.includes(prefix)) return 'negeri';
    if (prefix.startsWith('0') && (name.includes('NEGERI') || name.includes('KEMEN') || name.includes('AKADEMI MILITER') || name.includes('AKADEMI ANGKATAN') || name.includes('AKADEMI KEPOLISIAN') || name.includes('POLITEKNIK NEGERI') || name.includes('INSTITUT TEKNOLOGI BANDUNG') || name.includes('INSTITUT TEKNOLOGI SEPULUH NOVEMBER') || name.includes('INSTITUT PERTANIAN BOGOR') || name.includes('UNIVERSITAS GADJAH MADA') || name.includes('UNIVERSITAS INDONESIA') || name.includes('UNIVERSITAS AIRLANGGA') || name.includes('UNIVERSITAS HASANUDDIN') || name.includes('UNIVERSITAS ANDALAS') || name.includes('UNIVERSITAS PADJADJARAN') || name.includes('UNIVERSITAS DIPONEGORO') || name.includes('UNIVERSITAS BRAWIJAYA') || name.includes('UNIVERSITAS SYIAH KUALA') || name.includes('UNIVERSITAS NEGERI') || name.includes('UNIVERSITAS ISLAM NEGERI') || name.includes('UNIVERSITAS KRISTEN INDONESIA') || name.includes('UNIVERSITAS KATOLIK') || name.includes('UNIVERSITAS HINDU') || name.includes('UNIVERSITAS BORNEO'))) return 'negeri';
    if (negeriKeywords.some(k => name.includes(k))) return 'negeri';
    return 'swasta';
}

function detectProvince(record) {
    const prefix = (record.kode_pt || '').slice(0, 3);
    if (prefixMap[prefix]) return prefixMap[prefix];

    const name = (record.nama_pt || '').toUpperCase();
    for (const [kw, id] of provinceKeywords) {
        if (name.includes(kw)) return id;
    }
    return '';
}

function normalizeRecord(record) {
    const name = (record.nama_pt || '').trim();
    const kode = (record.kode_pt || '').trim();
    const bentuk = detectBentuk(name);
    const status = detectStatus(record);
    const provId = detectProvince(record);

    // Preserve enriched fields if available
    const enriched = enrichedData[kode] || {};

    return {
        id_sp: (record.id_sp || '').trim(),
        kode_pt: kode,
        nama_pt: name,
        nama_singkat: '',
        bentuk_pt: bentuk,
        status: status,
        provinsi_id: provId,
        provinsi: provById[provId] || '',
        kabupaten_id: enriched.kabupaten_id || '',
        kabupaten: enriched.kabupaten || '',
        kecamatan: enriched.kecamatan || '',
        alamat: enriched.alamat || '',
        lintang: enriched.lintang || null,
        bujur: enriched.bujur || null,
        akreditasi: enriched.akreditasi || '',
        kelompok: status === 'negeri' ? 'Perguruan Tinggi Negeri' : 'Perguruan Tinggi Swasta',
        pembina: enriched.pembina || '',
        status_aktif: enriched.status_aktif || ''
    };
}

function main() {
    const filtered = rawData
        .filter(r => r.kode_pt && !r.kode_pt.startsWith('90') && r.kode_pt.length >= 3)
        .map(normalizeRecord);

    const seen = new Set();
    const unique = [];
    for (const r of filtered) {
        const key = r.kode_pt;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
        }
    }

    const mapped = unique.filter(r => r.provinsi_id);
    const unmapped = unique.filter(r => !r.provinsi_id);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(indexDir, { recursive: true });

    // Clean stale per-province files
    for (const file of fs.readdirSync(outputDir)) {
        if (/^\d{2}\.json$/.test(file)) {
            fs.unlinkSync(path.join(outputDir, file));
        }
    }

    // Save all PT
    fs.writeFileSync(path.join(outputDir, 'all-pt.json'), JSON.stringify(unique, null, 2), 'utf8');

    // Save per-province
    const byProvince = {};
    for (const r of unique) {
        if (!r.provinsi_id) continue;
        if (!byProvince[r.provinsi_id]) byProvince[r.provinsi_id] = [];
        byProvince[r.provinsi_id].push(r);
    }

    for (const [provId, list] of Object.entries(byProvince)) {
        fs.writeFileSync(path.join(outputDir, `${provId}.json`), JSON.stringify(list, null, 2), 'utf8');
    }

    // Save index
    const index = {};
    for (const r of unique) {
        index[r.kode_pt] = {
            provinsi_id: r.provinsi_id,
            kabupaten_id: r.kabupaten_id,
            nama_pt: r.nama_pt
        };
    }
    fs.writeFileSync(path.join(indexDir, 'pt-by-kode.json'), JSON.stringify(index, null, 2), 'utf8');

    console.log(`Normalized ${unique.length} unique PT records`);
    console.log(`Mapped to province: ${mapped.length}`);
    console.log(`Unmapped: ${unmapped.length}`);
    console.log(`Saved per-province files: ${Object.keys(byProvince).length}`);
    console.log(`Saved index: ${Object.keys(index).length} entries`);

    if (unmapped.length > 0) {
        console.log('\n[DEBUG] Unmapped prefixes:');
        const prefixCounts = {};
        for (const r of unmapped) {
            const p = r.kode_pt.slice(0, 3);
            prefixCounts[p] = (prefixCounts[p] || 0) + 1;
        }
        for (const [p, c] of Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
            console.log(`  ${p}: ${c}`);
        }
    }
}

main();
