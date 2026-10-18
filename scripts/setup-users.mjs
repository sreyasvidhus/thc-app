// One-time (re-run on push): seeds the register (if empty) and creates/updates username+password accounts.
// Env: FIREBASE_SERVICE_ACCOUNT (json), THC_ACCOUNTS (base64 JSON array of {memberId,name,username,email,password}).
import admin from 'firebase-admin';
import fs from 'fs';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'); if (!sa.project_id) { console.log('no service account'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const auth = admin.auth(), db = admin.firestore();
const rows = JSON.parse(Buffer.from(process.env.THC_ACCOUNTS || '', 'base64').toString('utf8') || '[]');
console.log(rows.length ? rows.length + ' accounts in THC_ACCOUNTS' : 'THC_ACCOUNTS not set: seeding register only, no accounts created');
const seed = JSON.parse(fs.readFileSync('seed.json', 'utf8'));
const s = await db.doc('settings/general').get();
if (!s.exists) {
  let b = db.batch(), n = 0; const put = (p, d) => { b.set(db.doc(p), d); n++; };
  put('settings/general', { ...seed.settings.general, upiId: 'sreyas1234-2@oksbi', upiName: 'Sreyas S' });
  for (const [k, v] of Object.entries(seed.members)) put('members/' + k, { ...v, email: (v.email || '').toLowerCase() || null });
  for (const [k, v] of Object.entries(seed.ledger)) put('ledger/' + k, v);
  for (const [k, v] of Object.entries(seed.contributions)) put('contributions/' + k, v);
  await b.commit(); console.log('seeded', n, 'docs');
} else console.log('register already present, not reseeding');
let made = 0, updated = 0;
for (const r of rows) {
  let u; try { u = await auth.getUserByEmail(r.email); await auth.updateUser(u.uid, { password: r.password, displayName: r.name }); updated++; }
  catch { u = await auth.createUser({ email: r.email, password: r.password, displayName: r.name, emailVerified: true }); made++; }
  await db.doc('members/' + r.memberId).set({ uid: u.uid, username: r.username, loginEmail: r.email }, { merge: true });
  await db.doc('users/' + u.uid).set({ email: r.email, name: r.name, memberId: r.memberId, mustChangePassword: true }, { merge: true });
}
for (const e of (process.env.THC_ADMIN_USERNAMES || 'sreyas.vidhu').split(',')) await db.doc('admins/' + e.trim() + '@thehyderabadcartel.com').set({ addedBy: 'setup', at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
console.log(`accounts: ${made} created, ${updated} updated`); process.exit(0);
