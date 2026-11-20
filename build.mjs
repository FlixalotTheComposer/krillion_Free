// Builds the single-file game: node build.mjs  ->  index.html
// Prompt data = hand-written src/prompts.js + generated src/generated.js (from tools/gen.mjs), if present.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const tpl = readFileSync("src/template.html", "utf8");
let data = readFileSync("src/prompts.js", "utf8");
// extra hand-written prompts go last (they use P.push, so they must come after the data above)
for (const f of ["src/generated.js", "src/prompts_extra.js"]) if (existsSync(f)) data += "\n" + readFileSync(f, "utf8");
writeFileSync("index.html", tpl.replace("/*__DATA__*/", () => data));
console.log("built index.html (" + Math.round(data.length / 1024) + " KB of prompt data)");
