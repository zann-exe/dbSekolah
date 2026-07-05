import fs from 'fs';
import path from 'path';

// Helper to normalize province name
function normalizeProvinceName(name) {
  return name
    .replace(/^Prov\.\s+/i, '')
    .replace(/^Provinsi\s+/i, '')
    .replace(/\./g, '') // e.g. D.K.I. -> DKI
    .trim()
    .toUpperCase();
}

async function run() {
  console.log('Loading Kemendagri provinces reference...');
  const refPath = path.resolve('data/wilayah/provinces.json');
  const refProvinces = JSON.parse(fs.readFileSync(refPath, 'utf8'));

  const provinceMap = {}; // Will map api_code -> kemendagri_id
  const nameToId = {};
  refProvinces.forEach(p => {
    const normalizedRef = normalizeProvinceName(p.name);
    nameToId[normalizedRef] = p.id;
  });

  // Special manual mappings if name normalization differs slightly
  const manualOverrides = {
    'DKI JAKARTA': '31',
    'DI YOGYAKARTA': '34',
    'BANGKA BELITUNG': '19',
  };

  console.log('Scanning API province codes (010000 - 400000)...');

  for (let i = 1; i <= 40; i++) {
    const code = String(i).padStart(2, '0') + '0000';
    const url = `https://api-sekolah-indonesia.vercel.app/sekolah?provinsi=${code}&perPage=1&page=1`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'success' && json.dataSekolah && json.dataSekolah.length > 0) {
        const rawName = json.dataSekolah[0].propinsi;
        const normalized = normalizeProvinceName(rawName);

        let kemendagriId = nameToId[normalized];
        if (!kemendagriId) {
          // Check manual overrides
          for (const key of Object.keys(manualOverrides)) {
            if (normalized.includes(key) || key.includes(normalized)) {
              kemendagriId = manualOverrides[key];
              break;
            }
          }
        }

        if (kemendagriId) {
          console.log(`Matched: ${code} (${rawName}) -> Kemendagri ID ${kemendagriId} (${normalized})`);
          provinceMap[code] = kemendagriId;
        } else {
          console.log(`⚠️ Warning: Unmatched province code ${code} (${rawName} / ${normalized})`);
        }
      }
    } catch (e) {
      console.log(`❌ Error scanning code ${code}: ${e.message}`);
    }

    // Throttle requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Output mapping to build/mapping-kode-prop.json
  const outputPath = path.resolve('build/mapping-kode-prop.json');
  fs.writeFileSync(outputPath, JSON.stringify(provinceMap, null, 2), 'utf8');
  console.log(`\nMapping successfully written to ${outputPath}`);
}

run().catch(console.error);
