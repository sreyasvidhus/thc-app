/* The Hyderabad Cartel – member app. Vanilla JS + Firebase (compat SDK). */
(() => {
const C = window.THC_CONFIG || {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INR = n => '₹' + Math.round(n||0).toLocaleString('en-IN');
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad = n => String(n).padStart(2,'0');
const todayD = new Date();
const isoToday = `${todayD.getFullYear()}-${pad(todayD.getMonth()+1)}-${pad(todayD.getDate())}`;
const curMonth = isoToday.slice(0,7);
const mLabel = m => { const [y,mo]=m.split('-'); return MN[+mo-1]+" '"+y.slice(2); };
const mLong = m => { const [y,mo]=m.split('-'); return MN[+mo-1]+' '+y; };
const fmtDate = d => { if(!d) return '—'; const [y,m,dd]=d.split('-'); return `${+dd} ${MN[+m-1]} ${y}`; };
const addMonths = (m,k) => { const [y,mo]=m.split('-').map(Number); const d=new Date(y,mo-1+k,1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; };
const monthRange = (a,b) => { const o=[]; let m=a; while(m<=b && o.length<240){ o.push(m); m=addMonths(m,1); } return o; };
const initials = n => (n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'm'+Date.now();
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// ---------- state ----------
const S = { user:null, udoc:null, member:null, memberId:null, isAdmin:false, members:{}, ledger:{}, contrib:{}, events:{}, notices:{}, payments:{}, settings:{fee:1500,startMonth:'2025-08'}, memQ:'', ledQ:'', ledMonth:'', unsub:[] };
const months = () => monthRange(S.settings.startMonth||'2025-08', curMonth);
const allMembers = () => Object.entries(S.members).sort((a,b)=>(a[1].order??999)-(b[1].order??999)||a[1].name.localeCompare(b[1].name));
const activeMembers = () => allMembers().filter(([,m])=>m.status!=='left');
const dueState = (m,mo) => { const d=m.dues?.[mo]; if(d) return d.s; if(mo<(m.joined||'0000')) return 'na'; if(m.status==='left'&&m.left&&mo>m.left) return 'na'; return 'pending'; };
const pendingMonths = m => months().filter(mo=>dueState(m,mo)==='pending');
const ledgerRows = () => Object.entries(S.ledger).map(([id,r])=>({id,...r})).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.seq||0)-(b.seq||0));
const fee = () => +S.settings.fee||1500;

// ---------- ui helpers ----------
let toastT; const toast = m => { const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),2400); };
const openSheet = h => { $('#sheet').innerHTML=h; $('#scrim').classList.add('on'); };
const closeSheet = () => $('#scrim').classList.remove('on');
$('#scrim').addEventListener('click', e => { if(e.target.id==='scrim') closeSheet(); });
$('#sheet').addEventListener('click', async e => { if(e.target.closest('[data-x]')) closeSheet(); const c=e.target.closest('[data-copy]'); if(c){ try{ await navigator.clipboard.writeText(c.dataset.copy); toast('Copied'); }catch{ toast('Could not copy'); } } });
const fail = e => { console.error(e); toast(e?.code==='permission-denied' ? "You don't have permission for that" : 'Something went wrong: '+(e?.message||e)); };
const go = p => { $$('#tabs button').forEach(b=>b.setAttribute('aria-selected', b.dataset.p===p)); $$('.page').forEach(s=>s.classList.toggle('on', s.id==='p-'+p)); window.scrollTo({top:0}); };
$('#tabs').addEventListener('click', e => { const b=e.target.closest('button'); if(b) go(b.dataset.p); });
document.addEventListener('click', e => { const a=e.target.closest('[data-go]'); if(a){ e.preventDefault(); go(a.dataset.go);} });
const armConfirm = (btn, fn) => { if(btn.dataset.arm){ fn(); } else { btn.dataset.arm='1'; const t=btn.textContent; btn.textContent='Tap again to confirm'; setTimeout(()=>{ delete btn.dataset.arm; btn.textContent=t; },3000); } };

// ---------- firebase ----------
if(!C.firebase || C.firebase.apiKey==='PASTE_API_KEY'){ $('#signin-msg').innerHTML='<span class="banner">firebase-config.js has not been filled in yet. See SETUP.md.</span>'; $('#signin-google').disabled=true; return; }
firebase.initializeApp(C.firebase);
const auth = firebase.auth(); const db = firebase.firestore();
db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
const FV = firebase.firestore.FieldValue;
let messaging=null; try{ if(firebase.messaging.isSupported()) messaging=firebase.messaging(); }catch{}

$('#signin-google').addEventListener('click', async () => {
  const p=new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({prompt:'select_account'});
  try{ await auth.signInWithPopup(p); }catch(e){ if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'||e.code==='auth/cancelled-popup-request') auth.signInWithRedirect(p); else if(e.code!=='auth/popup-closed-by-user') fail(e); }
});

auth.onAuthStateChanged(async user => {
  S.unsub.forEach(u=>u()); S.unsub=[];
  S.user=user; S.udoc=null; S.member=null; S.memberId=null; S.isAdmin=false;
  document.body.classList.remove('is-admin'); $('#tabs').hidden=true;
  if(!user){ go('signin'); $('#me-initials').textContent='·'; return; }
  $('#me-initials').textContent = initials(user.displayName||user.email);
  const email=(user.email||'').toLowerCase();
  S.isAdmin = (C.ADMIN_EMAILS||[]).map(x=>x.toLowerCase()).includes(email);
  if(!S.isAdmin){ try{ S.isAdmin=(await db.doc('admins/'+email).get()).exists; }catch{} }
  document.body.classList.toggle('is-admin', S.isAdmin);
  // user doc
  const uref=db.doc('users/'+user.uid);
  try{ await uref.set({email, name:user.displayName||'', photo:user.photoURL||'', lastSeen:FV.serverTimestamp()}, {merge:true}); }catch(e){ fail(e); }
  S.unsub.push(uref.onSnapshot(s=>{ S.udoc=s.data()||{}; resolveMember(); }));
  // shared data
  S.unsub.push(db.doc('settings/general').onSnapshot(s=>{ if(s.exists) S.settings={...S.settings,...s.data()}; renderAll(); }));
  S.unsub.push(db.collection('members').onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); S.members=o; resolveMember(); renderAll(); }, fail));
  S.unsub.push(db.collection('ledger').onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); S.ledger=o; renderAll(); }, fail));
  S.unsub.push(db.collection('contributions').onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); S.contrib=o; renderContrib(); }, fail));
  S.unsub.push(db.collection('notices').orderBy('createdAt','desc').limit(15).onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); S.notices=o; renderNotices(); }, fail));
  S.unsub.push(db.collection('events').orderBy('date','desc').limit(30).onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]={...d.data(), rsvp:S.events[d.id]?.rsvp||{}, att:S.events[d.id]?.att||{}}); S.events=o; renderEvents(); renderHome(); subEventSubs(); }, fail));
  const payQ = S.isAdmin ? db.collection('payments').orderBy('createdAt','desc').limit(100) : db.collection('payments').where('uid','==',user.uid).orderBy('createdAt','desc').limit(30);
  S.unsub.push(payQ.onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); S.payments=o; renderPayments(); renderHome(); }, e=>{ console.warn(e); }));
  go(location.hash==='#events'?'events':'home'); $('#tabs').hidden=false;
  setupPush();
});
$('#me-btn').addEventListener('click', ()=>{ if(S.user) accountSheet(); });

function resolveMember(){
  if(!S.user) return; const email=(S.user.email||'').toLowerCase();
  let id = Object.keys(S.members).find(k=>(S.members[k].email||'').toLowerCase()===email || S.members[k].uid===S.user.uid);
  if(!id && S.udoc?.memberId && S.members[S.udoc.memberId]) id=S.udoc.memberId;
  S.memberId=id||null; S.member=id?S.members[id]:null;
  if(!id && Object.keys(S.members).length){ renderLink(); if($('#p-home').classList.contains('on')) go('link'); }
  renderHome(); renderPay();
}
function renderLink(){
  $('#link-email').textContent=S.user.email;
  const q=($('#link-q').value||'').toLowerCase();
  $('#link-list').innerHTML = activeMembers().filter(([,m])=>!q||m.name.toLowerCase().includes(q)).map(([id,m])=>`<button class="row" data-link="${id}"><span class="t">${esc(m.name)}</span><span class="d">${esc(m.studio||'')}</span></button>`).join('') || '<div class="empty">No match</div>';
}
$('#link-q').addEventListener('input', renderLink);
$('#link-list').addEventListener('click', async e => { const b=e.target.closest('[data-link]'); if(!b) return; try{ await db.doc('users/'+S.user.uid).set({memberId:b.dataset.link, linkedAt:FV.serverTimestamp()},{merge:true}); toast('Linked. The treasurer will confirm.'); go('home'); }catch(e){ fail(e); } });

// ---------- push ----------
async function setupPush(){
  if(!messaging || !C.VAPID_KEY || C.VAPID_KEY.startsWith('PASTE')) return;
  if(Notification.permission!=='granted') return;
  try{ const reg=await navigator.serviceWorker.register('firebase-messaging-sw.js'); const tok=await messaging.getToken({vapidKey:C.VAPID_KEY, serviceWorkerRegistration:reg}); if(tok) await db.doc('users/'+S.user.uid).set({fcmTokens:{[tok]:true}},{merge:true}); }catch(e){ console.warn('push',e); }
  messaging.onMessage(p=>{ toast((p.notification?.title||'THC')+': '+(p.notification?.body||'')); });
}
async function enablePush(){
  if(!messaging){ toast(isIOS?'On iPhone, add the app to your Home Screen first, then enable notifications.':'Notifications are not supported in this browser'); return; }
  const r=await Notification.requestPermission(); if(r!=='granted'){ toast('Notifications stay off'); return; }
  await setupPush(); toast('Notifications on');
}

// ---------- render: home ----------
function renderAll(){ renderHome(); renderPay(); renderMembers(); renderLedger(); renderMatrix(); renderContrib(); renderEvents(); renderNotices(); }
function renderHome(){
  if(!S.user) return;
  const first=(S.member?.name||S.user.displayName||'there').split(' ')[0]; $('#home-greet').textContent=`Hello, ${first}`;
  const rows=ledgerRows(); const cr=rows.reduce((s,r)=>s+(+r.credit||0),0), dr=rows.reduce((s,r)=>s+(+r.debit||0),0);
  $('#h-bal').textContent=INR(cr-dr); $('#h-bal-sub').textContent=`${INR(cr)} in · ${INR(dr)} out`;
  const act=activeMembers(); const owing=act.filter(([,m])=>pendingMonths(m).length).length;
  $('#h-mem').textContent=act.length; $('#h-mem-sub').textContent=`${owing} with dues pending`;
  if(S.member){ const pm=pendingMonths(S.member); const myPend=Object.values(S.payments).filter(p=>p.uid===S.user.uid&&p.status==='pending');
    if(!pm.length){ $('#my-dues-val').textContent='All paid'; $('#my-dues-sub').textContent=`Up to date through ${mLong(curMonth)}`; $('#my-pay-btn').hidden=true; }
    else { $('#my-dues-val').textContent=INR(pm.length*fee()); $('#my-dues-sub').textContent=`${pm.map(mLabel).join(', ')}${myPend.length?` · ${myPend.length} payment awaiting verification`:''}`; $('#my-pay-btn').hidden=false; } }
  else { $('#my-dues-val').textContent='Not linked'; $('#my-dues-sub').textContent='Tap your initials to link your member record'; $('#my-pay-btn').hidden=true; }
  // next event
  const up=Object.entries(S.events).filter(([,e])=>e.date>=isoToday).sort((a,b)=>a[1].date.localeCompare(b[1].date));
  $('#next-event').innerHTML = up.length ? eventCard(up[0][0],up[0][1]) : '<div class="card empty">No upcoming events</div>';
  // admin list
  if(S.isAdmin){ const pend=Object.entries(S.payments).filter(([,p])=>p.status==='pending'); const unlinked=Object.values(S.members).filter(m=>m.status!=='left'&&!m.email).length;
    $('#admin-list').innerHTML = `<button class="row" id="a-pay"><span class="t">Payments to verify</span><span class="pill ${pend.length?'pending':'paid'}">${pend.length}</span></button>
    <button class="row" id="a-record"><span class="t">Record a cash / bank payment</span><span class="d">›</span></button>
    <button class="row" id="a-links"><span class="t">Member sign-in links</span><span class="d">${unlinked} without email</span></button>
    <button class="row" id="a-settings"><span class="t">Fee, UPI ID and admins</span><span class="d">›</span></button>
    ${Object.keys(S.members).length?'':'<button class="row" id="a-import"><span class="t">Import the Excel register (first-time setup)</span><span class="d">›</span></button>'}`;
    $('#a-pay').onclick=verifySheet; $('#a-record').onclick=()=>recordSheet(); $('#a-links').onclick=linksSheet; $('#a-settings').onclick=settingsSheet; $('#a-import')&&($('#a-import').onclick=importSeed); }
}
$('#my-pay-btn').addEventListener('click', ()=>go('pay'));

// ---------- notices ----------
function renderNotices(){
  const list=Object.entries(S.notices).sort((a,b)=>(b[1].createdAt?.seconds||0)-(a[1].createdAt?.seconds||0));
  $('#notice-list').innerHTML = list.length ? list.slice(0,6).map(([id,n])=>`<button class="row" data-notice="${id}"><div class="body"><div class="t">${esc(n.title)}</div><div class="d">${esc((n.body||'').slice(0,90))}${(n.body||'').length>90?'…':''}</div></div><span class="d">${n.createdAt?relDate(n.createdAt.toDate()):''}</span></button>`).join('') : '<div class="empty">No notices yet</div>';
}
const relDate = d => { const diff=(Date.now()-d)/86400000; if(diff<1) return 'Today'; if(diff<2) return 'Yesterday'; if(diff<7) return Math.floor(diff)+'d ago'; return `${d.getDate()} ${MN[d.getMonth()]}`; };
$('#notice-list').addEventListener('click', e=>{ const b=e.target.closest('[data-notice]'); if(!b) return; const n=S.notices[b.dataset.notice];
  openSheet(`<div class="sheet-h"><h2>${esc(n.title)}</h2><button class="icon-btn" data-x>✕</button></div><div class="small muted">${n.createdAt?fmtDate(n.createdAt.toDate().toISOString().slice(0,10)):''} · ${esc(n.byName||'')}</div><p style="white-space:pre-wrap;margin:0">${esc(n.body)}</p>${S.isAdmin?`<div class="sheet-f"><button class="btn danger sm" id="n-del">Delete</button></div>`:''}`);
  $('#n-del')?.addEventListener('click', ev=>armConfirm(ev.target, ()=>db.doc('notices/'+b.dataset.notice).delete().then(closeSheet).catch(fail))); });
$('#notice-add').addEventListener('click', ()=>{
  openSheet(`<div class="sheet-h"><h2>Post a notice</h2><button class="icon-btn" data-x>✕</button></div><div class="field"><label>Title</label><input id="n-t" placeholder="e.g. November meet moved to the 22nd"></div><div class="field"><label>Message</label><textarea id="n-b" rows="5"></textarea></div><p class="small muted">Everyone with notifications on gets a push alert within a few minutes.</p><div class="sheet-f"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="n-save">Post</button></div>`);
  $('#n-save').onclick=async()=>{ const t=$('#n-t').value.trim(), b=$('#n-b').value.trim(); if(!t) return toast('Title required'); try{ await db.collection('notices').add({title:t, body:b, createdAt:FV.serverTimestamp(), by:S.user.uid, byName:S.member?.name||S.user.displayName||'', sent:false}); closeSheet(); toast('Posted'); }catch(e){ fail(e); } };
});

// ---------- pay ----------
function renderPay(){
  if(!S.user) return;
  const upi=S.settings.upiId||C.UPI_ID||''; $('#pay-upi-id').innerHTML = upi&&!upi.startsWith('PASTE') ? `Paying to <b>${esc(upi)}</b> (${esc(S.settings.upiName||C.UPI_NAME||'THC')}) <button class="chip" data-copy-upi>Copy UPI ID</button>` : '<span class="banner">UPI ID not set yet. Admin: Treasurer → Fee, UPI ID and admins.</span>';
  const sel=$('#pay-member'); if(S.isAdmin){ sel.innerHTML=activeMembers().map(([id,m])=>`<option value="${id}" ${id===(sel.value||S.memberId)?'selected':''}>${esc(m.name)}</option>`).join(''); }
  const id = S.isAdmin ? (sel.value||S.memberId) : S.memberId; const m=S.members[id];
  if(!m){ $('#pay-sub').textContent='Link your member record first (tap your initials, top right).'; $('#pay-months').innerHTML=''; $('#pay-total').textContent='₹0'; return; }
  $('#pay-sub').textContent=`${INR(fee())} per month · ${esc(m.name)}`;
  const list=monthRange(months()[0], addMonths(curMonth,2)); const pend=pendingMonths(m);
  $('#pay-months').innerHTML=list.filter(mo=>dueState(m,mo)!=='na').map(mo=>{ const st=dueState(m,mo); const has=st==='paid'; return `<label class="${has?'has':''}"><input type="checkbox" value="${mo}" ${has?'disabled':''} ${pend.includes(mo)&&mo<=curMonth?'checked':''}>${mLabel(mo)}${has?' ✓':''}</label>`; }).join('');
  payTotal();
}
const payTotal = () => { const n=$$('#pay-months input:checked').length; $('#pay-total').textContent=INR(n*fee()); };
$('#pay-months').addEventListener('change', payTotal); $('#pay-member').addEventListener('change', renderPay);
$('#p-pay').addEventListener('click', async e=>{ if(e.target.closest('[data-copy-upi]')){ try{ await navigator.clipboard.writeText(S.settings.upiId||C.UPI_ID); toast('UPI ID copied'); }catch{ toast('Could not copy'); } } });
function upiParams(){ const id=S.isAdmin?$('#pay-member').value:S.memberId; const m=S.members[id]; const sel=$$('#pay-months input:checked').map(i=>i.value); const amt=sel.length*fee();
  const tn=`THC ${sel.map(mLabel).join(' ').replace(/'/g,'')} ${(m?.name||'').split(' ')[0]}`.slice(0,50);
  return {id,m,sel,amt,q:`pa=${encodeURIComponent(S.settings.upiId||C.UPI_ID)}&pn=${encodeURIComponent(S.settings.upiName||C.UPI_NAME||'THC')}&am=${amt}&cu=INR&tn=${encodeURIComponent(tn)}`}; }
function launchPay(app){
  const p=upiParams(); if(!p.sel.length) return toast('Select at least one month'); const upi=S.settings.upiId||C.UPI_ID; if(!upi||upi.startsWith('PASTE')) return toast('UPI ID is not set up yet');
  const url = app==='gpay' ? (isIOS?'gpay://upi/pay?':'tez://upi/pay?')+p.q : app==='phonepe' ? 'phonepe://pay?'+p.q : 'upi://pay?'+p.q;
  sessionStorage.setItem('thc-pay', JSON.stringify({id:p.id, sel:p.sel, amt:p.amt, app}));
  window.location.href=url;
  setTimeout(()=>{ if(document.visibilityState==='visible' && app!=='upi') window.location.href='upi://pay?'+p.q; }, 1800);
  $('#pay-confirm').hidden=false; $('#pay-app').value = app==='gpay'?'Google Pay':app==='phonepe'?'PhonePe':'Other UPI'; setTimeout(()=>$('#pay-confirm').scrollIntoView({behavior:'smooth'}),400);
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState!=='visible') return; let p=null; try{ p=JSON.parse(sessionStorage.getItem('thc-pay')||'null'); }catch{} if(!p) return; go('pay'); $('#pay-confirm').hidden=false; $$('#pay-months input').forEach(i=>{ if(!i.disabled) i.checked=p.sel.includes(i.value); }); payTotal(); setTimeout(()=>{ $('#pay-utr').focus(); toast('Paid? Enter the UTR from your receipt'); },300); });
$('#pay-gpay').onclick=()=>launchPay('gpay'); $('#pay-phonepe').onclick=()=>launchPay('phonepe'); $('#pay-upi').onclick=()=>launchPay('upi');
$('#pay-submit').addEventListener('click', async ()=>{
  const p=upiParams(); if(!p.sel.length) return toast('Select the months you paid for'); const utr=$('#pay-utr').value.trim(); const app=$('#pay-app').value;
  if(!/^\d{10,16}$/.test(utr) && !['Cash','Bank transfer'].includes(app)) return toast('Enter the 12-digit UTR from your UPI receipt');
  if(Object.values(S.payments).some(x=>x.utr===utr&&utr)) return toast('That UTR was already submitted');
  try{ const pref=db.collection('payments').doc(); const lref=db.collection('ledger').doc(); const b=db.batch();
    const dues={...(p.m.dues||{})}; p.sel.forEach(mo=>dues[mo]={s:'paid',amt:fee(),unverified:true,paymentId:pref.id});
    b.set(pref,{uid:S.user.uid, memberId:p.id, memberName:p.m.name, months:p.sel, amount:p.amt, utr, app, note:$('#pay-note').value.trim(), status:'pending', createdAt:FV.serverTimestamp(), date:isoToday, ledgerId:lref.id});
    b.set(lref,{date:isoToday, particulars:`${p.sel.length===1?mLong(p.sel[0]):p.sel.map(mLabel).join(', ')} payment from ${p.m.name}${utr?' · UTR '+utr:''}`, credit:p.amt, debit:0, type:'dues', member:p.id, months:p.sel, seq:Date.now(), uid:S.user.uid, verified:false, paymentId:pref.id});
    b.update(db.doc('members/'+p.id),{dues});
    await b.commit(); sessionStorage.removeItem('thc-pay');
    $('#pay-utr').value=''; $('#pay-note').value=''; $('#pay-confirm').hidden=true; toast('Recorded. Months marked paid; treasurer will verify.'); }catch(e){ fail(e); }
});
function renderPayments(){
  const mine=Object.entries(S.payments).filter(([,p])=>S.isAdmin?true:p.uid===S.user?.uid).sort((a,b)=>(b[1].createdAt?.seconds||0)-(a[1].createdAt?.seconds||0)).slice(0,20);
  $('#my-payments').innerHTML = mine.length ? mine.map(([id,p])=>`<div class="row" style="cursor:default"><div class="body"><div class="t">${INR(p.amount)} · ${esc(p.months.map(mLabel).join(', '))}</div><div class="d">${S.isAdmin?esc(p.memberName)+' · ':''}${esc(p.app)} ${p.utr?'· '+esc(p.utr):''} · ${fmtDate(p.date)}</div></div><span class="pill ${p.status}">${p.status}</span></div>`).join('') : '<div class="empty">No payments submitted from the app yet</div>';
}
function verifySheet(){
  const pend=Object.entries(S.payments).filter(([,p])=>p.status==='pending').sort((a,b)=>(a[1].createdAt?.seconds||0)-(b[1].createdAt?.seconds||0));
  openSheet(`<div class="sheet-h"><h2>Verify payments</h2><button class="icon-btn" data-x>✕</button></div><p class="small muted">Match the UTR against the THC bank/UPI statement. Verifying posts a ledger credit and marks the months paid.</p><div class="list">${pend.length?pend.map(([id,p])=>`<div class="row" style="cursor:default;flex-wrap:wrap"><div class="body"><div class="t">${esc(p.memberName)} · ${INR(p.amount)}</div><div class="d">${esc(p.months.map(mLabel).join(', '))} · ${esc(p.app)} · UTR <b>${esc(p.utr||'—')}</b> · ${fmtDate(p.date)}${p.note?' · '+esc(p.note):''}</div></div><div class="row-btns"><button class="btn sm danger" data-rej="${id}">Reject</button><button class="btn sm" data-ver="${id}">Verify</button></div></div>`).join(''):'<div class="empty">Nothing pending</div>'}</div>`);
  $('#sheet').onclick = async e => { const v=e.target.closest('[data-ver]'), r=e.target.closest('[data-rej]'); if(!v&&!r) return; const id=(v||r).dataset.ver||(v||r).dataset.rej; const p=S.payments[id]; (v||r).disabled=true;
    try{ const m=S.members[p.memberId]; const dues={...(m?.dues||{})}; const b=db.batch();
      if(v){ p.months.forEach(mo=>{ if(dues[mo]) dues[mo]={s:'paid',amt:dues[mo].amt||fee()}; }); if(p.ledgerId) b.update(db.doc('ledger/'+p.ledgerId),{verified:true, verifiedBy:S.user.uid}); b.update(db.doc('payments/'+id),{status:'verified', verifiedBy:S.user.uid, verifiedAt:FV.serverTimestamp()}); }
      else { p.months.forEach(mo=>{ if(dues[mo]?.paymentId===id) delete dues[mo]; }); if(p.ledgerId) b.delete(db.doc('ledger/'+p.ledgerId)); b.update(db.doc('payments/'+id),{status:'rejected', verifiedBy:S.user.uid, verifiedAt:FV.serverTimestamp()}); }
      if(m) b.update(db.doc('members/'+p.memberId),{dues}); await b.commit();
      toast(v?'Verified':'Reversed: months back to pending, ledger entry removed'); verifySheet(); }catch(e){ fail(e); } };
}
async function applyPayment(memberId, sel, amount, date, particulars, paymentId){
  const m=S.members[memberId]; const dues={...(m.dues||{})}; const per=Math.round(amount/sel.length); sel.forEach(mo=>dues[mo]={s:'paid',amt:per});
  const b=db.batch(); const lref=db.collection('ledger').doc();
  b.set(lref,{date, particulars, credit:amount, debit:0, type:'dues', member:memberId, months:sel, seq:Date.now(), by:S.user.uid, verified:true});
  b.update(db.doc('members/'+memberId),{dues});
  
  await b.commit();
}
function recordSheet(presetId){
  const mem=activeMembers();
  openSheet(`<div class="sheet-h"><h2>Record payment</h2><button class="icon-btn" data-x>✕</button></div>
  <div class="frow"><div class="field"><label>Member</label><select id="r-m">${mem.map(([id,m])=>`<option value="${id}" ${id===presetId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div><div class="field"><label>Date received</label><input id="r-d" type="date" value="${isoToday}"></div></div>
  <div class="field"><label>Months</label><div class="checks" id="r-ms"></div></div>
  <div class="frow"><div class="field"><label>Per month</label><input id="r-fee" type="number" value="${fee()}"></div><div class="field"><label>Total</label><input id="r-tot" type="number" value="0"></div></div>
  <div class="field"><label>Reference (UTR, cash, note)</label><input id="r-ref" placeholder="Optional"></div>
  <div class="sheet-f"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="r-save">Save</button></div>`);
  const draw=()=>{ const m=S.members[$('#r-m').value]; const list=monthRange(months()[0],addMonths(curMonth,2)); const first=list.find(mo=>dueState(m,mo)==='pending');
    $('#r-ms').innerHTML=list.map(mo=>{ const st=dueState(m,mo); const has=st==='paid'||st==='na'; return `<label class="${has?'has':''}"><input type="checkbox" value="${mo}" ${mo===first?'checked':''}>${mLabel(mo)}${st==='paid'?' ✓':''}</label>`; }).join(''); tot(); };
  const tot=()=>{ $('#r-tot').value=$$('#r-ms input:checked').length*(+$('#r-fee').value||0); };
  $('#r-m').onchange=draw; $('#r-ms').onchange=tot; $('#r-fee').oninput=tot; draw();
  $('#r-save').onclick=async()=>{ const id=$('#r-m').value, m=S.members[id], sel=$$('#r-ms input:checked').map(i=>i.value); if(!sel.length) return toast('Pick at least one month'); const total=+$('#r-tot').value||sel.length*fee(); const ref=$('#r-ref').value.trim();
    try{ await applyPayment(id, sel, total, $('#r-d').value||isoToday, `${sel.length===1?mLong(sel[0]):sel.map(mLabel).join(', ')} payment from ${m.name}${ref?' · '+ref:''}`); closeSheet(); toast(`Recorded ${INR(total)} from ${m.name}`); }catch(e){ fail(e); } };
}

// ---------- events ----------
let evSubs={};
function subEventSubs(){
  Object.keys(S.events).forEach(id=>{ if(evSubs[id]) return; evSubs[id]=[
    db.collection(`events/${id}/rsvp`).onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); if(S.events[id]) { S.events[id].rsvp=o; renderEvents(); renderHome(); } }),
    db.collection(`events/${id}/attendance`).onSnapshot(s=>{ const o={}; s.forEach(d=>o[d.id]=d.data()); if(S.events[id]) { S.events[id].att=o; renderEvents(); renderHome(); } }) ]; });
  Object.keys(evSubs).forEach(id=>{ if(!S.events[id]){ evSubs[id].forEach(u=>u()); delete evSubs[id]; } });
}
function eventCard(id,e){
  const d=new Date(e.date+'T00:00'); const past=e.date<isoToday; const my=S.memberId; const going=Object.values(e.rsvp||{}).filter(r=>r.going).length; const att=Object.keys(e.att||{}).length;
  const myR=my&&e.rsvp?.[my]; const myA=my&&e.att?.[my];
  return `<div class="card ev"><div class="date"><div class="dbox"><b>${d.getDate()}</b><span>${MN[d.getMonth()]}</span></div><div style="min-width:0;flex:1"><h3>${esc(e.title)}</h3><div class="small muted">${e.time?esc(e.time)+' · ':''}${esc(e.venue||'')}</div></div>${S.isAdmin?`<button class="icon-btn" data-ev-edit="${id}">✎</button>`:''}</div>
  ${e.notes?`<div class="small" style="white-space:pre-wrap">${esc(e.notes)}</div>`:''}
  <div class="row-btns" style="justify-content:space-between"><span class="small muted">${going} going${past||att?` · ${att} attended`:''}</span>
  ${past ? (myA?'<span class="pill present">You attended</span>':'') : my ? `<div class="row-btns"><button class="chip ${myR?.going===true?'on':''}" data-rsvp="${id}" data-v="1">Going</button><button class="chip ${myR?.going===false?'on':''}" data-rsvp="${id}" data-v="0">Can't</button>${myA?'<span class="pill present">Checked in</span>':`<button class="btn sm" data-checkin="${id}">Check in</button>`}</div>` : ''}
  ${S.isAdmin?`<button class="chip" data-att="${id}">Attendance</button>`:''}<button class="chip" data-share="${id}">Share invite</button></div></div>`;
}
function renderEvents(){
  const list=Object.entries(S.events).sort((a,b)=>b[1].date.localeCompare(a[1].date)); const up=list.filter(([,e])=>e.date>=isoToday).reverse(), past=list.filter(([,e])=>e.date<isoToday);
  $('#event-list').innerHTML = (up.length?`<h2>Upcoming</h2>${up.map(([id,e])=>eventCard(id,e)).join('')}`:'<div class="card empty">No upcoming events</div>') + (past.length?`<h2 style="margin-top:8px">Past</h2>${past.slice(0,10).map(([id,e])=>eventCard(id,e)).join('')}`:'');
}
document.addEventListener('click', async e=>{
  const r=e.target.closest('[data-rsvp]'); if(r){ try{ await db.doc(`events/${r.dataset.rsvp}/rsvp/${S.memberId}`).set({going:r.dataset.v==='1', uid:S.user.uid, name:S.member.name, at:FV.serverTimestamp()}); }catch(x){ fail(x); } return; }
  const c=e.target.closest('[data-checkin]'); if(c){ checkinSheet(c.dataset.checkin); return; }
  const ed=e.target.closest('[data-ev-edit]'); if(ed){ eventForm(ed.dataset.evEdit); return; }
  const at=e.target.closest('[data-att]'); if(at){ attendanceSheet(at.dataset.att); return; }
  const sh=e.target.closest('[data-share]'); if(sh){ const ev=S.events[sh.dataset.share]; const url=new URL('event.html?e='+sh.dataset.share, location.href).href; const text=`THC · ${ev.title}\n${fmtDate(ev.date)}${ev.time?' · '+ev.time:''}${ev.venue?' · '+ev.venue:''}\n${url}`;
    if(navigator.share){ navigator.share({title:'THC · '+ev.title, text, url}).catch(()=>{}); } else { navigator.clipboard.writeText(text).then(()=>toast('Invite link copied')).catch(()=>toast(url)); } return; }
});
function checkinSheet(id){ const e=S.events[id];
  openSheet(`<div class="sheet-h"><h2>Check in</h2><button class="icon-btn" data-x>✕</button></div><p class="muted">${esc(e.title)} · ${fmtDate(e.date)}</p><div class="field"><label>Enter the 4-digit code announced at the venue</label><input id="ci-code" inputmode="numeric" maxlength="4" style="font-size:28px;letter-spacing:.3em;text-align:center"></div><div class="sheet-f"><button class="btn" id="ci-go">Mark me present</button></div>`);
  $('#ci-code').focus(); $('#ci-go').onclick=async()=>{ const code=$('#ci-code').value.trim(); if(code.length<4) return toast('Enter the 4-digit code'); try{ await db.doc(`events/${id}/attendance/${S.memberId}`).set({code, uid:S.user.uid, name:S.member.name, by:'self', at:FV.serverTimestamp()}); closeSheet(); toast('You are marked present'); }catch(x){ toast(x.code==='permission-denied'?'Wrong code, or check-in is closed':'Could not check in'); } };
}
function attendanceSheet(id){ const e=S.events[id]; const mem=activeMembers();
  openSheet(`<div class="sheet-h"><div><h2>Attendance</h2><div class="small muted">${esc(e.title)} · ${fmtDate(e.date)}</div></div><button class="icon-btn" data-x>✕</button></div><div><div class="small muted" style="text-align:center">Check-in code (read it out at the venue)</div><div class="code">${esc(e.code||'----')}</div></div><div class="list" style="max-height:50vh;overflow:auto">${mem.map(([mid,m])=>{ const a=e.att?.[mid]; const r=e.rsvp?.[mid]; return `<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(m.name)}</div><div class="d">${r?(r.going?'RSVP going':'RSVP can\'t'):'No RSVP'}${a?' · '+(a.by==='self'?'self check-in':'marked by admin'):''}</div></div><button class="chip ${a?'on':''}" data-tog="${mid}">${a?'Present':'Absent'}</button></div>`; }).join('')}</div><div class="small muted">${Object.keys(e.att||{}).length} present of ${mem.length}</div>`);
  $('#sheet').onclick=async ev=>{ if(ev.target.closest('[data-x]')) return closeSheet(); const b=ev.target.closest('[data-tog]'); if(!b) return; const mid=b.dataset.tog; const ref=db.doc(`events/${id}/attendance/${mid}`); try{ if(e.att?.[mid]) await ref.delete(); else await ref.set({uid:S.user.uid, name:S.members[mid].name, by:'admin', at:FV.serverTimestamp(), code:e.code||''}); setTimeout(()=>attendanceSheet(id),300); }catch(x){ fail(x); } };
}
function eventForm(id){ const e=id?S.events[id]:{title:'',date:'',time:'',venue:'',notes:'',code:String(Math.floor(1000+Math.random()*9000))};
  openSheet(`<div class="sheet-h"><h2>${id?'Edit event':'New event'}</h2><button class="icon-btn" data-x>✕</button></div>
  <div class="field"><label>Title</label><input id="e-t" value="${esc(e.title)}"></div><div class="frow"><div class="field"><label>Date</label><input id="e-d" type="date" value="${esc(e.date)}"></div><div class="field"><label>Time</label><input id="e-tm" value="${esc(e.time||'')}" placeholder="7:30 PM"></div></div>
  <div class="field"><label>Venue</label><input id="e-v" value="${esc(e.venue||'')}"></div><div class="field"><label>Notes</label><textarea id="e-n" rows="3">${esc(e.notes||'')}</textarea></div>
  <div class="frow"><div class="field"><label>Check-in code</label><input id="e-c" value="${esc(e.code||'')}" maxlength="4"></div><div class="field"><label><input type="checkbox" id="e-notify" ${id?'':'checked'}> Post a notice to members</label></div></div>
  <div class="sheet-f">${id?'<button class="btn danger" id="e-del" style="margin-right:auto">Delete</button>':''}<button class="btn ghost" data-x>Cancel</button><button class="btn" id="e-save">Save</button></div>`);
  $('#e-save').onclick=async()=>{ const d={title:$('#e-t').value.trim(), date:$('#e-d').value, time:$('#e-tm').value.trim(), venue:$('#e-v').value.trim(), notes:$('#e-n').value.trim(), code:$('#e-c').value.trim()||e.code, updatedAt:FV.serverTimestamp()}; if(!d.title||!d.date) return toast('Title and date are required');
    try{ if(id) await db.doc('events/'+id).update(d); else { d.createdAt=FV.serverTimestamp(); d.by=S.user.uid; d.reminded=false; await db.collection('events').add(d); }
      if($('#e-notify').checked) await db.collection('notices').add({title:`${id?'Updated':'New event'}: ${d.title}`, body:`${fmtDate(d.date)}${d.time?' · '+d.time:''}${d.venue?' · '+d.venue:''}\n${d.notes}`.trim(), createdAt:FV.serverTimestamp(), by:S.user.uid, byName:S.member?.name||'', sent:false});
      closeSheet(); toast('Saved'); }catch(x){ fail(x); } };
  $('#e-del')?.addEventListener('click', ev=>armConfirm(ev.target, ()=>db.doc('events/'+id).delete().then(closeSheet).catch(fail)));
}
$('#event-add').onclick=()=>eventForm(null);

// ---------- members ----------
function renderMembers(){
  const q=S.memQ.toLowerCase(); const list=allMembers().filter(([,m])=>!q||(m.name+' '+(m.studio||'')).toLowerCase().includes(q));
  $('#mgrid').innerHTML=list.map(([id,m])=>{ const due=pendingMonths(m).length; return `<button class="mcard" data-id="${id}"><span class="avatar">${initials(m.name)}</span><div><div class="nm">${esc(m.name)}</div><div class="st">${esc(m.studio||'')}</div></div><div class="row-btns">${m.position&&m.position!=='Member'?`<span class="pill ${m.position==='Chair'?'chair':'role'}">${esc(m.position)}</span>`:''}${m.status==='left'?'<span class="pill na">Left</span>':due?`<span class="pill pending">${due} due</span>`:'<span class="pill paid">Paid up</span>'}</div></button>`; }).join('')||'<div class="card empty">No members</div>';
}
$('#mem-q').addEventListener('input', e=>{ S.memQ=e.target.value; renderMembers(); });
$('#mgrid').addEventListener('click', e=>{ const c=e.target.closest('.mcard'); if(c) memberSheet(c.dataset.id); });
$('#mem-add').onclick=()=>memberForm(null);
function memberSheet(id){ const m=S.members[id]; const pm=pendingMonths(m); const paid=months().filter(mo=>dueState(m,mo)==='paid').reduce((s,mo)=>s+(m.dues?.[mo]?.amt||fee()),0); const canSee=S.isAdmin||id===S.memberId;
  openSheet(`<div class="sheet-h"><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:50px;height:50px;font-size:17px">${initials(m.name)}</span><div><h2>${esc(m.name)}</h2><div class="muted small">${esc(m.studio||'')} · ${esc(m.position||'Member')}${m.status==='left'?' · Left':''}</div></div></div><button class="icon-btn" data-x>✕</button></div>
  <div class="tiles2"><div class="tile" style="box-shadow:none;background:var(--fill)"><div class="lbl">Paid to date</div><div class="val num" style="font-size:20px">${INR(paid)}</div></div><div class="tile" style="box-shadow:none;background:var(--fill)"><div class="lbl">Outstanding</div><div class="val num" style="font-size:20px;color:${pm.length?'var(--warn-fg)':'var(--good)'}">${pm.length?INR(pm.length*fee()):'Nil'}</div><div class="sub">${pm.length?pm.map(mLabel).join(', '):'Up to date'}</div></div></div>
  <div class="kv"><div>Phone</div><div>${m.phone?`<span class="num">${esc(m.phone)}</span> <button class="chip" data-copy="${esc(m.phone)}">Copy</button>`:'—'}</div><div>Email</div><div>${esc(m.email||'—')}</div><div>Website</div><div>${m.website?`<a href="${/^https?:/.test(m.website)?esc(m.website):'https://'+esc(m.website)}" target="_blank" rel="noopener">${esc(m.website)}</a>`:'—'}</div>${canSee?`<div>Birthday</div><div>${fmtDate(m.birthday)}</div><div>Anniversary</div><div>${fmtDate(m.anniversary)}</div><div>Address</div><div>${esc(m.address||'—')}</div>`:''}<div>Member since</div><div>${m.joined?mLong(m.joined):'—'}</div></div>
  <div class="sheet-f admin"><button class="btn ghost" id="m-edit">Edit</button><button class="btn" id="m-pay">Record payment</button></div>`);
  $('#m-edit')?.addEventListener('click',()=>memberForm(id)); $('#m-pay')?.addEventListener('click',()=>recordSheet(id));
}
function memberForm(id){ const m=id?S.members[id]:{name:'',studio:'',position:'Member',status:'active',joined:curMonth};
  const f=(k,l,t='text')=>`<div class="field"><label>${l}</label><input id="f-${k}" type="${t}" value="${esc(m[k]||'')}"></div>`;
  openSheet(`<div class="sheet-h"><h2>${id?'Edit member':'Register a member'}</h2><button class="icon-btn" data-x>✕</button></div>
  <div class="frow">${f('name','Full name')}${f('studio','Studio')}</div><div class="frow"><div class="field"><label>Position</label><select id="f-position">${['Member','Chair','Media & PR','Research','Treasurer','Secretary'].map(p=>`<option ${m.position===p?'selected':''}>${p}</option>`).join('')}</select></div><div class="field"><label>Status</label><select id="f-status"><option value="active" ${m.status!=='left'?'selected':''}>Active</option><option value="left" ${m.status==='left'?'selected':''}>Left</option></select></div></div>
  <div class="frow"><div class="field"><label>Member since</label><input id="f-joined" type="month" value="${esc(m.joined||curMonth)}"></div><div class="field"><label>Last month (if left)</label><input id="f-left" type="month" value="${esc(m.left||'')}"></div></div>
  <div class="frow">${f('phone','Phone','tel')}${f('email','Google email (for sign-in)','email')}</div>${f('website','Website')}<div class="frow">${f('birthday','Birthday','date')}${f('anniversary','Anniversary','date')}</div><div class="field"><label>Address</label><textarea id="f-address" rows="2">${esc(m.address||'')}</textarea></div>
  <div class="sheet-f">${id?'<button class="btn danger" id="f-del" style="margin-right:auto">Remove</button>':''}<button class="btn ghost" data-x>Cancel</button><button class="btn" id="f-save">Save</button></div>`);
  $('#f-save').onclick=async()=>{ const g=k=>$('#f-'+k).value.trim(); if(!g('name')) return toast('Name required');
    const doc={...m, name:g('name'), studio:g('studio'), position:g('position'), status:g('status'), joined:g('joined')||curMonth, left:g('left')||null, phone:g('phone')||null, email:g('email').toLowerCase()||null, website:g('website')||null, birthday:g('birthday')||null, anniversary:g('anniversary')||null, address:g('address')||null, dues:m.dues||{}, order:m.order??(Math.max(0,...Object.values(S.members).map(x=>x.order||0))+1)};
    const did=id||slug(doc.name); if(!id&&S.members[did]) return toast('That member already exists');
    try{ await db.doc('members/'+did).set(doc); closeSheet(); toast('Saved'); }catch(x){ fail(x); } };
  $('#f-del')?.addEventListener('click', ev=>armConfirm(ev.target, ()=>db.doc('members/'+id).delete().then(closeSheet).catch(fail)));
}

// ---------- ledger + matrix + contributions ----------
function renderLedger(){
  const rows=ledgerRows(); let bal=0, cr=0, dr=0; rows.forEach(r=>{ cr+=+r.credit||0; dr+=+r.debit||0; bal=cr-dr; r.bal=bal; });
  $('#l-bal').textContent=INR(bal); $('#l-cs').textContent=`${INR(cr)} · ${INR(dr)}`;
  const monthsIn=[...new Set(rows.map(r=>(r.date||'').slice(0,7)).filter(Boolean))].sort().reverse(); const sel=$('#led-month'); const cur=sel.value||S.ledMonth;
  sel.innerHTML=`<option value="">All months</option>`+monthsIn.map(m=>`<option value="${m}" ${m===cur?'selected':''}>${mLong(m)}</option>`).join('');
  const q=S.ledQ.toLowerCase(); const shown=rows.filter(r=>(!S.ledMonth||(r.date||'').startsWith(S.ledMonth))&&(!q||(r.particulars||'').toLowerCase().includes(q))).reverse().slice(0,S.ledMonth||q?500:60);
  $('#ledger').innerHTML=`<thead><tr><th>Date</th><th>Particulars</th><th class="r">Cr</th><th class="r">Dr</th><th class="r">Bal</th></tr></thead><tbody>${shown.map(r=>`<tr data-led="${r.id}"><td class="num" style="white-space:nowrap">${fmtDate(r.date)}</td><td style="min-width:200px">${esc(r.particulars)}${r.debit>0?' <span class="pill cc">Exp</span>':''}${r.verified===false?' <span class="pill pending">unverified</span>':''}</td><td class="r num" style="color:var(--good)">${r.credit?INR(r.credit):''}</td><td class="r num" style="color:var(--bad)">${r.debit?INR(r.debit):''}</td><td class="r num muted">${INR(r.bal)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No entries</td></tr>'}</tbody>`;
}
$('#led-q').addEventListener('input', e=>{ S.ledQ=e.target.value; renderLedger(); }); $('#led-month').addEventListener('change', e=>{ S.ledMonth=e.target.value; renderLedger(); });
$('#ledger').addEventListener('click', e=>{ const tr=e.target.closest('[data-led]'); if(tr&&S.isAdmin) ledgerForm(tr.dataset.led); });
$('#led-credit').onclick=()=>ledgerForm(null,'dues'); $('#led-expense').onclick=()=>ledgerForm(null,'expense');
function ledgerForm(id,kind){ const r=id?{...S.ledger[id]}:{date:isoToday,particulars:'',credit:0,debit:0,type:kind||'dues'}; const isExp=id?r.debit>0:kind==='expense';
  openSheet(`<div class="sheet-h"><h2>${id?'Edit entry':isExp?'Add expense':'Add credit'}</h2><button class="icon-btn" data-x>✕</button></div><div class="frow"><div class="field"><label>Date</label><input id="l-d" type="date" value="${esc(r.date||isoToday)}"></div><div class="field"><label>Type</label><select id="l-t"><option value="dues" ${!isExp&&r.type!=='other'?'selected':''}>Subscription</option><option value="other" ${!isExp&&r.type==='other'?'selected':''}>Other credit</option><option value="expense" ${isExp?'selected':''}>Expense</option></select></div></div><div class="field"><label>Particulars</label><input id="l-p" value="${esc(r.particulars)}"></div><div class="field"><label>Amount (₹)</label><input id="l-a" type="number" value="${isExp?r.debit:r.credit}"></div>
  <div class="sheet-f">${id?'<button class="btn danger" id="l-del" style="margin-right:auto">Delete</button>':''}<button class="btn ghost" data-x>Cancel</button><button class="btn" id="l-save">Save</button></div>`);
  $('#l-save').onclick=async()=>{ const t=$('#l-t').value, a=+$('#l-a').value||0, p=$('#l-p').value.trim(); if(!p||!a) return toast('Particulars and amount required'); const doc={...r,date:$('#l-d').value||isoToday,particulars:p,type:t,credit:t==='expense'?0:a,debit:t==='expense'?a:0,seq:r.seq||Date.now()};
    try{ if(id) await db.doc('ledger/'+id).set(doc); else await db.collection('ledger').add(doc); closeSheet(); toast('Saved'); }catch(x){ fail(x); } };
  $('#l-del')?.addEventListener('click', ev=>armConfirm(ev.target, ()=>db.doc('ledger/'+id).delete().then(closeSheet).catch(fail)));
}
function renderMatrix(){
  const ms=months(); const mem=activeMembers(); const colTot=ms.map(()=>0);
  let h=`<thead><tr><th class="name sticky">Member</th>${ms.map(m=>`<th${m===curMonth?' style="color:var(--accent)"':''}>${mLabel(m)}</th>`).join('')}<th class="r">Due</th></tr></thead><tbody>`;
  mem.forEach(([id,m])=>{ let due=0; h+=`<tr><td class="name sticky">${esc(m.name)}</td>`; ms.forEach((mo,i)=>{ const st=dueState(m,mo); const amt=m.dues?.[mo]?.amt; if(st==='paid') colTot[i]+=amt||fee(); if(st==='pending') due+=fee(); h+=`<td><button class="cell ${st}${m.dues?.[mo]?.unverified?' unv':''}" title="${m.dues?.[mo]?.unverified?'Awaiting treasurer verification':''}" data-m="${id}" data-mo="${mo}" ${S.isAdmin?'':'disabled'}>${st==='paid'?(amt&&amt!==fee()?amt:'✓'):st==='pending'?'·':st==='cc'?'CC':'NA'}</button></td>`; }); h+=`<td class="r num" style="color:${due?'var(--warn-fg)':'var(--muted)'}">${due?INR(due):'—'}</td></tr>`; });
  h+=`</tbody><tfoot><tr><td class="name sticky" style="font-weight:600">Total</td>${colTot.map(v=>`<td class="num" style="font-weight:600">${v?Math.round(v/100)/10+'k':'—'}</td>`).join('')}<td></td></tr></tfoot>`;
  $('#matrix').innerHTML=h;
}
$('#matrix').addEventListener('click', e=>{ const b=e.target.closest('.cell'); if(!b||b.disabled) return; const m=S.members[b.dataset.m], mo=b.dataset.mo, st=dueState(m,mo);
  openSheet(`<div class="sheet-h"><div><h2>${esc(m.name)}</h2><div class="muted small">${mLong(mo)} · currently ${st}</div></div><button class="icon-btn" data-x>✕</button></div><div class="field"><label>Mark as</label><select id="c-st"><option value="paid" ${st==='paid'?'selected':''}>Paid</option><option value="pending" ${st==='pending'?'selected':''}>Pending</option><option value="cc" ${st==='cc'?'selected':''}>Couldn't collect</option><option value="na" ${st==='na'?'selected':''}>Not a member</option></select></div><div class="field"><label>Amount</label><input id="c-amt" type="number" value="${m.dues?.[mo]?.amt??fee()}"></div><p class="small muted">To also post a ledger entry, use Record payment instead.</p><div class="sheet-f"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="c-save">Save</button></div>`);
  $('#c-save').onclick=async()=>{ const v=$('#c-st').value; const dues={...(m.dues||{})}; if(v==='pending') delete dues[mo]; else dues[mo]=v==='paid'?{s:'paid',amt:+$('#c-amt').value||fee()}:{s:v}; try{ await db.doc('members/'+b.dataset.m).update({dues}); closeSheet(); toast('Saved'); }catch(x){ fail(x); } }; });
function renderContrib(){
  const rows=Object.entries(S.contrib).map(([id,c])=>({id,...c})).sort((a,b)=>(a.seq||0)-(b.seq||0)); const by={}; rows.forEach(r=>{(by[r.cause||'General']??=[]).push(r);});
  $('#con-list').innerHTML=Object.entries(by).map(([cause,list])=>{ const tot=list.reduce((s,r)=>s+(+r.amount||0),0), paid=list.filter(r=>r.status==='paid').reduce((s,r)=>s+(+r.amount||0),0);
    return `<div class="card tight"><div style="padding:16px 18px 8px"><h3>${esc(cause)}</h3><div class="small muted">${INR(paid)} received of ${INR(tot)}</div></div><div class="list">${list.map(r=>`<button class="row" data-con="${r.id}"><div class="body"><div class="t">${esc(r.name)}</div><div class="d">${fmtDate(r.date)}${r.details?' · '+esc(r.details):''}</div></div><div class="row-btns"><span class="num">${INR(r.amount)}</span><span class="pill ${r.status==='paid'?'paid':'pending'}">${r.status}</span></div></button>`).join('')}</div></div>`; }).join('')||'<div class="card empty">No contributions yet</div>';
}
$('#con-list').addEventListener('click', e=>{ const b=e.target.closest('[data-con]'); if(b&&S.isAdmin) contribForm(b.dataset.con); }); $('#con-add').onclick=()=>contribForm(null);
function contribForm(id){ const c=id?{...S.contrib[id]}:{cause:Object.values(S.contrib).slice(-1)[0]?.cause||'',name:'',amount:'',date:'',details:'',status:'pending'};
  openSheet(`<div class="sheet-h"><h2>${id?'Edit':'Add'} contribution</h2><button class="icon-btn" data-x>✕</button></div><div class="field"><label>Cause</label><input id="k-c" value="${esc(c.cause)}"></div><div class="frow"><div class="field"><label>Contributor</label><input id="k-n" value="${esc(c.name)}"></div><div class="field"><label>Amount</label><input id="k-a" type="number" value="${esc(c.amount)}"></div></div><div class="frow"><div class="field"><label>Date</label><input id="k-d" type="date" value="${esc(c.date||'')}"></div><div class="field"><label>Status</label><select id="k-s"><option value="paid" ${c.status==='paid'?'selected':''}>Paid</option><option value="pending" ${c.status!=='paid'?'selected':''}>Pending</option></select></div></div><div class="field"><label>Details</label><input id="k-r" value="${esc(c.details||'')}"></div>
  <div class="sheet-f">${id?'<button class="btn danger" id="k-del" style="margin-right:auto">Delete</button>':''}<button class="btn ghost" data-x>Cancel</button><button class="btn" id="k-save">Save</button></div>`);
  $('#k-save').onclick=async()=>{ const d={...c,cause:$('#k-c').value.trim()||'General',name:$('#k-n').value.trim(),amount:+$('#k-a').value||0,date:$('#k-d').value||null,status:$('#k-s').value,details:$('#k-r').value.trim(),seq:c.seq||Date.now()}; if(!d.name) return toast('Name required'); try{ if(id) await db.doc('contributions/'+id).set(d); else await db.collection('contributions').add(d); closeSheet(); toast('Saved'); }catch(x){ fail(x); } };
  $('#k-del')?.addEventListener('click', ev=>armConfirm(ev.target, ()=>db.doc('contributions/'+id).delete().then(closeSheet).catch(fail)));
}

// ---------- account / admin sheets ----------
function accountSheet(){ const u=S.user; const push=Notification?.permission;
  openSheet(`<div class="sheet-h"><h2>Account</h2><button class="icon-btn" data-x>✕</button></div><div class="kv"><div>Signed in</div><div>${esc(u.displayName||'')}<br><span class="muted">${esc(u.email)}</span></div><div>Member record</div><div>${S.member?esc(S.member.name)+(S.member.email?.toLowerCase()===u.email.toLowerCase()||S.member.uid===u.uid?' <span class="pill paid">confirmed</span>':' <span class="pill pending">awaiting confirmation</span>'):'<button class="chip" id="ac-link">Link my record</button>'}</div><div>Role</div><div>${S.isAdmin?'Treasurer / admin':'Member'}</div><div>Notifications</div><div>${push==='granted'?'<span class="pill paid">On</span>':`<button class="chip" id="ac-push">Turn on</button>`}</div></div>
  ${!window.matchMedia('(display-mode: standalone)').matches?`<div class="banner" style="background:var(--fill);color:var(--fg)"><b>Install the app:</b> ${isIOS?'Safari → Share → Add to Home Screen.':'Chrome menu (⋮) → Add to Home screen / Install app.'}</div>`:''}
  <div class="sheet-f"><button class="btn ghost" id="ac-out">Sign out</button></div>`);
  $('#ac-link')?.addEventListener('click',()=>{ closeSheet(); renderLink(); go('link'); }); $('#ac-push')?.addEventListener('click',async()=>{ await enablePush(); accountSheet(); }); $('#ac-out').onclick=()=>auth.signOut().then(closeSheet);
}
function settingsSheet(){
  openSheet(`<div class="sheet-h"><h2>Register settings</h2><button class="icon-btn" data-x>✕</button></div><div class="frow"><div class="field"><label>Monthly fee (₹)</label><input id="s-fee" type="number" value="${fee()}"></div><div class="field"><label>First month</label><input id="s-start" type="month" value="${esc(S.settings.startMonth||'2025-08')}"></div></div><div class="frow"><div class="field"><label>THC UPI ID (members pay here)</label><input id="s-upi" value="${esc(S.settings.upiId||(C.UPI_ID&&!C.UPI_ID.startsWith('PASTE')?C.UPI_ID:''))}" placeholder="thc@okaxis"></div><div class="field"><label>Payee name</label><input id="s-upn" value="${esc(S.settings.upiName||C.UPI_NAME||'The Hyderabad Cartel')}"></div></div>
  <div class="field"><label>Add an admin (Google email)</label><div class="row-btns"><input id="s-adm" type="email" placeholder="name@gmail.com" class="search"><button class="btn sm" id="s-adm-add">Add</button></div></div><div class="sheet-f"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="s-save">Save</button></div>`);
  $('#s-adm-add').onclick=async()=>{ const e=$('#s-adm').value.trim().toLowerCase(); if(!e) return; try{ await db.doc('admins/'+e).set({addedBy:S.user.uid, at:FV.serverTimestamp()}); toast(e+' is now an admin'); $('#s-adm').value=''; }catch(x){ fail(x); } };
  $('#s-save').onclick=async()=>{ try{ await db.doc('settings/general').set({fee:+$('#s-fee').value||1500, startMonth:$('#s-start').value||'2025-08', upiId:$('#s-upi').value.trim(), upiName:$('#s-upn').value.trim()},{merge:true}); closeSheet(); toast('Saved'); }catch(x){ fail(x); } };
}
async function linksSheet(){
  let users=[]; try{ const s=await db.collection('users').get(); s.forEach(d=>users.push({uid:d.id,...d.data()})); }catch(x){ fail(x); return; }
  const unconfirmed=users.filter(u=>u.memberId&&S.members[u.memberId]&&(S.members[u.memberId].email||'').toLowerCase()!==u.email&&S.members[u.memberId].uid!==u.uid);
  const noEmail=activeMembers().filter(([,m])=>!m.email);
  openSheet(`<div class="sheet-h"><h2>Sign-in links</h2><button class="icon-btn" data-x>✕</button></div><h3>Awaiting confirmation</h3><div class="list">${unconfirmed.length?unconfirmed.map(u=>`<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(u.name||u.email)}</div><div class="d">${esc(u.email)} → ${esc(S.members[u.memberId].name)}</div></div><button class="btn sm" data-conf="${u.memberId}" data-uid="${u.uid}" data-email="${esc(u.email)}">Confirm</button></div>`).join(''):'<div class="empty">None</div>'}</div><h3>Members without a sign-in email</h3><div class="small muted">${noEmail.map(([,m])=>esc(m.name)).join(', ')||'None'}. Add their Google email in Members → Edit so they link automatically.</div>`);
  $('#sheet').onclick=async e=>{ if(e.target.closest('[data-x]')) return closeSheet(); const b=e.target.closest('[data-conf]'); if(!b) return; try{ await db.doc('members/'+b.dataset.conf).update({email:b.dataset.email, uid:b.dataset.uid}); toast('Confirmed'); linksSheet(); }catch(x){ fail(x); } };
}
async function importSeed(){
  try{ const r=await fetch('seed.json'); const seed=await r.json(); const batches=[]; let b=db.batch(), n=0; const put=(p,d)=>{ b.set(db.doc(p),d); if(++n%400===0){ batches.push(b); b=db.batch(); } };
    put('settings/general',{...seed.settings.general, upiId:S.settings.upiId||'', upiName:S.settings.upiName||'The Hyderabad Cartel'});
    Object.entries(seed.members).forEach(([k,v])=>put('members/'+k,{...v,email:(v.email||'').toLowerCase()||null}));
    Object.entries(seed.ledger).forEach(([k,v])=>put('ledger/'+k,v)); Object.entries(seed.contributions).forEach(([k,v])=>put('contributions/'+k,v));
    batches.push(b); for(const x of batches) await x.commit(); toast('Register imported'); }catch(x){ fail(x); }
}

// ---------- service worker ----------
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
