/**
 * Secure admin provisioning (no default accounts exist).
 *   npm run admin:create -- --email owner@example.com --name "Owner Name" [--role owner|admin|viewer]
 * The password is read from ADMIN_PASSWORD or prompted interactively (hidden), never from argv history.
 * Use --reset-password to change the password of an existing account.
 */
import readline from 'node:readline';
import { pool, one, query } from '../src/config/supabase.js';
import { createAdmin, hashPassword } from '../src/services/auth.service.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function strong(pw) {
  return pw.length >= 12 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
}

async function main() {
  const email = arg('email');
  const name = arg('name') || '';
  const role = arg('role') || 'owner';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide a valid --email');
  if (!['owner', 'admin', 'viewer'].includes(role)) throw new Error('--role must be owner, admin or viewer');

  const password = process.env.ADMIN_PASSWORD || (await promptHidden('Password (min 12 chars, upper, lower, digit): '));
  if (!strong(password)) throw new Error('Password must be at least 12 characters and include upper-case, lower-case and a digit.');

  const existing = await one('select id from public.seo_virji_admin_users where lower(email) = lower($1)', [email]);
  if (existing) {
    if (!process.argv.includes('--reset-password')) throw new Error('An admin with this email already exists (use --reset-password to change it).');
    await query('update public.seo_virji_admin_users set password_hash = $2, is_active = true where id = $1', [existing.id, await hashPassword(password)]);
    await query('update public.seo_virji_admin_refresh_tokens set revoked_at = now() where admin_user_id = $1 and revoked_at is null', [existing.id]);
    console.log(`Password updated for ${email}. Existing sessions were signed out.`);
    return;
  }
  const admin = await createAdmin({ email, password, fullName: name, role });
  console.log(`Admin created: ${admin.email} (${admin.role})`);
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
