// Mirrors Firestore → Google Sheet (alternate DB). Env: FIREBASE_SERVICE_ACCOUNT, SHEET_ID.
// Share the sheet with the service account's client_email (Editor). Enable "Google Sheets API" on the Firebase project in Google Cloud.
import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'); const SHEET = process.env.SHEET_ID;
if (!sa.project_id || !SHEET) { console.log('sheet sync skipped (no SHEET_ID or service account)'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const { GoogleAuth } = await import('google-auth-library');
const token = await new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/spreadsheets'] }).getAccessToken();
const api = async (path, method = 'GET', body) => { const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status + ' ' + await r.text()); return r.json(); };
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const mLabel = m => { const [y, mo] = m.split('-'); return MN[+mo - 1] + " '" + y.slice(2); };
const pad = n => String(n).padStart(2, '0'); const ist = new Date(Date.now() + 5.5 * 3600e3); const curMonth = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}`;
const addMonths = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + k, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const settings = (await db.doc('settings/general').get()).data() || {}; const fee = settings.fee || 1500; const start = settings.startMonth || '2025-08';
const months = []; for (let m = start; m <= curMonth && months.length < 240; m = addMonths(m, 1)) months.push(m);
const members = []; (await db.collection('members').get()).forEach(d => members.push({ id: d.id, ...d.data() }));
members.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
const dueState = (m, mo) => { const d = m.dues?.[mo]; if (d) return d.s; if (mo < (m.joined || '0000')) return 'na'; if (m.status === 'left' && m.left && mo > m.left) return 'na'; return 'pending'; };
const ledger = []; (await db.collection('ledger').get()).forEach(d => ledger.push({ id: d.id, ...d.data() }));
ledger.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.seq || 0) - (b.seq || 0));
const payments = []; (await db.collection('payments').get()).forEach(d => payments.push({ id: d.id, ...d.data() }));
const contrib = []; (await db.collection('contributions').get()).forEach(d => contrib.push({ id: d.id, ...d.data() }));
// Build tabs
let bal = 0; const ledgerRows = [['Date', 'Particulars', 'Credit', 'Debit', 'Balance', 'Type', 'Verified', 'Member', 'Months'], ...ledger.map(r => { bal += (+r.credit || 0) - (+r.debit || 0); return [r.date || '', r.particulars || '', r.credit || 0, r.debit || 0, bal, r.type || '', r.verified === false ? 'NO' : 'yes', r.member || '', (r.months || []).map(mLabel).join(', ')]; })];
const tot = months.map(() => 0);
const matrixRows = [['Name', 'Studio', 'Position', 'Status', ...months.map(mLabel), 'Paid ₹', 'Due ₹', 'Pending months']];
const statusRows = [['Name', 'Studio', 'Position', 'Status', 'Username', 'Member since', 'Months paid', 'Outstanding ₹', 'Paid to date ₹', 'Pending months', 'Unverified months', 'Last payment', 'Phone', 'Email']];
for (const m of members) {
  let paid = 0, due = 0; const pend = [], unv = [];
  const cells = months.map((mo, i) => { const st = dueState(m, mo); const amt = m.dues?.[mo]?.amt || fee; if (st === 'paid') { paid += amt; tot[i] += amt; if (m.dues?.[mo]?.unverified) unv.push(mo); return amt; } if (st === 'pending') { due += fee; pend.push(mo); return 'PENDING'; } return st.toUpperCase(); });
  matrixRows.push([m.name, m.studio || '', m.position || '', m.status || 'active', ...cells, paid, due, pend.map(mLabel).join(', ')]);
  const last = [...ledger].reverse().find(r => r.member === m.id || (r.particulars || '').toLowerCase().includes(m.name.toLowerCase()));
  statusRows.push([m.name, m.studio || '', m.position || '', m.status || 'active', m.username || '', m.joined || '', months.filter(mo => dueState(m, mo) === 'paid').length, due, paid, pend.map(mLabel).join(', '), unv.map(mLabel).join(', '), last ? `${last.date} · ${last.particulars}` : '', m.phone || '', m.email || '']);
}
matrixRows.push(['Monthly total', '', '', '', ...tot, tot.reduce((a, b) => a + b, 0), '', '']);
const payRows = [['Date', 'Member', 'Paid by', 'Months', 'Amount', 'App', 'UTR', 'Status', 'Note'], ...payments.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(p => [p.date || '', p.memberName || '', p.payerName || '', (p.months || []).map(mLabel).join(', '), p.amount || 0, p.app || '', p.utr || '', p.status || '', p.note || ''])];
const conRows = [['Cause', 'Contributor', 'Amount', 'Date', 'Status', 'Details'], ...contrib.sort((a, b) => (a.seq || 0) - (b.seq || 0)).map(c => [c.cause || '', c.name || '', c.amount || 0, c.date || '', c.status || '', c.details || ''])];
const cr = ledger.reduce((s, r) => s + (+r.credit || 0), 0), dr = ledger.reduce((s, r) => s + (+r.debit || 0), 0);
const summary = [['THC register mirror', ''], ['Last synced (IST)', ist.toISOString().replace('T', ' ').slice(0, 16)], ['Balance in hand', cr - dr], ['Total collected', cr], ['Total spent', dr], ['Active members', members.filter(m => m.status !== 'left').length], ['Outstanding ₹', matrixRows.slice(1, -1).reduce((s, r) => s + (+r[r.length - 2] || 0), 0)], ['Payments awaiting verification', payments.filter(p => p.status === 'pending').length], ['', ''], ['Source of truth is the app. This sheet is regenerated every sync; manual edits here are overwritten.', '']];
const tabs = { Summary: summary, 'Member status': statusRows, 'Dues matrix': matrixRows, Ledger: ledgerRows, 'App payments': payRows, Contributions: conRows };
const meta = await api(''); const existing = new Set(meta.sheets.map(s => s.properties.title));
const reqs = Object.keys(tabs).filter(t => !existing.has(t)).map(t => ({ addSheet: { properties: { title: t } } }));
if (reqs.length) await api(':batchUpdate', 'POST', { requests: reqs });
for (const [t, rows] of Object.entries(tabs)) { await api(`/values/${encodeURIComponent(t)}!A1:ZZ:clear`, 'POST', {}); await api(`/values/${encodeURIComponent(t)}!A1?valueInputOption=RAW`, 'PUT', { values: rows }); }
const meta2 = await api(''); const fmt = meta2.sheets.filter(s => tabs[s.properties.title]).map(s => ({ repeatCell: { range: { sheetId: s.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } }));
const frozen = meta2.sheets.filter(s => tabs[s.properties.title] && s.properties.title !== 'Summary').map(s => ({ updateSheetProperties: { properties: { sheetId: s.properties.sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'gridProperties(frozenRowCount,frozenColumnCount)' } }));
await api(':batchUpdate', 'POST', { requests: [...fmt, ...frozen] });
console.log('sheet synced:', Object.entries(tabs).map(([t, r]) => `${t} ${r.length - 1}`).join(', ')); process.exit(0);
