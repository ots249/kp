const { put, list, del, get } = require('@vercel/blob');
const webpush = require('web-push');
const API = 'https://sheetapi249.vercel.app/api/v1/diploma-tutor/Sheet1';
const SNAPSHOT = 'push/state/course-snapshot.json';
const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Course API HTTP ' + r.status);
  const d = await r.json();
  if (Array.isArray(d)) return d;
  for (const k of ['data','rows','records','classes']) if (Array.isArray(d?.[k])) return d[k];
  throw new Error('Unrecognized SheetAPI response');
};
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const rows = await json(API);
    const previous = await list({ prefix: SNAPSHOT });
    let oldRows = [];
    if (previous.blobs[0]) {
      const snapshot = await get(previous.blobs[0].url, { access: 'private' });
      if (snapshot && snapshot.statusCode === 200) oldRows = await new Response(snapshot.stream).json();
    }
    const key = r => JSON.stringify([r.subject, r.chapter, r.lecture, r.type, r.link]);
    const oldKeys = new Set(oldRows.map(key));
    const added = rows.filter(r => !oldKeys.has(key(r)));
    if (!previous.blobs.length) {
      await put(SNAPSHOT, JSON.stringify(rows), { access: 'private', addRandomSuffix: false, allowOverwrite: true });
      return res.status(200).json({ initialized: true, notifications: 0 });
    }
    const subscriptions = await list({ prefix: 'push/subscriptions/' });
    let sent = 0, removed = 0;
    for (const row of added) {
      const type = String(row.type || '').toLowerCase();
      const isPdf = type.includes('pdf') || String(row.link || '').toLowerCase().includes('.pdf');
      const title = [row.subject, row.chapter, row.lecture].filter(Boolean).join(' — ') || 'নতুন ক্লাস';
      const payload = JSON.stringify({
        title: isPdf ? 'নতুন PDF / Note যোগ হয়েছে' : 'নতুন Lecture যোগ হয়েছে',
        body: title,
        url: '/?notification=class'
      });
      for (const blob of subscriptions.blobs) {
        try {
          const privateBlob = await get(blob.url, { access: 'private' });
          if (!privateBlob || privateBlob.statusCode !== 200) continue;
          const saved = await new Response(privateBlob.stream).json();
          await webpush.sendNotification(saved.subscription, payload);
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await del(blob.url); removed++;
          } else console.error('Push delivery failed:', e.message);
        }
      }
    }
    await put(SNAPSHOT, JSON.stringify(rows), { access: 'private', addRandomSuffix: false, allowOverwrite: true });
    return res.status(200).json({ checked: rows.length, added: added.length, sent, removed });
  } catch (error) {
    console.error('Push cron error:', error);
    return res.status(500).json({ error: 'Notification check failed' });
  }
};