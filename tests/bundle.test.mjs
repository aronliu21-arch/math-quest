// The dashboard copy-paste function must (1) be up to date and (2) run the same
// game logic. We load the bundled logic and replay the room test suite on it.
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundleLogic } from '../scripts/bundle-function.mjs';

const before = await readFile(new URL('../supabase/dashboard/room-function.ts', import.meta.url), 'utf8');
execFileSync(process.execPath, [new URL('../scripts/bundle-function.mjs', import.meta.url).pathname]);
const after = await readFile(new URL('../supabase/dashboard/room-function.ts', import.meta.url), 'utf8');
if (before !== after) { console.log('supabase/dashboard/room-function.ts was stale — regenerated it; commit the change'); }

const dir = await mkdtemp(join(tmpdir(), 'mqb-'));
const mod = join(dir, 'room-logic.js');
await writeFile(mod, (await bundleLogic()) + '\nexport { handle, memoryDb, OFFLINE_AFTER_MS };\n');
// Re-run the real room tests with their import pointed at the bundle.
const roomTest = (await readFile(new URL('./room.test.mjs', import.meta.url), 'utf8')).replace("'../shared/room-logic.js'", JSON.stringify(mod));
const t = join(dir, 'room.test.mjs'); await writeFile(t, roomTest);
const out = execFileSync(process.execPath, [t]).toString();
console.log('bundle: ' + out.trim().split('\n').pop());
process.exit(before !== after ? 1 : 0);
