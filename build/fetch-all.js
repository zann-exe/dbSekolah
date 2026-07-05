import fs from 'fs';
import path from 'path';

const FORCE = process.argv.includes('--force');
const CONCURRENCY_LIMIT = 5;
const DELAY_MS = 300; // delay between batches to respect rate limits
const MAX_RETRIES = 5;

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to fetch with retry & backoff
async function fetchWithRetry(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}`);
            }
            const json = await res.json();
            if (json.status !== 'success') {
                throw new Error(`API returned failure state: ${json.message || 'unknown'}`);
            }
            return json;
        } catch (e) {
            if (attempt === retries) throw e;
            const backoffCharge = attempt * 1000;
            console.warn(`[Retry ${attempt}/${retries}] Failed to fetch ${url} due to "${e.message}". Retrying in ${backoffCharge}ms...`);
            await sleep(backoffCharge);
        }
    }
}

// Concurrency runner
async function runConcurrent(tasks, limit) {
    const results = [];
    const executing = [];
    for (const task of tasks) {
        const p = Promise.resolve().then(() => task());
        results.push(p);
        if (limit <= tasks.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

async function fetchProvince(apiCode, provId) {
    const rawFile = path.resolve(`raw/${provId}.json`);

    if (!FORCE && fs.existsSync(rawFile)) {
        try {
            const existing = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
            if (Array.isArray(existing) && existing.length > 0) {
                console.log(`[PASS] Province ${provId} (API: ${apiCode}) already exists with ${existing.length} records. Skipping.`);
                return;
            }
        } catch (e) {
            console.log(`[WARN] Existing file for ${provId} is corrupted. Re-fetching.`);
        }
    }

    console.log(`[START] Fetching Province ${provId} (API: ${apiCode})...`);

    // 1. Fetch page 1 to get metadata and total page count
    const firstPageUrl = `https://api-sekolah-indonesia.vercel.app/sekolah?provinsi=${apiCode}&perPage=100&page=1`;
    const firstPageData = await fetchWithRetry(firstPageUrl);

    const totalData = firstPageData.total_data;
    const totalPages = Math.ceil(totalData / 100);

    console.log(`[INFO] Province ${provId} (API: ${apiCode}) has ${totalData} schools across ${totalPages} pages.`);

    let allSchools = [...(firstPageData.dataSekolah || [])];

    if (totalPages > 1) {
        const pageTasks = [];
        for (let p = 2; p <= totalPages; p++) {
            const pageUrl = `https://api-sekolah-indonesia.vercel.app/sekolah?provinsi=${apiCode}&perPage=100&page=${p}`;
            pageTasks.push(async () => {
                // Fetch and introduce brief sleep
                const data = await fetchWithRetry(pageUrl);
                await sleep(DELAY_MS);
                return data.dataSekolah || [];
            });
        }

        const remainingPagesData = await runConcurrent(pageTasks, CONCURRENCY_LIMIT);
        remainingPagesData.forEach(schools => {
            allSchools.push(...schools);
        });
    }

    // Save raw data
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, JSON.stringify(allSchools, null, 2), 'utf8');
    console.log(`[SUCCESS] Saved ${allSchools.length}/${totalData} schools for Province ${provId} to ${rawFile}`);
}

async function main() {
    const mappingPath = path.resolve('build/mapping-kode-prop.json');
    if (!fs.existsSync(mappingPath)) {
        console.error('mapping-kode-prop.json not found! Run build/map-provinces.js first.');
        process.exit(1);
    }

    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    const entries = Object.entries(mapping);

    console.log(`Starting fetch for ${entries.length} provinces...`);

    for (const [apiCode, provId] of entries) {
        try {
            await fetchProvince(apiCode, provId);
            // Wait between provinces
            await sleep(1000);
        } catch (e) {
            console.error(`❌ [ERROR] Failed to fetch Province ${provId} (API: ${apiCode}):`, e.message);
            console.log('Halting process. You can rerun the command to resume downloading.');
            process.exit(1);
        }
    }

    console.log('All provinces downloaded successfully!');
}

main().catch(console.error);
