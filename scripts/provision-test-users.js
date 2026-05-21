import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scripts/.env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const usersArg = process.argv[2];
if (!usersArg) {
  console.error('usage: node provision-test-users.js <users.json>');
  console.error('       node provision-test-users.js --inline email@x.com');
  console.error('');
  console.error('users.json format:');
  console.error('[{"email":"a@b.com","password":"optional — generated if omitted","display_name":"Name"}]');
  process.exit(1);
}

let users;
if (usersArg === '--inline') {
  const email = process.argv[3];
  if (!email) { console.error('--inline requires an email'); process.exit(1); }
  users = [{ email }];
} else {
  users = JSON.parse(readFileSync(usersArg, 'utf8'));
}

const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error('failed to list existing users:', listErr.message);
  process.exit(1);
}
const existingByEmail = new Map(listed.users.map(u => [u.email, u]));

const created = [];

for (const u of users) {
  const email = u.email?.trim().toLowerCase();
  if (!email) {
    console.error('skipping entry with no email:', u);
    continue;
  }

  const existing = existingByEmail.get(email);
  if (existing) {
    console.log(`⊙ ${email} — already exists (id=${existing.id}), skipping`);
    continue;
  }

  const password = u.password ?? randomBytes(9).toString('base64url');
  const display_name = u.display_name;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: display_name ? { display_name } : undefined,
  });

  if (error) {
    console.error(`✗ ${email} — ${error.message}`);
    continue;
  }

  console.log(`✓ ${email} — id=${data.user.id}`);
  created.push({ email, password, display_name, id: data.user.id, generated: !u.password });
}

if (created.length) {
  console.log('\n--- credentials to share with testers ---');
  for (const c of created) {
    console.log(`${c.email}  ${c.password}${c.generated ? '  (generated)' : ''}`);
  }
}
console.log('\ndone.');
