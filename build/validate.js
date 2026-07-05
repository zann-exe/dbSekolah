import fs from 'fs';
import path from 'path';

const PROV_DIR = path.resolve('data/provinsi');
const INDEX_DIR = path.resolve('data/index');
const WILAYAH_DIR = path.resolve('data/wilayah');

const VALID_BENTUK = new Set([
    'SD', 'SMP', 'SMA', 'SMK', 'SLB',
    'SDLB', 'SMPLB', 'SMLB',
    'MI', 'MTS', 'MA', 'MAK',
    'TK', 'RA', 'PKBM', 'SKB',
]);

const REQUIRED_FIELDS = ['npsn', 'sekolah', 'bentuk', 'status', 'provinsi_id', 'provinsi', 'kabupaten_id', 'kabupaten', 'kecamatan', 'alamat'];

let errorCount = 0;
let warnCount = 0;
let totalRecords = 0;
let missingKabId = 0;
let invalidCoords = 0;
let invalidBentuk = 0;
let emptyFields = 0;
let invalidStatus = 0;
const npsnDuplicates = [];

function error(msg) {
    console.error(`❌ ERROR: ${msg}`);
    errorCount++;
}

function warn(msg) {
    console.warn(`⚠️  WARN: ${msg}`);
    warnCount++;
}

function loadProvinces() {
    return JSON.parse(fs.readFileSync(path.join(WILAYAH_DIR, 'provinces.json'), 'utf8'));
}

function loadRegencies(provinsiId) {
    const filePath = path.join(WILAYAH_DIR, 'regencies', `${provinsiId}.json`);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeForMatch(name) {
    if (!name) return '';
    return name
        .replace(/^Prov\.\s*/i, '')
        .replace(/^Provinsi\s+/i, '')
        .replace(/^Kab\.\s*/i, '')
        .replace(/^Kabupaten\s+/i, '')
        .replace(/^Kota\s+/i, '')
        .replace(/^Kec\.\s*/i, '')
        .replace(/^Kecamatan\s+/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function normalizeForRelaxedMatch(name) {
    if (!name) return '';
    return name
        .replace(/^Prov\.\s*/i, '')
        .replace(/^Provinsi\s+/i, '')
        .replace(/^Kab\.\s*/i, '')
        .replace(/^Kabupaten\s+/i, '')
        .replace(/^Kota\s+/i, '')
        .replace(/^Kec\.\s*/i, '')
        .replace(/^Kecamatan\s+/i, '')
        .replace(/\./g, '')
        .replace(/[\s-]+/g, '')
        .trim()
        .toUpperCase();
}

function main() {
    console.log('=== VALIDATION START ===\n');

    if (!fs.existsSync(PROV_DIR)) {
        error('data/provinsi/ not found. Run normalize first.');
        printReport();
        process.exit(1);
    }

    const files = fs.readdirSync(PROV_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
        error('No province data files found.');
        printReport();
        process.exit(1);
    }

    const provinces = loadProvinces();
    const provMap = {};
    for (const p of provinces) {
        provMap[p.id] = p;
    }

    const npsnSet = new Set();
    const wilayahNameVariants = {};

    for (const file of files.sort()) {
        const provinsiId = file.replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(PROV_DIR, file), 'utf8'));

        if (!provMap[provinsiId]) {
            error(`Province ID ${provinsiId} not found in provinces.json`);
        }

        const regencies = loadRegencies(provinsiId);
        const regencyMap = {};
        for (const r of regencies) {
            regencyMap[r.id] = r;
            const matchKey = normalizeForMatch(r.name);
            wilayahNameVariants[matchKey] = wilayahNameVariants[matchKey] || new Set();
            wilayahNameVariants[matchKey].add(r.name);
        }

        for (let i = 0; i < data.length; i++) {
            const r = data[i];
            totalRecords++;

            if (npsnSet.has(r.npsn)) {
                npsnDuplicates.push(r.npsn);
            } else {
                npsnSet.add(r.npsn);
            }

            if (!r.npsn || !/^\d{8}$/.test(r.npsn)) {
                warn(`[${provinsiId}] Record ${i}: Non-standard NPSN "${r.npsn}" (expected 8-digit numeric)`);
            }

            for (const field of REQUIRED_FIELDS) {
                if (r[field] == null || r[field] === '') {
                    if (field !== 'alamat') {
                        emptyFields++;
                        error(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): Required field "${field}" is empty`);
                    }
                }
            }

            if (r.kabupaten_id == null) {
                missingKabId++;
            } else if (!regencyMap[r.kabupaten_id]) {
                error(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): kabupaten_id "${r.kabupaten_id}" not found in regencies`);
            }

            if (r.provinsi_id && provMap[r.provinsi_id]) {
                const expectedProvName = provMap[r.provinsi_id].name;
                const relaxedExpected = normalizeForRelaxedMatch(expectedProvName);
                const relaxedActual = normalizeForRelaxedMatch(r.provinsi);
                if (relaxedExpected !== relaxedActual) {
                    warn(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): provinsi name mismatch — data: "${r.provinsi}" vs ref: "${expectedProvName}"`);
                }
            }

            if (r.kabupaten_id && regencyMap[r.kabupaten_id]) {
                const expectedKabName = regencyMap[r.kabupaten_id].name;
                const relaxedExpected = normalizeForRelaxedMatch(expectedKabName);
                const relaxedActual = normalizeForRelaxedMatch(r.kabupaten);
                if (relaxedExpected !== relaxedActual) {
                    warn(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): kabupaten name mismatch — data: "${r.kabupaten}" vs ref: "${expectedKabName}"`);
                }
            }

            if (r.lintang != null) {
                if (typeof r.lintang !== 'number' || r.lintang < -90 || r.lintang > 90) {
                    invalidCoords++;
                    warn(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): Invalid lintang ${r.lintang}`);
                }
            }
            if (r.bujur != null) {
                if (typeof r.bujur !== 'number' || r.bujur < -180 || r.bujur > 180) {
                    invalidCoords++;
                    warn(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): Invalid bujur ${r.bujur}`);
                }
            }

            if (r.bentuk && !VALID_BENTUK.has(r.bentuk)) {
                invalidBentuk++;
                warn(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): Unknown bentuk "${r.bentuk}"`);
            }

            if (r.status && r.status !== 'negeri' && r.status !== 'swasta') {
                invalidStatus++;
                warn(`[${provinsiId}] Record ${i} (NPSN ${r.npsn}): Unknown status "${r.status}"`);
            }
        }

        console.log(`  Validated ${provinsiId}: ${data.length} records`);
    }

    if (npsnDuplicates.length > 0) {
        warn(`Found ${npsnDuplicates.length} duplicate NPSNs (index will deduplicate): ${npsnDuplicates.slice(0, 10).join(', ')}${npsnDuplicates.length > 10 ? '...' : ''}`);
    }

    const indexPath = path.join(INDEX_DIR, 'by-npsn.json');
    if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const indexCount = Object.keys(index).length;
        if (indexCount !== npsnSet.size) {
            error(`Index count mismatch: by-npsn.json has ${indexCount} entries, but data has ${npsnSet.size} unique NPSNs`);
        }
        console.log(`  Index check: ${indexCount} entries in by-npsn.json`);
    } else {
        warn('data/index/by-npsn.json not found. Run build-index first.');
    }

    const summaryPath = path.join(INDEX_DIR, 'summary.json');
    if (fs.existsSync(summaryPath)) {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        if (summary.total_sekolah !== totalRecords) {
            error(`Summary total_sekolah (${summary.total_sekolah}) does not match actual record count (${totalRecords})`);
        }
        console.log(`  Summary check: ${summary.total_sekolah} total schools`);
    } else {
        warn('data/index/summary.json not found. Run build-index first.');
    }

    console.log('');
    printReport();

    if (errorCount > 0) {
        process.exit(1);
    }
}

function printReport() {
    console.log('=== VALIDATION REPORT ===');
    console.log(`Total records checked: ${totalRecords}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Warnings: ${warnCount}`);
    console.log(`Duplicate NPSNs: ${npsnDuplicates.length}`);
    console.log(`Missing kabupaten_id: ${missingKabId}`);
    console.log(`Invalid coordinates: ${invalidCoords}`);
    console.log(`Unknown bentuk: ${invalidBentuk}`);
    console.log(`Empty required fields: ${emptyFields}`);
    console.log(`Invalid status: ${invalidStatus}`);
    console.log('');

    if (errorCount === 0) {
        console.log('✅ VALIDATION PASSED — no errors.');
    } else {
        console.log('❌ VALIDATION FAILED — fix errors before publishing.');
    }
}

main();
