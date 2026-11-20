// Generates src/generated.js: many prompts whose answers and rarity come from open data.
//   Answers  : Wikidata (CC0) via the public SPARQL endpoint
//   Rarity   : English Wikipedia page views over the last 60 days (MediaWiki action API, CC0)
// Idea: the better known something is, the more likely people are to name it. "Known" blends lasting fame
//       (how many language editions of Wikipedia have an article) with recent attention (page views, square-rooted
//       so a news spike cannot dominate):   weight = (sitelinks^2 * sqrt(views)) ^ EXPONENT.
//       Re-runnable; responses are cached in tools/cache.json.
// Run:  node tools/gen.mjs            (add --fresh to ignore the cache)
import fs from "node:fs";

const UA = "KrillionCloneBuilder/1.0 (hobby game data build script)";
const CACHE_FILE = "tools/cache.json";
const EXPONENT = 1.4;         // >1 sharpens the gap between popular and obscure answers
const MAX_ANSWERS = 220;       // answers kept per prompt
const FETCH_LIMIT = 200;      // items pulled per category before pageview lookup

const MIN_ITEMS = 14;         // drop categories with fewer valid answers than this

/* ---- categories: [id, noun phrase, SPARQL where-clause, min sitelinks, isPerson] ---- */
const occ = q => `?i wdt:P31 wd:Q5; wdt:P106 wd:${q}.`;
const CATS = [
  ["element", "chemical element", "?i wdt:P31 wd:Q11344.", 1],
  ["country", "country", "?i wdt:P31 wd:Q3624078.", 1],
  ["asia", "country in Asia", "?i wdt:P31 wd:Q3624078; wdt:P30 wd:Q48.", 1],
  ["europe", "country in Europe", "?i wdt:P31 wd:Q3624078; wdt:P30 wd:Q46.", 1],
  ["samerica", "country in South America", "?i wdt:P31 wd:Q3624078; wdt:P30 wd:Q18.", 1],
  ["capital", "capital city", "?c wdt:P31 wd:Q3624078; wdt:P36 ?i.", 1],
  ["bigcity", "city with over a million people", "?i wdt:P31/wdt:P279* wd:Q515; wdt:P1082 ?pop. FILTER(?pop>1000000)", 30],
  ["president", "US president", "?i wdt:P39 wd:Q11696.", 1, true],
  ["dogbreed", "dog breed", "?i wdt:P31 wd:Q39367.", 5],
  ["catbreed", "cat breed", "?i wdt:P31 wd:Q43577.", 3],
  ["videogame", "video game", "?i wdt:P31 wd:Q7889.", 30],
  ["film", "movie", "?i wdt:P31 wd:Q11424.", 40],
  ["tvshow", "TV show", "?i wdt:P31 wd:Q5398426.", 35],
  ["book", "famous book", "?i wdt:P31 wd:Q7725634.", 70],
  ["painting", "famous painting", "?i wdt:P31 wd:Q3305213.", 20],
  ["mountain", "mountain", "?i wdt:P31 wd:Q8502.", 60],
  ["river", "river", "?i wdt:P31 wd:Q4022.", 60],
  ["lake", "lake", "?i wdt:P31 wd:Q23397.", 50],
  ["island", "island", "?i wdt:P31 wd:Q23442.", 70],
  ["desert", "desert", "?i wdt:P31 wd:Q8514.", 35],
  ["currency", "currency", "?i wdt:P31 wd:Q8142.", 25],
  ["language", "language", "?i wdt:P31 wd:Q34770.", 70],
  ["sea", "sea", "?i wdt:P31 wd:Q165.", 30],
  ["website", "website", "?i wdt:P31 wd:Q35127.", 60],
  ["natpark", "national park", "?i wdt:P31 wd:Q46169.", 35],
  // (Pixar, Ghibli, Shakespeare, Beatles, Michael Jackson lists are too sparse in Wikidata: written by hand in src/prompts_extra.js)
  ["mcu", "Marvel Cinematic Universe movie", "?i wdt:P31 wd:Q11424; wdt:P179 wd:Q642878.", 3],
  ["nintendo", "Nintendo game", "?i wdt:P31 wd:Q7889; wdt:P123 wd:Q8093.", 8],
  ["religion", "religion", "?i wdt:P31 wd:Q9174.", 40],
  ["skyscraper", "skyscraper", "?i wdt:P31 wd:Q11303.", 30],
  ["airline", "airline", "?i wdt:P31 wd:Q46970.", 35],
  ["university", "university", "?i wdt:P31 wd:Q3918.", 40],
  ["footballclub", "football club", "?i wdt:P31 wd:Q476028.", 60],
  ["band", "band", "?i wdt:P31 wd:Q215380.", 40],
  ["dish", "dish", "?i wdt:P31 wd:Q746549.", 45],
  // [..., minSitelinks, isPerson, isTaxon]  (taxa get everyday names instead of Latin names)
  ["mammal", "mammal", "?i wdt:P171* wd:Q7377; wdt:P105 wd:Q7432.", 55, false, true],
  ["bird", "bird", "?i wdt:P171* wd:Q5113; wdt:P105 wd:Q7432.", 45, false, true],
  // Occupation lists in Wikidata are noisy for celebrities (one person can be "actor", "author", "painter"...),
  // so only categories whose members are clean are kept. Dropped after review: reptile (includes birds),
  // insect (query too heavy), bridge, actor, singer, author, poet, composer, painter, film director,
  // philosopher, basketball and tennis players.
  // Also dropped after review: museum, stadium, airport, operating system (junk results), and footballer,
  // mathematician, architect, chess player, inventor (celebrities listed under unrelated occupations).
  ["physicist", "physicist", occ("Q169470"), 80, true],
  ["astronaut", "astronaut", occ("Q11631"), 45, true],
  ["scientist", "scientist", occ("Q901"), 40, true],
];

/* ---- utilities ---- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let cache = { sparql: {}, views: {} };
if (!process.argv.includes("--fresh") && fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

async function sparql(query) {
  if (cache.sparql[query]) return cache.sparql[query];
  for (let t = 0; t < 4; t++) {
    try {
      const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(70000) });
      if (res.status === 429 || res.status >= 500) { await sleep(4000 * (t + 1)); continue; }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      cache.sparql[query] = j.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
      saveCache();
      return cache.sparql[query];
    } catch (e) { if (t === 3) throw e; await sleep(3000); }
  }
  throw new Error("sparql failed");
}
// Page views: the MediaWiki action API returns daily views (last 60 days) for up to 50 titles per request,
// which needs ~50x fewer requests than the per-article REST endpoint and avoids its strict rate limit.
async function fetchViews(titles) {
  const need = titles.filter(t => !(t in cache.views));
  for (let k = 0; k < need.length; k += 50) {
    const chunk = need.slice(k, k + 50);
    const url = "https://en.wikipedia.org/w/api.php?action=query&prop=pageviews&pvipdays=60&format=json&formatversion=2&titles=" + encodeURIComponent(chunk.join("|"));
    for (let t = 0; t < 6; t++) {
      try {
        await sleep(400);
        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
        if (res.status === 429 || res.status >= 500) { await sleep(4000 * (t + 1)); continue; }
        if (!res.ok) break;
        const j = await res.json();
        const norm = {}; for (const n of j.query.normalized || []) norm[n.to] = n.from;
        const sums = {};
        for (const p of j.query.pages || []) sums[p.title] = Object.values(p.pageviews || {}).reduce((s, v) => s + (v || 0), 0);
        for (const title of chunk) cache.views[title] = sums[title] ?? sums[Object.keys(norm).find(to => norm[to] === title)] ?? 0;
        break;
      } catch (e) { await sleep(2000); }
    }
    for (const title of chunk) if (!(title in cache.views)) cache.views[title] = 0;
  }
  saveCache();
}
const art = w => (/^[aeiou]/i.test(w) && !/^(uni|us |eu)/i.test(w) ? "an " : "a ") + w;
const fame = it => Math.pow(Math.pow(Math.max(it.sl || 1, 1), 2) * Math.sqrt(Math.max(it.views, 1)), EXPONENT);
const letters = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^the /, "").replace(/[^a-z]/g, "");
const surname = s => { const p = s.trim().split(/\s+/); return p[p.length - 1]; };
function rng(seed) { let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---- build one prompt from a set of items ---- */
function toPrompt(text, items) {
  const w = items.map(it => ({ ...it, w: fame(it) }));
  w.sort((a, b) => b.w - a.w);
  const top = w.slice(0, MAX_ANSWERS);
  const sum = top.reduce((s, x) => s + x.w, 0);
  const entries = top.map(x => {
    const wt = Math.max(0.001, +(x.w / sum * 1000).toFixed(3));
    return x.aliases.length ? [x.label, wt, x.aliases] : [x.label, wt];
  });
  return [text, entries];
}

/* ---- main ---- */
const prompts = [], report = [];
for (const [id, noun, where, minSl, person, taxon] of CATS) {
  // Query 1: items + English Wikipedia title (kept simple so the public endpoint answers fast)
  const q = `SELECT DISTINCT ?i ?l ?t ?sl WHERE {
  ${where} ?i wikibase:sitelinks ?sl. FILTER(?sl>=${minSl})
  ?i rdfs:label ?l. FILTER(LANG(?l)="en")
  ?art schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t.
} ORDER BY DESC(?sl) LIMIT ${FETCH_LIMIT}`;
  let rows;
  try { rows = await sparql(q); } catch (e) { report.push(`${id}: SPARQL FAILED (${e.message})`); continue; }
  // Query 2 (batched): alternative names, so "USA" or "Einstein" are accepted
  const alias = {};
  const ids = [...new Set(rows.map(r => r.i.split("/").pop()))];
  for (let k = 0; k < ids.length; k += 80) {
    const chunk = ids.slice(k, k + 80);
    try { for (const r of await sparql(`SELECT ?i ?a WHERE { VALUES ?i { ${chunk.map(x => "wd:" + x).join(" ")} } ?i skos:altLabel ?a. FILTER(LANG(?a)="en") }`)) (alias[r.i.split("/").pop()] ||= []).push(r.a); } catch (e) { /* aliases are optional */ }
  }
  // Query 2b (animals only): everyday names. Wikidata labels for species are Latin ("Orcinus orca").
  const common = {};
  if (taxon) for (let k = 0; k < ids.length; k += 80) {
    const chunk = ids.slice(k, k + 80);
    try { for (const r of await sparql(`SELECT ?i ?cn WHERE { VALUES ?i { ${chunk.map(x => "wd:" + x).join(" ")} } ?i wdt:P1843 ?cn. FILTER(LANG(?cn)="en") }`)) (common[r.i.split("/").pop()] ||= []).push(r.cn); } catch (e) { /* optional */ }
  }
  // clean + dedupe by label
  const byLabel = new Map();
  for (const r of rows) {
    const qid = r.i.split("/").pop();
    const cn = (common[qid] || []).filter(c => c.length <= 30).sort((a, b) => a.length - b.length);
    if (taxon && !cn.length) continue;   // no everyday name: players would not know it
    // Use the English Wikipedia article title as the name ("China", not "People's Republic of China").
    const label = (cn[0] || r.t || r.l).replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!label || label.length > 45 || /^Q\d+$/.test(label)) continue;
    const key = label.toLowerCase();
    const aliases = [...(alias[qid] || []), ...cn.slice(1), r.l].filter(a => a && a.length <= 40 && a.toLowerCase() !== key && /^[\x20-\x7eÀ-ɏ]+$/.test(a) && /[a-z]/i.test(a.normalize("NFD"))).slice(0, 7);  // Latin-script names only: players type on a Latin keyboard
    if (person) { const s = surname(label); if (s.length >= 3 && label.includes(" ")) aliases.push(s); }
    if (!byLabel.has(key)) byLabel.set(key, { label, aliases: [...new Set(aliases)], title: r.t, views: 0, sl: +r.sl });
  }
  const items = [...byLabel.values()];
  await fetchViews(items.map(it => it.title));
  for (const it of items) it.views = cache.views[it.title] || 0;
  console.log(`${id}: ${items.length} items done`);
  saveCache();
  if (items.length < MIN_ITEMS) { report.push(`${id}: only ${items.length} items, skipped`); continue; }
  const baseText = "Name " + art(noun);
  prompts.push(toPrompt(baseText, items));
  report.push(`${id}: ${items.length} items | top: ${items.slice().sort((a, b) => b.views - a.views).slice(0, 5).map(x => x.label + " (" + x.views + ")").join(", ")}`);

  /* hard variants built from the same list */
  const key = it => person ? letters(surname(it.label)) : letters(it.label);
  const r = rng(id), n = items.length, variants = [];
  const count = f => items.filter(f).length;
  const abc = "abcdefghijklmnopqrstuvwxyz".split("");
  const starts = abc.map(L => [L, count(it => key(it).startsWith(L))]).filter(([, c]) => c >= 10 && c <= n * 0.3);
  if (starts.length) { const L = starts[Math.floor(r() * starts.length)][0]; variants.push([`${baseText} ${person ? "whose surname starts with" : "starting with"} ${L.toUpperCase()}`, it => key(it).startsWith(L)]); }
  const rare = "zxqjvwkyfbh".split("").map(L => [L, count(it => key(it).includes(L))]).filter(([, c]) => c >= 10 && c <= n * 0.35);
  if (rare.length) { const L = rare[Math.floor(r() * rare.length)][0]; variants.push([`${baseText} ${person ? "with the letter " + L.toUpperCase() + " in their surname" : "containing the letter " + L.toUpperCase()}`, it => key(it).includes(L)]); }
  const ends = abc.map(L => [L, count(it => key(it).endsWith(L))]).filter(([, c]) => c >= 15 && c <= n * 0.4);
  if (ends.length && !person) { const L = ends[Math.floor(r() * ends.length)][0]; variants.push([`${baseText} ending in ${L.toUpperCase()}`, it => key(it).endsWith(L)]); }
  if (count(it => /(.)\1/.test(key(it))) >= 15 && count(it => /(.)\1/.test(key(it))) <= n * 0.5 && !person) variants.push([`${baseText} with a double letter in its name`, it => /(.)\1/.test(key(it))]);
  for (const [text, f] of variants.slice(0, 3)) {
    const sub = items.filter(f);
    if (sub.length >= 12) {
      // keep only variants with a healthy spread: no dominant answer and a genuinely rare tail
      const w = sub.map(fame), tot = w.reduce((s, v) => s + v, 0);
      const top = Math.max(...w) / tot * 100, low = Math.min(...w) / tot * 100;
      if (top > 45 || low > 1.5) { report.push(`  -> SKIPPED ${text} (top ${top.toFixed(0)}%, tail ${low.toFixed(1)}%)`); continue; }
      prompts.push(toPrompt(text, sub)); report.push(`  -> ${text} (${sub.length})`);
    }
  }
}

const out = "/* GENERATED by tools/gen.mjs from Wikidata + Wikipedia pageviews. Do not edit by hand. */\nP.push(...\n" + JSON.stringify(prompts) + "\n);\n";
fs.writeFileSync("src/generated.js", out);
fs.writeFileSync("tools/report.txt", report.join("\n") + "\n");
console.log(report.join("\n"));
console.log(`\n${prompts.length} prompts, ${(out.length / 1024).toFixed(0)} KB -> src/generated.js`);
