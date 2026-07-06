import fs from 'fs';
import path from 'path';

const FORCE = process.argv.includes('--force');
const MAX_RETRIES = 5;
const SOURCE_URL = 'https://raw.githubusercontent.com/mzakiyuddin/daftar-perguruan-tinggi-indonesia/main/data/data.json';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            if (attempt === retries) throw e;
            const backoff = attempt * 1000;
            console.warn(`[Retry ${attempt}/${retries}] Failed to fetch ${url} due to "${e.message}". Retrying in ${backoff}ms...`);
            await sleep(backoff);
        }
    }
}

async function main() {
    const rawFile = path.resolve('raw-pt/pt.json');

    if (!FORCE && fs.existsSync(rawFile)) {
        try {
            const existing = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
            if (Array.isArray(existing) && existing.length > 0) {
                console.log(`[PASS] Raw PT data already exists with ${existing.length} records. Skipping. Use --force to re-fetch.`);
                return;
            }
        } catch (e) {
            console.log(`[WARN] Existing file ${rawFile} is corrupted. Re-fetching.`);
        }
    }

    console.log('[START] Fetching PT list from GitHub mirror...');
    const data = await fetchWithRetry(SOURCE_URL);

    if (!Array.isArray(data)) {
        throw new Error('Unexpected response format: expected array of PT records');
    }

    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[SUCCESS] Saved ${data.length} PT records to ${rawFile}`);
}

main().catch(console.error);
