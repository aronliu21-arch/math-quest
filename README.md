# MATH QUEST · 數學大冒險

A bilingual (English / 繁體中文) fantasy adventure game that teaches **division (除法)** and **fractions (分數)**. Kids explore four worlds, calm monsters, solve hands-on puzzles, collect and evolve pets, decorate a home, and team up online with friends.

It runs in Safari on iPad, on phones, and in desktop browsers. There is nothing to install, no login, no ads and no purchases.

## Play it locally (2 minutes)

You need Node.js 18 or newer.

```bash
npm start              # → http://localhost:8080
```

Single-player works right away. Team play also works on the same home Wi-Fi: on the iPad, open `http://<your-computer's-LAN-IP>:8080`.

## What's in the game

| Area | What it does |
|---|---|
| **Profiles** | Several kids on one device. Each has their own hero look, pets, XP, coins, gems, achievements, language, and learning record. Saved in IndexedDB on that device. |
| **Bilingual** | Every menu, question, hint, explanation and reward is in English and Traditional Chinese (Taiwan wording). Optional zhuyin (注音) appears beside the Chinese, using the open-source *Bpmf Huninn* font. Narration uses the device's `zh-TW` and `en-US` voices. |
| **4 worlds** | Division Village 除法村, Fraction Forest 分數森林, Math Kingdom 數學王國 (unlocks at hero level 3), Legendary Math Dimension 傳說數學次元 (unlocks at hero level 8, or once either skill reaches Advanced). |
| **7 modes** | Map exploration with branching paths · monster battles and boss battles · drag-and-drop puzzles · treasure hunts · optional timed challenges (parents can switch these off) · home building with fraction "builder challenges" · daily mystery missions |
| **28 concepts** | Beginner: equal sharing, facts to 20, grouping, naming and building fractions, numerator/denominator. Intermediate: facts to 100, remainders, word problems, sharing with leftovers, equivalent fractions, comparing, number lines, adding and subtracting with the same denominator. Advanced: long division (with and without remainders), multi-step problems, simplifying, mixed numbers, different denominators, ordering. Combined: fraction of a number, division as a fraction, division as a mixed number, legendary multi-step problems. |
| **Adaptive** | Division and fractions are tracked separately. The rating moves with accuracy, response time and hint use. Moving **up** a level requires ≥80% first-try accuracy over 10 questions **and** at least 2 separate sessions. Moving down only happens after sustained difficulty (<50% over 8 questions). After a miss, the next question is an easier one on the same concept. Questions the child has already seen are avoided. |
| **Help, never shame** | Each question gets two tries. After the first miss: encouragement ("Let's try another way!", 每一次嘗試，都是進步！) plus a hint. After the second: the answer with step-by-step "smaller steps", then an easier follow-up. Common mistakes, such as adding the denominators, get specific advice. |
| **Rewards** | XP and hero levels · coins · gems · treasure chests · 12 costumes and capes · 5 pieces of equipment with small bonuses · 12 pets (common, rare, legendary) with 3 evolution stages · 24 achievements · a decoratable home. Persistence is rewarded too. |
| **Replayability** | Every expedition map is generated fresh with branches, random events (magic fountain, lost pet, mysterious door, traveling merchant), a hidden secret level, and an Easter egg. Questions are randomized from validated templates; the test suite produces thousands of distinct questions per concept. |
| **Parent area** | A gate (3-digit × 2-digit multiplication; a wrong answer gives a new question). Per-child dashboard: time played, accuracy, first-try accuracy, mastery for every division and fraction concept, mastered concepts, areas needing practice, a 14-day history chart, suggested goals. Parents can set levels manually, change hint and break settings, turn timed challenges off, reset selected children, or delete a hero. |
| **Break reminders** | Off by default. Parents can turn on a "Great practice! Time for a break" screen after 2–6 missions in a row. |
| **Team play** | 2–4 players on separate devices. Private rooms with 6-character codes and a QR code. Four co-op modes: boss battle (shared HP bar, individual damage shown), treasure hunt (each correct answer lets you dig one spot), relay (take turns), and build together (each correct answer places a castle block). Each player gets questions at their own level. A team bonus applies when everyone contributes. |
| **Offline** | After the first visit, a service worker caches the game, so single-player works with no internet. Team play needs internet. |

## Deploy for online access

### 1. Host the game (free, static)

Any static host with HTTPS works. HTTPS is required for offline mode and "Add to Home Screen".

**GitHub Pages:** this repo includes `.github/workflows/pages.yml`, which runs the tests and publishes the game on every push to `main`. One-time setup: Settings → Pages → *Source: GitHub Actions*. The game is then served at `https://<user>.github.io/<repo>/`.

Pages on a **private** repository needs a paid GitHub plan (Pro, Team or Enterprise). On the free plan, the repository must be public. Keep the kids' names out of the code: names are typed on each device and saved only there.

Netlify, Cloudflare Pages and Vercel also work: point them at the repository root. There is no build step.

On the iPad, open the link in Safari, then tap Share → **Add to Home Screen**. The game then opens full-screen like an app.

### 2. Turn on team play across different networks (free Supabase project)

The static site alone gives you single-player. For kids in different houses or on different Wi-Fi networks, add the Supabase backend:

1. Create a free project at <https://supabase.com>. Children need no account; only you do.
2. Install the Supabase CLI, then run from this folder:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push                      # creates the rooms tables
   npm run sync-shared                   # copies the game logic into the function
   supabase functions deploy room        # the authoritative game server
   ```
3. In the Supabase dashboard, open Project Settings → API. Copy the **Project URL** and the **anon public** key into `js/config.js`:
   ```js
   export const MP_CONFIG = { supabaseUrl: 'https://xxxx.supabase.co', supabaseAnonKey: 'eyJ...', devApi: '' };
   ```
   The anon key is meant to be public. **Never** put the `service_role` key in the website.
4. Commit and redeploy the static site.

**How it stays secure:**
- The Edge Function is the only thing that reads or writes rooms. Both tables have row-level security turned on with no public policies.
- Answers are generated and checked on the server and never sent to clients before they answer.
- Boss damage, treasure, relay turns and all rewards are computed on the server.
- Player tokens are stored only as SHA-256 hashes.
- Inputs are sanitized.
- Rooms expire after 6 hours.
- Live state goes out on a Realtime Broadcast channel named after the room code. Clients also poll every few seconds, so a dropped live connection recovers on its own.
- Reconnecting with the same device's token (or re-opening the QR link) puts the player back into the game.

**Privacy:** players in a room see each other's hero name and avatar. Nothing else leaves the device. There is no email and no registration.

## Tests

```bash
npm test        # question engine (≈74,000 checks), server room logic (43 checks), shared-copy check
npm run e2e     # headless Chromium: 34 single-player checks + 10 two-device multiplayer checks
```

The e2e suites start their own server and save screenshots to `test-output/`.

- **Question engine:** for every concept and difficulty tier, the tests generate thousands of questions. They re-check each answer with an independent fraction evaluator, and make sure every multiple-choice set has exactly one correct option and no "equal-value" trick options. They also check that every prompt, hint and step has both languages, and that each concept has enough variety.
- **Multiplayer:** two separate browser contexts (separate devices with separate storage) do the following:
  - create a room and join it by typing the code
  - play a synchronized boss battle
  - check that both devices see the same HP
  - check that server rewards are applied exactly once
  - close one device and confirm the other sees "reconnecting…"
  - reopen the room link and confirm the player rejoins

## Project layout

```
index.html, css/, js/          the game (plain ES modules, no build step)
  js/app.js                    boot, title, profiles, hero creator, hub, settings
  js/mission.js, inputs.js     question loop, battles, puzzles, treasure, timed, results
  js/world.js                  generated expedition maps, events, secrets
  js/meta.js                   pets, collection, shop, home builder, daily missions
  js/parent.js                 parent gate, dashboard, reset
  js/mp.js, net.js, config.js  team play client (Supabase or local dev server)
  js/adaptive.js               mastery tracking and difficulty
  js/art.js                    all original SVG art (heroes, pets, monsters, scenes)
  js/audio.js                  synthesized music and sound effects, narration
shared/                        math engine + server room logic (used by browser, dev server and Edge Function)
server/dev-server.mjs          local server: static files + in-memory rooms + live updates (SSE)
supabase/                      database migration + "room" Edge Function
vendor/                        Bpmf Huninn zhuyin font (OFL), supabase-js (MIT), qrcode-generator (MIT)
tests/                         unit + browser tests
```

## Known limits (honest list)

- **The Supabase backend has not been run against a live Supabase project.** The game logic it runs is fully tested through the local server, but the database adapter, Realtime broadcast and deployment steps have not. Please do a two-device test after deploying.
- Progress is saved **per device**. Stars earned on the iPad do not appear on the MacBook. There is no cloud sync for single-player.
- Narration quality depends on the device's voices. iPads include a Taiwan Mandarin voice. On computers without a `zh-TW` voice, Chinese narration stays silent rather than using a Mainland accent.
- The zhuyin font chooses readings automatically. Characters with more than one reading (破音字) can occasionally show the wrong zhuyin.
- Sound, narration and real finger touch have only been tested in headless Chromium, not on a physical iPad.
- Rewards in single-player are stored on the device. A determined older child could edit them with developer tools. Team-play rewards are computed by the server.
