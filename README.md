# Krillion (clone)

A fan-made clone of the daily trivia game Krillion: answer a prompt, and the **rarer** your answer, the deeper you dive. Reach 7,000 m in 7 rounds (25 seconds each). Miss three times and your hull is breached.

**Play in the browser (works on iPhone and Android):** https://flixalotthecomposer.github.io/krillion_Free/
On iPhone use Safari, then Share > Add to Home Screen.

## Features
- Pixel-art ocean that scrolls as you sink: sunlight, twilight, midnight, abyssal and hadal zones, creatures, marine snow, a boat on the surface.
- 5 colour themes (Deep Blue, Sunset Reef, Neon Abyss, Gameboy, Kelp Forest).
- Sound effects and an ambient drone generated in code (Web Audio), with a mute button.
- 140+ prompts, including hard ones with letter rules ("a mountain containing the letter K").
- Daily dive (same prompts for everyone each day, one per day) and random dive.
- **Two rule sets** (pick on the menu): **Classic**, where a wrong answer lets you retry the same prompt until the clock runs out (each retry costs 10% of the depth) with spelling correction and "did you mean" suggestions; and **One Shot**, one try per prompt with hull hearts (three misses end the dive). Scores and the daily dive are tracked separately for each.
- **Endless AI** (Qwen desktop edition only): Qwen writes new prompts forever with ranked answers, one-shot rules, until your hull is breached.

## Two desktop downloads (Releases page)
| File | What it is |
|---|---|
| `Krillion.exe` | The standard game in its own window. Nothing else needed. |
| `Krillion-Qwen.exe` | Same game plus a **local AI judge**. Answers that are not on the data lists are checked by your own Qwen model through [Ollama](https://ollama.com). Nothing leaves your computer. |

For the Qwen edition: install Ollama, run `ollama pull qwen3:8b`, keep Ollama running, then start the app. The title screen shows "QWEN AI JUDGE ONLINE" when it is connected. If Ollama is missing the game still works like the standard edition. A valid answer the judge accepts counts as a very rare answer (it is not on the popularity lists by definition).
Windows may warn about an unknown publisher because the files are not code-signed (More info > Run anyway).

## Where the rarity comes from
Rarity is not guessed for most prompts. `tools/gen.mjs` builds it from open data:
- **Valid answers and alternative names:** Wikidata (CC0).
- **Popularity:** how many Wikipedia language editions cover each answer, plus recent English Wikipedia page views (Wikimedia, CC0). The better known an answer, the more often people are assumed to say it, so lesser-known answers sink you deeper.
- A handful of prompts (`src/prompts.js`, `src/prompts_extra.js`) are hand-written estimates.
These numbers model popularity, not what real players typed, so they will feel a little different from the original game.

## Develop
```
node tools/gen.mjs            # regenerate src/generated.js from Wikidata/Wikipedia (cached in tools/cache.json)
node build.mjs                # build the single-file index.html from src/template.html + the prompt files
node tests/data.test.mjs      # data integrity tests (answers, weights, letter-rule prompts)
powershell -File desktop/build_exe.ps1   # build both Windows executables into dist/
```
All code, art and sounds are original; nothing is copied from the original game.
