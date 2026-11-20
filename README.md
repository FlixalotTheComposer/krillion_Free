# Krillion (clone)

A fan-made clone of the daily trivia game Krillion: answer a prompt, and the **rarer** your answer, the deeper you dive. Reach 7,000 m in 7 rounds (25 seconds each).

- Pixel-art ocean that scrolls as you sink: sunlight, twilight, midnight, abyssal and hadal zones, creatures, marine snow, a boat on the surface.
- 5 colour themes (Deep Blue, Sunset Reef, Neon Abyss, Gameboy, Kelp Forest).
- Sound effects and ambient drone generated in code (Web Audio), with a mute button.
- 35 prompts with hand-written answer-frequency tables (estimates, not real player data).
- Daily dive (same prompts for everyone each day, one per day) and random dive.
- Works on phones (iOS Safari: use Share > Add to Home Screen) and as a Windows `.exe`.

All code, art and sounds are original; nothing is copied from the original game.

## Develop
Edit `src/template.html` (game) or `src/prompts.js` (prompts), then run `node build.mjs` to produce the single-file `index.html`.
