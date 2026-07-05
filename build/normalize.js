import fs from 'fs';
import path from 'path';

const RAW_DIR = path.resolve('raw');
const OUT_DIR = path.resolve('data/provinsi');
const WILAYAH_DIR = path.resolve('data/wilayah');
const MAPPING_PROP = path.resolve('build/mapping-kode-prop.json');
const MAPPING_KAB_DIR = path.resolve('build/mapping-kode-kab');

const VALID_BENTUK = new Set([
    'SD', 'SMP', 'SMA', 'SMK', 'SLB',
    'SDLB', 'SMPLB', 'SMLB',
    'MI', 'MTs', 'MA', 'MAK',
    'TK', 'RA', 'PKBM', 'SKB',
]);

function stripPrefix(name) {
    if (!name) return '';
    return name
        .replace(/^Prov\.\s*/i, '')
        .replace(/^Provinsi\s+/i, '')
        .replace(/^Kab\.\s*/i, '')
        .replace(/^Kabupaten\s+/i, '')
        .replace(/^Kota\s+/i, '')
        .replace(/^Kec\.\s*/i, '')
        .replace(/^Kecamatan\s+/i, '')
        .trim();
}

function removeDots(name) {
    return name.replace(/\./g, '');
}

function toTitleCase(name) {
    if (!name) return '';
    const cleaned = removeDots(name);
    const words = cleaned.split(/\s+/);
    return words
        .map((word) => {
            if (word.length <= 4 && word === word.toUpperCase()) {
                return word;
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

function normalizeWilayahName(rawName) {
    if (!rawName) return '';
    const stripped = stripPrefix(rawName);
    const noDots = removeDots(stripped);
    const collapsed = noDots.replace(/\s+/g, ' ').trim();
    if (collapsed === collapsed.toUpperCase()) {
        return toTitleCase(collapsed);
    }
    return collapsed;
}

function normalizeForMatch(name) {
    if (!name) return '';
    return stripPrefix(name).replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeForRelaxedMatch(name) {
    if (!name) return '';
    return stripPrefix(name).replace(/\./g, '').replace(/[\s-]+/g, '').trim().toUpperCase();
}

const MANUAL_KAB_OVERRIDES = {
    '12': { 'HUMBANGHASUDUTAN': '1215' },
    '13': { 'LIMAPULUHKOTO': '1308' },
    '53': { 'NAGAKEO': '5318' },
    '64': { 'MAHAKAMULU': '6411' },
    '71': {
        'BOLAANGMONGONDAW': '7101',
        'BOLAANGMONGONDAWSELATAN': '7110',
        'BOLAANGMONGONDAWTIMUR': '7111',
        'KEPULAUANSITARO': '7108',
        'KEPSANGIHE': '7103',
    },
    '73': { 'PANGKAJENEKEPULAUAN': '7309' },
    '82': { 'KEPULAUANMOROTAI': '8207' },
    '94': {
        'MEMBRAMOTENGAH': '9431',
        'MEMBERAMORAYA': '9428',
    },
};

function toFloat(val) {
    if (val == null || typeof val === 'undefined') return null;
    const trimmed = String(val).trim();
    if (trimmed === '') return null;
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
}

function normalizeRecord(raw, provinsiId, provinsiName, kabMap, relaxedMap, overrides) {
    const rawKabName = raw.kabupaten_kota || '';
    const matchKey = normalizeForMatch(rawKabName);
    let kabupatenId = kabMap[matchKey] || null;

    if (!kabupatenId) {
        const relaxedKey = normalizeForRelaxedMatch(rawKabName);
        kabupatenId = relaxedMap[relaxedKey] || null;
    }

    if (!kabupatenId && overrides) {
        const relaxedKey = normalizeForRelaxedMatch(rawKabName);
        kabupatenId = overrides[relaxedKey] || null;
    }

    if (!kabupatenId) {
        console.warn(`[WARN] No kabupaten_id match for "${rawKabName}" (normalized: "${matchKey}") in province ${provinsiId}`);
    }

    return {
        npsn: (raw.npsn || '').trim(),
        sekolah: (raw.sekolah || '').trim(),
        bentuk: (raw.bentuk || '').trim().toUpperCase(),
        status: raw.status === 'N' ? 'negeri' : raw.status === 'S' ? 'swasta' : (raw.status || '').trim().toLowerCase(),
        provinsi_id: provinsiId,
        provinsi: provinsiName,
        kabupaten_id: kabupatenId,
        kabupaten: normalizeWilayahName(rawKabName),
        kecamatan: normalizeWilayahName(raw.kecamatan || ''),
        alamat: (raw.alamat_jalan || '').trim(),
        lintang: toFloat(raw.lintang),
        bujur: toFloat(raw.bujur),
    };
}

function buildKabMap(provinsiId) {
    const regenciesPath = path.join(WILAYAH_DIR, 'regencies', `${provinsiId}.json`);
    if (!fs.existsSync(regenciesPath)) {
        console.warn(`[WARN] No regencies file for province ${provinsiId}`);
        return { map: {}, relaxedMap: {}, raw: [] };
    }

    const regencies = JSON.parse(fs.readFileSync(regenciesPath, 'utf8'));
    const map = {};
    const relaxedMap = {};
    const raw = [];

    for (const reg of regencies) {
        const matchKey = normalizeForMatch(reg.name);
        const relaxedKey = normalizeForRelaxedMatch(reg.name);
        map[matchKey] = reg.id;
        relaxedMap[relaxedKey] = reg.id;
        raw.push({ api_name: reg.name, normalized: matchKey, kabupaten_id: reg.id });
    }

    return { map, relaxedMap, raw };
}

function processProvince(provinsiId, provinsiName) {
    const rawPath = path.join(RAW_DIR, `${provinsiId}.json`);
    if (!fs.existsSync(rawPath)) {
        console.warn(`[WARN] No raw data for province ${provinsiId}, skipping.`);
        return null;
    }

    console.log(`[START] Normalizing province ${provinsiId} (${provinsiName})...`);

    const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const { map: kabMap, relaxedMap, raw: kabRaw } = buildKabMap(provinsiId);
    const overrides = MANUAL_KAB_OVERRIDES[provinsiId] || null;

    const normalized = rawData.map((r) => normalizeRecord(r, provinsiId, provinsiName, kabMap, relaxedMap, overrides));

    const outPath = path.join(OUT_DIR, `${provinsiId}.json`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2), 'utf8');

    const kabMappingPath = path.join(MAPPING_KAB_DIR, `${provinsiId}.json`);
    fs.mkdirSync(MAPPING_KAB_DIR, { recursive: true });

    const kodeKabMapping = {};
    const seenKodeKab = new Set();
    for (const r of rawData) {
        const kodeKab = (r.kode_kab_kota || '').trim();
        if (kodeKab && !seenKodeKab.has(kodeKab)) {
            seenKodeKab.add(kodeKab);
            const matchKey = normalizeForMatch(r.kabupaten_kota);
            const relaxedKey = normalizeForRelaxedMatch(r.kabupaten_kota);
            const kabId = kabMap[matchKey] || relaxedMap[relaxedKey] || (overrides && overrides[relaxedKey]) || null;
            kodeKabMapping[kodeKab] = {
                kabupaten_id: kabId,
                api_name: (r.kabupaten_kota || '').trim(),
                normalized: normalizeWilayahName(r.kabupaten_kota),
            };
        }
    }
    fs.writeFileSync(kabMappingPath, JSON.stringify(kodeKabMapping, null, 2), 'utf8');

    console.log(`[DONE] Province ${provinsiId}: ${normalized.length} records → ${outPath}`);
    return { provinsi_id: provinsiId, count: normalized.length };
}

function main() {
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PROP, 'utf8'));
    const provinces = JSON.parse(fs.readFileSync(path.join(WILAYAH_DIR, 'provinces.json'), 'utf8'));

    const propIdToName = {};
    for (const p of provinces) {
        propIdToName[p.id] = p.name;
    }

    const provinsiIds = new Set(Object.values(mapping));
    const stats = [];

    for (const provinsiId of [...provinsiIds].sort()) {
        const provinsiName = normalizeWilayahName(propIdToName[provinsiId] || '');
        const result = processProvince(provinsiId, provinsiName);
        if (result) stats.push(result);
    }

    const totalSekolah = stats.reduce((sum, s) => sum + s.count, 0);
    console.log(`\nNormalization complete: ${stats.length} provinces, ${totalSekolah} total schools.`);
}

main();
