// firebase-messaging-sw.js — recibe las notificaciones push con la app cerrada
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDlL_Cqrd3IuUJUwBpAMwSIBk35wEy_N40",
  authDomain: "fcb-reportes.firebaseapp.com",
  projectId: "fcb-reportes",
  storageBucket: "fcb-reportes.firebasestorage.app",
  messagingSenderId: "851433974409",
  appId: "1:851433974409:web:3e55f30a48f7fbf9b2f458"
});

const messaging = firebase.messaging();

// Mensajes en segundo plano (app cerrada o en otra pestaña)
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'FCB Vencimientos', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || 'fcb-venc',
    data: { url: self.registration.scope }
  });
});

// Al tocar la notificación, abrir/enfocar la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(e.notification.data && e.notification.data.url || './');
  }));
});
