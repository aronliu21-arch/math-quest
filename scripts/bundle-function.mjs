// Builds supabase/dashboard/room-function.ts: the whole "room" Edge Function in
// ONE file, so it can be pasted into the Supabase dashboard's function editor
// (no command-line tools needed). Run after changing /shared or the function:
//   node scripts/bundle-function.mjs
import { readFile, writeFile } from 'node:fs/promises';

const order = ['rng.js', 'fraction.js', 'mathgen.js', 'room-logic.js'];
export async function bundleLogic() {
  let out = '';
  for (const f of order) {
    let src = await readFile(new URL(`../shared/${f}`, import.meta.url), 'utf8');
    src = src.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, ''); // drop local imports (single or multi-line)
    src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s/gm, '$1 ');
    src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
    out += `\n// ===== ${f} =====\n${src}`;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fn = await readFile(new URL('../supabase/functions/room/index.ts', import.meta.url), 'utf8');
  const marker = "import { handle } from '../_shared/room-logic.js';";
  if (!fn.includes(marker)) throw new Error('index.ts import line changed');
  const logic = await bundleLogic();
  const body = fn.replace(/^\/\/ Copied from \/shared.*$/m, '').replace(marker, `// ---- game logic (generated from /shared by scripts/bundle-function.mjs) ----${logic}\n// ---- server ----`);
  const header = `// @ts-nocheck\n// GENERATED FILE — do not edit. Paste this whole file into the Supabase dashboard:\n// Edge Functions → Deploy a new function → Via Editor → name it "room".\n// Regenerate with: node scripts/bundle-function.mjs\n`;
  await writeFile(new URL('../supabase/dashboard/room-function.ts', import.meta.url), header + body);
  console.log('wrote supabase/dashboard/room-function.ts');
}
