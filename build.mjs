// Builds the single-file game: node build.mjs  ->  index.html
import { readFileSync, writeFileSync } from "node:fs";
const tpl = readFileSync("src/template.html", "utf8");
const data = readFileSync("src/prompts.js", "utf8");
writeFileSync("index.html", tpl.replace("/*__DATA__*/", () => data));
console.log("built index.html");
