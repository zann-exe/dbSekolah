import fs from 'fs';
import path from 'path';

const dataDir = path.resolve('data/perguruan-tinggi');
const indexDir = path.resolve('data/index');
const allPtFile = path.join(dataDir, 'all-pt.json');
const indexFile = path.join(indexDir, 'pt-by-kode.json');

const provinces = JSON.parse(fs.readFileSync(path.resolve('data/wilayah/provinces.json'), 'utf8'));
const validProvIds = new Set(provinces.map(p => p.id));

let exitCode = 0;

function fail(msg) {
    console.error('❌', msg);
    exitCode = 1;
}

function warn(msg) {
    console.warn('⚠️', msg);
}

function check(condition, msg) {
    if (!condition) fail(msg);
}

function main() {
    console.log('[VALIDATE] Starting PT data validation...');

    // 1. Check all-pt.json exists
    check(fs.existsSync(allPtFile), `Missing ${allPtFile}`);

    const allPt = JSON.parse(fs.readFileSync(allPtFile, 'utf8'));
    check(Array.isArray(allPt), 'all-pt.json must be an array');
    check(allPt.length > 0, 'all-pt.json is empty');
    console.log(`[INFO] Total PT records: ${allPt.length}`);

    // 2. Check required fields
    const requiredFields = ['kode_pt', 'nama_pt', 'bentuk_pt', 'status', 'provinsi_id', 'provinsi'];
    const missingFields = [];
    for (const r of allPt) {
        for (const f of requiredFields) {
            if (r[f] === undefined || r[f] === null) {
                missingFields.push(`${r.kode_pt || 'unknown'}.${f}`);
            }
        }
    }
    check(missingFields.length === 0, `Missing required fields: ${missingFields.slice(0, 10).join(', ')}${missingFields.length > 10 ? '...' : ''}`);

    // 3. Check duplicate kode_pt
    const kodeCounts = {};
    for (const r of allPt) {
        kodeCounts[r.kode_pt] = (kodeCounts[r.kode_pt] || 0) + 1;
    }
    const duplicates = Object.entries(kodeCounts).filter(([k, v]) => v > 1);
    check(duplicates.length === 0, `Duplicate kode_pt found: ${duplicates.slice(0, 5).map(([k, v]) => `${k} (${v}x)`).join(', ')}`);

    // 4. Check province IDs
    const invalidProv = [];
    const unmapped = [];
    for (const r of allPt) {
        if (r.provinsi_id && !validProvIds.has(r.provinsi_id)) {
            invalidProv.push(r.kode_pt);
        }
        if (!r.provinsi_id) {
            unmapped.push(r.kode_pt);
        }
    }
    check(invalidProv.length === 0, `Invalid province IDs: ${invalidProv.slice(0, 10).join(', ')}`);
    if (unmapped.length > 0) {
        warn(`${unmapped.length} PT records without province mapping`);
    }

    // 5. Check per-province files
    const byProvince = {};
    for (const r of allPt) {
        if (r.provinsi_id) {
            if (!byProvince[r.provinsi_id]) byProvince[r.provinsi_id] = [];
            byProvince[r.provinsi_id].push(r);
        }
    }

    let missingFiles = 0;
    for (const provId of Object.keys(byProvince)) {
        const file = path.join(dataDir, `${provId}.json`);
        if (!fs.existsSync(file)) {
            fail(`Missing per-province file ${file}`);
            missingFiles++;
        }
    }

    if (missingFiles === 0) {
        console.log(`[INFO] Per-province files: ${Object.keys(byProvince).length}`);
    }

    // 6. Check index file
    check(fs.existsSync(indexFile), `Missing index file ${indexFile}`);
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    check(Object.keys(index).length === allPt.length, `Index mismatch: ${Object.keys(index).length} vs ${allPt.length}`);
    for (const r of allPt) {
        if (!index[r.kode_pt]) {
            fail(`Missing index entry for ${r.kode_pt}`);
        }
    }

    // 7. Summary distribution
    console.log('\n[DISTRIBUTION] Top provinces by PT count:');
    const dist = Object.entries(byProvince)
        .map(([id, list]) => ({ id, name: list[0].provinsi, count: list.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    for (const d of dist) {
        console.log(`  ${d.name}: ${d.count}`);
    }

    if (exitCode === 0) {
        console.log('\n✅ PT validation passed');
    } else {
        console.log('\n❌ PT validation failed');
    }

    process.exit(exitCode);
}

main();
