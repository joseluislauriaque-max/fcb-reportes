// scripts/enviar-avisos.js
// Corre todos los días a las 07:00 (hora Uruguay) desde GitHub Actions.
// Lee la colección "vencimientos", y para cada ítem cuyo vencimiento esté a
// exactamente N días (según sus propios diasAviso) o venza HOY, envía una
// notificación push a todos los dispositivos registrados en "push_tokens".

const admin = require('firebase-admin');

const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(cred) });
const db = admin.firestore();

// "Hoy" en hora de Uruguay (UTC-3), como AAAA-MM-DD
function hoyUY() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });
  return s; // en-CA da formato YYYY-MM-DD
}
function diasEntre(hoy, fecha) {
  return Math.round((new Date(fecha + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 86400000);
}
function fmt(f) { const p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

async function main() {
  const hoy = hoyUY();
  console.log('Hoy (UY):', hoy);

  // 1) dispositivos registrados
  const tokSnap = await db.collection('push_tokens').get();
  const tokens = tokSnap.docs.map(d => d.id);
  console.log('Dispositivos registrados:', tokens.length);
  if (!tokens.length) { console.log('Sin dispositivos: nada que enviar.'); return; }

  // 2) vencimientos con aviso que cae hoy
  const vencSnap = await db.collection('vencimientos').get();
  const avisos = [];
  for (const doc of vencSnap.docs) {
    const v = doc.data();
    if (!v.fecha) continue;
    const d = diasEntre(hoy, v.fecha);
    const dias = (Array.isArray(v.diasAviso) && v.diasAviso.length) ? v.diasAviso : [30, 15, 7];
    const enviados = Array.isArray(v.avisosEnviados) ? v.avisosEnviados : [];

    const disparos = [];
    if (dias.includes(d)) disparos.push(d);          // aviso anticipado exacto
    if (d === 0) disparos.push(0);                   // vence hoy
    for (const disp of disparos) {
      const clave = v.fecha + '_' + disp;
      if (enviados.includes(clave)) continue;        // ya se envió este aviso
      avisos.push({ id: doc.id, v, d: disp, clave });
    }
  }
  console.log('Avisos a enviar:', avisos.length);
  if (!avisos.length) return;

  // 3) enviar cada aviso a todos los dispositivos
  const tokensMuertos = new Set();
  for (const a of avisos) {
    const v = a.v;
    const titulo = a.d === 0
      ? '🔴 VENCE HOY: ' + v.item
      : '⚠️ En ' + a.d + ' días vence: ' + v.item;
    const cuerpo =
      '📅 ' + fmt(v.fecha) +
      (v.dj === 'Sí' ? ' · 📝 Lleva declaración jurada' : '') +
      (v.contacto ? '\n📞 ' + v.contacto : '') +
      (v.requisitos ? '\n📋 ' + v.requisitos.slice(0, 300) : '');

    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title: titulo, body: cuerpo, tag: 'venc-' + a.id }
    });
    console.log(titulo, '→ ok:', res.successCount, 'fallos:', res.failureCount);
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument'))
          tokensMuertos.add(tokens[i]);
        else console.log('  error:', code);
      }
    });

    // marcar como enviado
    await db.collection('vencimientos').doc(a.id).update({
      avisosEnviados: admin.firestore.FieldValue.arrayUnion(a.clave)
    });
  }

  // 4) limpiar dispositivos dados de baja
  for (const t of tokensMuertos) {
    await db.collection('push_tokens').doc(t).delete();
    console.log('Token eliminado (dispositivo dado de baja).');
  }
  console.log('Listo.');
}

main().catch(e => { console.error(e); process.exit(1); });
