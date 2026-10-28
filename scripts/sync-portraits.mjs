import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const codexUrl = "https://zukan.inazuma.jp/en/chara_param/";
const assetHost = "dxi4wb638ujep.cloudfront.net";
const outputDirectory = join(process.cwd(), "public", "portraits");
const manifestPath = join(process.cwd(), "shared", "portraits.json");
const catalog = JSON.parse(await readFile(join(process.cwd(), "shared", "catalog.json"), "utf8"));
const variants = JSON.parse(await readFile(join(process.cwd(), "shared", "portrait-variants.json"), "utf8"));
const wanted = new Map(catalog.flatMap((squad) => squad.players.map((player) => [player.characterKey, player.name])));

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "ElevenForceCatalogSync/1.0 (non-commercial fan project)" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function mapLimit(values, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await worker(values[index], index);
    }
  });
  await Promise.all(runners);
}

function collectPortraits(html, portraits) {
  const pattern = /<source\s+type="image\/webp"\s+srcset="([^"]+)"[\s\S]*?<img\s+src="[^"]+"\s+alt="([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const name = decodeHtml(match[2].trim());
    if (!portraits.has(name)) portraits.set(name, match[1]);
  }
}

const firstPage = await fetchText(codexUrl);
const pageNumbers = [...firstPage.matchAll(/chara_param\/\?page=(\d+)/g)].map((match) => Number(match[1]));
const pageCount = Math.max(1, ...pageNumbers);
const portraitsByName = new Map();
collectPortraits(firstPage, portraitsByName);

const remainingPages = Array.from({ length: pageCount - 1 }, (_value, index) => index + 2);
await mapLimit(remainingPages, 4, async (page) => {
  const html = await fetchText(`${codexUrl}?page=${page}`);
  collectPortraits(html, portraitsByName);
  if (page % 10 === 0 || page === pageCount) console.log(`Indexed Codex page ${page}/${pageCount}`);
});

await mkdir(outputDirectory, { recursive: true });
const matches = [];
const missing = [];
for (const [characterKey, name] of wanted) {
  const source = portraitsByName.get(name);
  if (source) matches.push({ characterKey, name, source });
  else missing.push({ characterKey, name });
}

await mapLimit(matches, 8, async ({ characterKey, source }, index) => {
  const parsed = new URL(source);
  if (parsed.protocol !== "https:" || parsed.hostname !== assetHost || !parsed.pathname.endsWith(".webp")) {
    throw new Error(`Rejected portrait URL: ${source}`);
  }
  const response = await fetch(parsed, { headers: { "User-Agent": "ElevenForceCatalogSync/1.0 (non-commercial fan project)" } });
  if (!response.ok) throw new Error(`Portrait ${characterKey}: ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType !== "image/webp") throw new Error(`Portrait ${characterKey}: invalid content type ${contentType}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 1_000_000) throw new Error(`Portrait ${characterKey}: invalid size ${bytes.length}`);
  await writeFile(join(outputDirectory, `${characterKey}.webp`), bytes);
  if ((index + 1) % 100 === 0 || index + 1 === matches.length) console.log(`Downloaded ${index + 1}/${matches.length} portraits`);
});

// Named appearances override ambiguous name matches without overwriting other eras.
for (const { file, source } of new Map(Object.values(variants).map((variant) => [variant.file, variant])).values()) {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.hostname !== assetHost || !/^[a-z0-9-]+$/.test(file)) throw new Error("Rejected curated portrait");
  const response = await fetch(url);
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/webp")) throw new Error(`Invalid curated portrait: ${file}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 1_000_000 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") throw new Error(`Invalid WebP: ${file}`);
  await writeFile(join(outputDirectory, `${file}.webp`), bytes);
}
const expectedFiles = new Set([...matches.map(({ characterKey }) => `${characterKey}.webp`), ...Object.values(variants).map(({ file }) => `${file}.webp`)]);
for (const file of await readdir(outputDirectory)) {
  if (file.endsWith(".webp") && !expectedFiles.has(file)) {
    console.warn(`Unused portrait retained: ${file}`);
  }
}

await writeFile(manifestPath, `${JSON.stringify({
  source: codexUrl,
  syncedAt: new Date().toISOString(),
  keys: matches.map(({ characterKey }) => characterKey).sort(),
  missing,
}, null, 2)}\n`);

console.log(`Portrait sync complete: ${matches.length}/${wanted.size}; missing ${missing.length}.`);
if (missing.length) console.log(missing.map(({ name }) => name).join("\n"));
