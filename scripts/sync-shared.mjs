// Copies the shared game logic into the Supabase function bundle.
// Run after changing anything in /shared:  node scripts/sync-shared.mjs
import { copyFile, mkdir } from 'node:fs/promises';
const files = ['rng.js', 'fraction.js', 'mathgen.js', 'room-logic.js'];
await mkdir(new URL('../supabase/functions/_shared/', import.meta.url), { recursive: true });
for (const f of files) await copyFile(new URL(`../shared/${f}`, import.meta.url), new URL(`../supabase/functions/_shared/${f}`, import.meta.url));
console.log('synced', files.join(', '));
