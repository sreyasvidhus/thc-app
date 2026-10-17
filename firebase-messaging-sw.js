importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
importScripts('firebase-config.js');
firebase.initializeApp(self.THC_CONFIG.firebase);
const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  const n = p.notification || {};
  self.registration.showNotification(n.title || 'THC', { body: n.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: p.data || {} });
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(ws => { const w = ws.find(x => 'focus' in x); return w ? w.focus() : clients.openWindow('./'); })); });
