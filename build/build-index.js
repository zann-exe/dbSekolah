import fs from 'fs';
import path from 'path';

const PROV_DIR = path.resolve('data/provinsi');
const INDEX_DIR = path.resolve('data/index');
const WILAYAH_DIR = path.resolve('data/wilayah');

function main() {
    if (!fs.existsSync(PROV_DIR)) {
        console.error('data/provinsi/ not found. Run normalize first.');
        process.exit(1);
    }

    const files = fs.readdirSync(PROV_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
        console.error('No province data files found in data/provinsi/.');
        process.exit(1);
    }

    console.log(`Building index from ${files.length} province files...`);

    const byNpsn = {};
    const perProvinsi = {};
    let totalSekolah = 0;

    const provinces = JSON.parse(fs.readFileSync(path.join(WILAYAH_DIR, 'provinces.json'), 'utf8'));
    const propIdToName = {};
    for (const p of provinces) {
        propIdToName[p.id] = p.name;
    }

    for (const file of files.sort()) {
        const provinsiId = file.replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(PROV_DIR, file), 'utf8'));

        let count = 0;
        for (const sekolah of data) {
            if (sekolah.npsn && sekolah.npsn.trim() !== '') {
                byNpsn[sekolah.npsn] = {
                    provinsi_id: sekolah.provinsi_id,
                    kabupaten_id: sekolah.kabupaten_id,
                };
            }
            count++;
        }

        perProvinsi[provinsiId] = {
            nama: propIdToName[provinsiId] || '',
            jumlah: count,
        };
        totalSekolah += count;

        console.log(`  ${provinsiId}: ${count} schools`);
    }

    fs.mkdirSync(INDEX_DIR, { recursive: true });

    const byNpsnPath = path.join(INDEX_DIR, 'by-npsn.json');
    fs.writeFileSync(byNpsnPath, JSON.stringify(byNpsn, null, 0), 'utf8');
    console.log(`\nby-npsn.json: ${Object.keys(byNpsn).length} entries → ${byNpsnPath}`);

    const today = new Date().toISOString().slice(0, 10);
    const summary = {
        last_update: today,
        source: 'Fallback API (api-sekolah-indonesia.vercel.app)',
        total_sekolah: totalSekolah,
        per_provinsi: perProvinsi,
    };

    const summaryPath = path.join(INDEX_DIR, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`summary.json: ${totalSekolah} total schools → ${summaryPath}`);
}

main();
