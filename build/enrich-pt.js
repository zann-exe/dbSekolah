/**
 * Enrich normalized PT data with detail from PDDikti API wrapper.
 * Prioritizes kabupaten/kota, also captures alamat, koordinat, akreditasi, status.
 *
 * API flow: search by name -> get detail by search ID.
 * Results are cached so the script can resume safely.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PT_DIR = path.join(__dirname, '..', 'data', 'perguruan-tinggi');
const ALL_PT_PATH = path.join(PT_DIR, 'all-pt.json');
const CACHE_PATH = path.join(__dirname, '..', 'raw-pt', 'enrichment-cache.json');
const REGENCIES_DIR = path.join(__dirname, '..', 'data', 'wilayah', 'regencies');
const API_BASE = 'https://pddikti.fastapicloud.dev/api';
const MAX_RETRIES = 4;
const CONCURRENCY = 2; // parallel requests (low to avoid upstream PDDikti timeouts)
const CACHE_SAVE_INTERVAL = 50;
const REQUEST_DELAY_MS = 1000; // delay between individual API calls

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      return loadJson(CACHE_PATH);
    } catch (e) {
      console.warn('Cache corrupt, starting fresh');
    }
  }
  return { search: {}, detail: {}, kabupatenMap: {} };
}

function saveCache(cache) {
  saveJson(CACHE_PATH, cache);
}

function loadRegencyMap() {
  const map = {};
  if (!fs.existsSync(REGENCIES_DIR)) return map;

  const files = fs.readdirSync(REGENCIES_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const provinceId = file.replace('.json', '');
    const regencies = loadJson(path.join(REGENCIES_DIR, file));
    for (const r of regencies) {
      // Build normalized name -> id mapping
      const normalized = (r.name || '')
        .toUpperCase()
        .replace(/^KAB(?:UPATEN)?\s+/i, '')
        .replace(/^KOTA\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalized) {
        map[normalized] = r.id;
        // Also store with prefix
        map[`KAB ${normalized}`] = r.id;
        map[`KABUPATEN ${normalized}`] = r.id;
        map[`KOTA ${normalized}`] = r.id;
      }
      // Store full name too
      map[(r.name || '').toUpperCase().trim()] = r.id;
    }
  }
  return map;
}

function normalizeEmptyValue(value) {
  if (!value) return '';
  const normalized = value.toString().trim();
  if (normalized.toUpperCase() === 'TIDAK DIISI') return '';
  return normalized;
}

function mapKabupatenName(name, regencyMap) {
  if (!name) return '';
  const normalized = name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Direct match
  if (regencyMap[normalized]) return regencyMap[normalized];

  // Strip common prefixes and suffixes
  const stripped = normalized
    .replace(/^KAB(?:UPATEN)?\s+/i, '')
    .replace(/^KOTA\s+/i, '')
    .replace(/\s+$/i, '')
    .trim();
  if (regencyMap[stripped]) return regencyMap[stripped];

  // Try adding "KOTA" prefix if not already there
  if (!normalized.startsWith('KOTA') && !normalized.startsWith('KAB')) {
    if (regencyMap[`KOTA ${stripped}`]) return regencyMap[`KOTA ${stripped}`];
  }

  return '';
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      await sleep(REQUEST_DELAY_MS); // polite delay between requests
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'dbSekolah-enricher/1.0'
        }
      });
      if (res.status === 429 || res.status === 408 || res.status === 503) {
        const backoff = Math.min(60000, 3000 * (i + 1));
        console.warn(`  ${res.status} rate limit/timeout, backing off ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      const backoff = Math.min(30000, 1500 * (i + 1));
      console.warn(`  Retry ${i + 1}/${retries}: ${err.message} (backoff ${backoff}ms)`);
      await sleep(backoff);
    }
  }
  throw new Error('Max retries exceeded');
}

async function searchPt(pt, cache) {
  const cacheKey = pt.kode_pt || pt.nama_pt;
  if (cache.search[cacheKey]) return cache.search[cacheKey];

  // Try search by kode_pt first (faster and more precise)
  let url = `${API_BASE}/search/pt/${encodeURIComponent(pt.kode_pt)}`;
  let data = await fetchWithRetry(url);
  if (!Array.isArray(data)) data = [];

  let match = data.find(item => String(item.kode).trim() === String(pt.kode_pt).trim());

  // Fallback to search by name if kode not found
  if (!match && data.length === 0) {
    url = `${API_BASE}/search/pt/${encodeURIComponent(pt.nama_pt)}`;
    data = await fetchWithRetry(url);
    if (!Array.isArray(data)) data = [];
    match = data.find(item => String(item.kode).trim() === String(pt.kode_pt).trim())
      || data.find(item => item.nama && item.nama.toUpperCase() === pt.nama_pt.toUpperCase())
      || data[0];
  }

  if (match) cache.search[cacheKey] = match;
  return match || null;
}

async function getDetail(searchId, cache) {
  if (cache.detail[searchId]) return cache.detail[searchId];

  const url = `${API_BASE}/pt/detail/${encodeURIComponent(searchId)}/`;
  const data = await fetchWithRetry(url);
  if (!data || typeof data !== 'object') return null;
  cache.detail[searchId] = data;
  return data;
}

async function enrichPt(pt, cache, regencyMap) {
  // Skip if already enriched with kabupaten
  if (pt.kabupaten && pt.kabupaten.trim()) return pt;

  try {
    const searchResult = await searchPt(pt, cache);
    if (!searchResult) return pt;

    const detail = await getDetail(searchResult.id, cache);
    if (!detail || !detail.kab_kota_pt) return pt;

    const kabupatenName = normalizeEmptyValue(detail.kab_kota_pt);
    let kabupatenId = mapKabupatenName(kabupatenName, regencyMap);

    // If we have kabupaten_id from cache mapping, use it
    if (!kabupatenId && cache.kabupatenMap[kabupatenName]) {
      kabupatenId = cache.kabupatenMap[kabupatenName];
    }
    if (kabupatenId) {
      cache.kabupatenMap[kabupatenName] = kabupatenId;
    }

    return {
      ...pt,
      kabupaten_id: kabupatenId || '',
      kabupaten: kabupatenName || '',
      kecamatan: normalizeEmptyValue(detail.kecamatan_pt),
      alamat: normalizeEmptyValue(detail.alamat),
      lintang: detail.lintang_pt || null,
      bujur: detail.bujur_pt || null,
      akreditasi: normalizeEmptyValue(detail.akreditasi_pt),
      status_milik: normalizeEmptyValue(detail.kelompok) || pt.kelompok || '',
      pembina: normalizeEmptyValue(detail.pembina),
      status_aktif: normalizeEmptyValue(detail.status_pt)
    };
  } catch (err) {
    console.warn(`  Failed to enrich ${pt.kode_pt}: ${err.message}`);
    return pt;
  }
}

function saveProvinceFiles(allPt) {
  const byProvince = {};
  for (const pt of allPt) {
    byProvince[pt.provinsi_id] = byProvince[pt.provinsi_id] || [];
    byProvince[pt.provinsi_id].push(pt);
  }

  for (const [provinceId, items] of Object.entries(byProvince)) {
    const filePath = path.join(PT_DIR, `${provinceId}.json`);
    saveJson(filePath, items);
  }

  // Clean stale files
  const existingFiles = fs.readdirSync(PT_DIR).filter(f => /^\d+\.json$/.test(f));
  const validIds = new Set(Object.keys(byProvince));
  for (const f of existingFiles) {
    const provinceId = f.replace('.json', '');
    if (!validIds.has(provinceId)) {
      fs.unlinkSync(path.join(PT_DIR, f));
    }
  }
}

async function processBatch(items, allPt, offset, cache, regencyMap, stats) {
  const results = await Promise.all(
    items.map(async (pt, batchIdx) => {
      const globalIndex = offset + batchIdx;
      const hasKabupaten = pt.kabupaten && pt.kabupaten.trim();

      if (hasKabupaten) {
        stats.skipped++;
        return { index: globalIndex, pt, enriched: false };
      }

      try {
        const result = await enrichPt(pt, cache, regencyMap);
        const gotKabupaten = result.kabupaten && result.kabupaten.trim();
        if (gotKabupaten) {
          stats.enriched++;
        } else {
          stats.failed++;
        }
        return { index: globalIndex, pt: result, enriched: gotKabupaten };
      } catch (err) {
        stats.failed++;
        return { index: globalIndex, pt, enriched: false };
      }
    })
  );

  // Apply results
  for (const { index, pt: result } of results) {
    allPt[index] = result;
  }
}

async function main() {
  console.log('Loading PT data...');
  const allPt = loadJson(ALL_PT_PATH);
  const cache = loadCache();
  const regencyMap = loadRegencyMap();

  // Parse command line options
  const args = process.argv.slice(2);
  const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1], 10) || 0;
  const offset = parseInt(args.find(a => a.startsWith('--offset='))?.split('=')[1], 10) || 0;
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1], 10) || CONCURRENCY;

  let toProcess = allPt.slice(offset);
  if (batchSize > 0) toProcess = toProcess.slice(0, batchSize);

  if (force) {
    toProcess = toProcess.map(pt => ({ ...pt, kabupaten: '' }));
  }

  const alreadyEnriched = allPt.filter(p => p.kabupaten && p.kabupaten.trim()).length;
  console.log(`Total PT: ${allPt.length}, batch: ${toProcess.length}, offset: ${offset}`);
  console.log(`Already enriched: ${alreadyEnriched}`);
  console.log(`Concurrency: ${concurrency}`);

  const stats = { enriched: 0, failed: 0, skipped: 0 };
  const startTime = Date.now();

  // Process in concurrent batches
  for (let i = 0; i < toProcess.length; i += concurrency) {
    const batch = toProcess.slice(i, i + concurrency);
    const batchOffset = offset + i;

    await processBatch(batch, allPt, batchOffset, cache, regencyMap, stats);

    const processed = Math.min(i + concurrency, toProcess.length);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processed / (elapsed || 1)).toFixed(1);
    const totalEnrichedNow = allPt.filter(p => p.kabupaten && p.kabupaten.trim()).length;
    console.log(`[${offset + processed}/${allPt.length}] ${elapsed}s elapsed, ${rate} PT/s, enriched=${stats.enriched} failed=${stats.failed} skipped=${stats.skipped} | total with kab=${totalEnrichedNow}`);

    // Save cache periodically
    if (processed % CACHE_SAVE_INTERVAL < concurrency) {
      saveCache(cache);
    }
  }

  saveCache(cache);

  if (!dryRun) {
    saveJson(ALL_PT_PATH, allPt);
    saveProvinceFiles(allPt);
    console.log('\nSaved all-pt.json and per-province files.');
  } else {
    console.log('\nDry run — no files saved.');
  }

  const totalEnriched = allPt.filter(p => p.kabupaten && p.kabupaten.trim()).length;
  const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSummary: enriched=${stats.enriched}, failed=${stats.failed}, skipped=${stats.skipped}, time=${elapsedTotal}s`);
  console.log(`Total PT with kabupaten: ${totalEnriched}/${allPt.length} (${(totalEnriched / allPt.length * 100).toFixed(1)}%)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
