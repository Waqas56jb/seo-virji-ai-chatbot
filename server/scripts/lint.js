/**
 * npm run lint
 *  1. Syntax-checks every server source file (node --check).
 *  2. Scans the server source, both frontends and their built bundles for anything that
 *     looks like a secret (OpenAI keys, Supabase secret/service-role keys, DB URLs).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(serverRoot, '..');
let failures = 0;

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// 1. Syntax
const jsFiles = [...walk(path.join(serverRoot, 'src'), ['.js']), ...walk(path.join(serverRoot, 'scripts'), ['.js'])];
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failures += 1;
    console.log(`✘ syntax: ${path.relative(projectRoot, file)}\n${err.stderr?.toString()}`);
  }
}
console.log(`✔ syntax check: ${jsFiles.length} server files`);

// 2. Secret scan (env files themselves are excluded — they are git-ignored)
const SECRET_PATTERNS = [
  [/sk-(proj-)?[A-Za-z0-9_-]{20,}/, 'OpenAI API key'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*InNlcnZpY2Vfcm9sZSI[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/, 'Supabase service-role JWT'],
  [/postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/, 'database URL with password'],
];
const scanDirs = [
  path.join(serverRoot, 'src'),
  path.join(serverRoot, 'scripts'),
  path.join(projectRoot, 'client', 'src'),
  path.join(projectRoot, 'client', 'dist'),
  path.join(projectRoot, 'client', 'dist-widget'),
  path.join(projectRoot, 'admin', 'src'),
  path.join(projectRoot, 'admin', 'dist'),
];
const scanned = scanDirs.flatMap((d) => walk(d, ['.js', '.jsx', '.json', '.html', '.css']));
for (const file of scanned) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) {
      failures += 1;
      console.log(`✘ possible ${label} in ${path.relative(projectRoot, file)}`);
    }
  }
}
console.log(`✔ secret scan: ${scanned.length} files (server, client, admin, built bundles)`);

process.exitCode = failures ? 1 : 0;
if (failures) console.log(`\n${failures} problem(s) found`);
