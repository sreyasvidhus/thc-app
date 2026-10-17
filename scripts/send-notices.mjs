// Runs on GitHub Actions every ~10 min (free). Sends push for unsent notices and day-before event reminders.
// Needs secret FIREBASE_SERVICE_ACCOUNT = contents of the service-account JSON (Firebase console → Project settings → Service accounts).
import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.log('No service account secret set; skipping.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore(), fcm = admin.messaging();

const usersSnap = await db.collection('users').get();
const tokens = []; const tokenOwner = {};
usersSnap.forEach(u => Object.keys(u.data().fcmTokens || {}).forEach(t => { tokens.push(t); tokenOwner[t] = u.id; }));
console.log(`${tokens.length} device tokens`);

async function send(title, body) {
  if (!tokens.length) return;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await fcm.sendEachForMulticast({ tokens: chunk, notification: { title, body }, webpush: { fcmOptions: { link: './' }, notification: { icon: 'icons/icon-192.png' } } });
    // prune dead tokens
    const dead = [];
    res.responses.forEach((r, j) => { if (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || '')) dead.push(chunk[j]); });
    for (const t of dead) await db.doc('users/' + tokenOwner[t]).update({ ['fcmTokens.' + t]: admin.firestore.FieldValue.delete() }).catch(() => {});
    console.log(`sent "${title}": ${res.successCount} ok, ${res.failureCount} failed, ${dead.length} pruned`);
  }
}

// 1. Notices not yet pushed
const notices = await db.collection('notices').where('sent', '==', false).get();
for (const n of notices.docs) { const d = n.data(); await send(d.title, (d.body || '').slice(0, 200)); await n.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() }); }

// 2. Reminder the day before an event (IST)
const ist = new Date(Date.now() + 5.5 * 3600e3); const tmr = new Date(ist); tmr.setUTCDate(tmr.getUTCDate() + 1);
const tomorrow = tmr.toISOString().slice(0, 10);
const evs = await db.collection('events').where('date', '==', tomorrow).get();
for (const e of evs.docs) { const d = e.data(); if (d.reminded) continue; await send(`Tomorrow: ${d.title}`, `${d.time ? d.time + ' · ' : ''}${d.venue || ''}`.trim() || 'See the app for details'); await e.ref.update({ reminded: true }); }

// 3. Monthly dues nudge on the 5th: members with pending months
if (ist.getUTCDate() === 5) {
  const flag = db.doc('settings/nudges'); const f = (await flag.get()).data() || {}; const key = ist.toISOString().slice(0, 7);
  if (!f[key]) {
    const settings = (await db.doc('settings/general').get()).data() || {}; const fee = settings.fee || 1500;
    const members = await db.collection('members').get(); const byMember = {}; usersSnap.forEach(u => { const m = u.data().memberId; if (m) (byMember[m] ??= []).push(...Object.keys(u.data().fcmTokens || {})); });
    members.forEach(m => { const d = m.data(); if (d.email) usersSnap.forEach(u => { if ((u.data().email || '') === d.email) (byMember[m.id] ??= []).push(...Object.keys(u.data().fcmTokens || {})); }); });
    for (const m of members.docs) {
      const d = m.data(); if (d.status === 'left') continue; const toks = [...new Set(byMember[m.id] || [])]; if (!toks.length) continue;
      await fcm.sendEachForMulticast({ tokens: toks, notification: { title: 'THC dues', body: `Monthly subscription of ₹${fee} is due. Open the app to pay via UPI.` } }).catch(() => {});
    }
    await flag.set({ [key]: true }, { merge: true });
  }
}
console.log('done');
