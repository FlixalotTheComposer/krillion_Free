// Data integrity tests for the prompt tables.  Run: node tests/data.test.mjs
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync("src/prompts.js", "utf8") + "\n" + ["src/generated.js", "src/prompts_extra.js"].map(f => fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "").join("\n");
const ctx = vm.createContext({});
vm.runInContext("var P = [];\n" + code.replace(/^const P = \[/m, "P.push(...[") .replace(/^\];\s*$/m, "]);"), ctx);
const P = ctx.P;

let fails = 0, checks = 0;
const fail = m => { fails++; if (fails <= 40) console.log("  FAIL:", m); };
const ok = (c, m) => { checks++; if (!c) fail(m); };
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/c\+\+/g, "cpp").replace(/([cfj])#/g, "$1sharp").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const letters = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^the /, "").replace(/[^a-z]/g, "");
const surname = s => { const p = s.trim().split(/\s+/); return p[p.length - 1]; };

console.log("prompts:", P.length);
ok(P.length >= 120, "expected at least 120 prompts, got " + P.length);

const seen = new Set();
let answers = 0, constrained = 0;
for (const p of P) {
  const [q, list] = p;
  ok(typeof q === "string" && q.startsWith("Name "), "bad prompt text: " + q);
  ok(!seen.has(q), "duplicate prompt text: " + q); seen.add(q);
  ok(Array.isArray(list) && list.length >= 8, `"${q}" has too few answers (${list && list.length})`);
  let total = 0; const keys = new Map();
  for (const e of list) {
    answers++;
    ok(typeof e[0] === "string" && e[0].trim().length > 0 && e[0].length <= 45, `"${q}": bad answer label ${JSON.stringify(e[0])}`);
    ok(Number.isFinite(e[1]) && e[1] > 0, `"${q}": bad weight for ${e[0]}`);
    ok(!/^Q\d+$/.test(e[0]), `"${q}": raw Wikidata id as label ${e[0]}`);
    ok(e[2] === undefined || (Array.isArray(e[2]) && e[2].every(a => typeof a === "string")), `"${q}": bad aliases for ${e[0]}`);
    total += e[1];
    const k = norm(e[0]);
    if (keys.has(k) && keys.get(k) !== e[0]) fail(`"${q}": two labels normalise to "${k}"`);
    keys.set(k, e[0]);
  }
  /* rarity spread: there must be some rare answers and not all weight on one item */
  const sorted = list.map(e => e[1] / total * 100).sort((a, b) => b - a);
  ok(sorted[0] < 70, `"${q}": top answer has ${sorted[0].toFixed(1)}% (too dominant)`);
  if (list.length >= 20) ok(sorted[sorted.length - 1] < 2, `"${q}": no rare tail (smallest ${sorted[sorted.length - 1].toFixed(2)}%)`);

  /* constraint prompts: every answer must satisfy the constraint in the prompt */
  let m;
  const person = /surname|their surname/.test(q);
  const keyOf = lab => person ? letters(surname(lab)) : letters(lab);
  let test = null;
  if ((m = q.match(/(?:starting with|whose surname starts with) ([A-Z])$/))) test = k => k.startsWith(m[1].toLowerCase());
  else if ((m = q.match(/containing the letter ([A-Z])$/)) || (m = q.match(/with the letter ([A-Z]) in their surname$/))) test = k => k.includes(m[1].toLowerCase());
  else if ((m = q.match(/ending in ([A-Z])$/))) test = k => k.endsWith(m[1].toLowerCase());
  else if (/with a double letter in its name$/.test(q)) test = k => /(.)\1/.test(k);
  if (test) {
    constrained++;
    for (const e of list) ok(test(keyOf(e[0])), `"${q}": answer "${e[0]}" violates the constraint`);
  }
}
console.log("answers:", answers, "| constrained prompts:", constrained);
ok(constrained >= 15, "expected at least 15 constrained (hard) prompts, got " + constrained);
const bytes = Buffer.byteLength(code);
console.log("prompt data size:", Math.round(bytes / 1024), "KB");
ok(bytes < 1.5 * 1024 * 1024, "prompt data too large for phones");

console.log(fails ? `\n${fails} FAILURES out of ${checks} checks` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
