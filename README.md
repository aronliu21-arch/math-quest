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
| **Little Explorer (age 3)** | Pick the 🦖 #3 look when creating a hero to get a voice-first dinosaur mode with giant picture buttons and almost no reading. Five activities: counting dinosaurs, adding with pictures, sharing cookies fairly (drag or tap, no Check button), finding equal halves, and "which nest has more". Two tries with a spoken hint, then the answer is shown kindly. Each activity steps up after 4 of the last 5 are right first time. Every round of 5 earns a dinosaur sticker (12 to collect). Parents see a separate Little Explorer table in the dashboard. |
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

### 2. Team play: works with no setup

Team play works straight from the website: one child taps **Create a room**, the others type the 6-character code or scan the QR code. The devices connect **directly to each other** (WebRTC, via the free public PeerJS service for the initial hand-shake and as a relay when networks block direct links). The **host's device is the referee**: it runs exactly the same room logic as the server options below, so answers are still checked away from the other players' devices, but the host device itself is trusted. If the host closes the game, the room pauses until the host comes back (the host's room is saved on that device).

Privacy: the PeerJS service sees the room id and the devices' network addresses during connection; game data flows device-to-device (or through its relay, encrypted by WebRTC). No names or accounts are stored there.

The two options below are only needed if you want a central server instead (for example if the public PeerJS service is down).

### 2b. Optional: central server on Supabase (different networks) (free Supabase project, browser only)

The static site alone gives you single-player. For kids in different houses or on different Wi-Fi networks, add the free Supabase backend. Everything below happens in the web browser; no command-line tools are needed.

1. **Create the project.** Sign up at <https://supabase.com>. Children need no account; only you do. Click **New project**, give it any name and a database password (save it somewhere), pick the region closest to you, and wait about 2 minutes for it to finish.
2. **Create the tables.** In the left menu, open **SQL Editor**. Paste the whole contents of [`supabase/migrations/20261111000000_rooms.sql`](supabase/migrations/20261111000000_rooms.sql) and click **Run**. It should say "Success. No rows returned".
3. **Add the game server.** In the left menu, open **Edge Functions** → **Deploy a new function** → **Via Editor**.
   - Name it exactly `room`.
   - Delete the sample code, paste the whole contents of [`supabase/dashboard/room-function.ts`](supabase/dashboard/room-function.ts), and click **Deploy**.
   - Open the function's **Details / Settings** and turn **OFF** "Verify JWT" ("Enforce JWT verification"). The game checks players itself.
4. **Copy two values.** Open **Project Settings → API (API Keys)**. Copy the **Project URL** and the **anon public** key; on newer projects, use the **publishable** key instead. Both are meant to be public. **Never** share the `service_role` or secret key.
5. **Paste them into the game.** In `js/config.js`:
   ```js
   export const MP_CONFIG = { supabaseUrl: 'https://xxxx.supabase.co', supabaseAnonKey: 'eyJ... or sb_publishable_...', devApi: '' };
   ```
   Commit, and the site redeploys itself.

If you prefer the command line, the Supabase CLI also works: `supabase link`, `supabase db push`, `npm run sync-shared`, then `supabase functions deploy room --no-verify-jwt`.

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
npm test        # question engine (≈74,000 checks), Little Explorer (20,000), server room logic (44), dashboard bundle replay, shared-copy check
npm run e2e     # headless Chromium: 35 single-player + 11 Little Explorer + 10 two-device multiplayer checks
npm i --no-save peer && npm run e2e:p2p   # the same two-device checks in direct peer-to-peer mode
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

- **Direct (peer-to-peer) team play was tested with a local stand-in for the public PeerJS service, not the real one, and not across two real home networks.** Some strict networks (some schools, offices, mobile carriers) can block it.
- **The Supabase backend has not been run against a live Supabase project.** The game logic it runs is fully tested through the local server, but the database adapter, Realtime broadcast and deployment steps have not. Please do a two-device test after deploying.
- Progress is saved **per device**. Stars earned on the iPad do not appear on the MacBook. There is no cloud sync for single-player.
- Narration quality depends on the device's voices. iPads include a Taiwan Mandarin voice. On computers without a `zh-TW` voice, Chinese narration stays silent rather than using a Mainland accent.
- The zhuyin font chooses readings automatically. Characters with more than one reading (破音字) can occasionally show the wrong zhuyin.
- Sound, narration and real finger touch have only been tested in headless Chromium, not on a physical iPad.
- Rewards in single-player are stored on the device. A determined older child could edit them with developer tools. Team-play rewards are computed by the server.
