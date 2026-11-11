// Fails if the Supabase function's copy of the shared logic is out of date.
import { readFile } from 'node:fs/promises';
let bad = 0;
for (const f of ['rng.js', 'fraction.js', 'mathgen.js', 'room-logic.js']) {
  const a = await readFile(new URL(`../shared/${f}`, import.meta.url), 'utf8');
  const b = await readFile(new URL(`../supabase/functions/_shared/${f}`, import.meta.url), 'utf8').catch(() => '');
  if (a !== b) { bad++; console.log(`supabase/functions/_shared/${f} is stale — run: npm run sync-shared`); }
}
console.log(bad ? 'shared copies OUT OF DATE' : 'shared copies up to date');
process.exit(bad ? 1 : 0);
