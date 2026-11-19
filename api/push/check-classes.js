const { put, list, del, get } = require('@vercel/blob');
const webpush = require('web-push');
const crypto = require('crypto');
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
const classKey = row => crypto.createHash('sha256')
  .update(String(row.link || '').trim()).digest('hex');

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
    const added = previous.blobs.length ? rows.filter(r => !oldKeys.has(key(r))) : [];
    const subscriptions = await list({ prefix: 'push/subscriptions/' });
    let sent = 0, removed = 0, failed = 0, reminders = 0;

    for (const row of added) {
      if (!row.link) continue;
      const k = classKey(row);
      const type = String(row.type || '').toLowerCase();
      const isPdf = type.includes('pdf') || String(row.link).toLowerCase().includes('.pdf');
      const title = [row.subject, row.chapter, row.lecture].filter(Boolean).join(' — ') || 'নতুন ক্লাস';
      await put(`push/classes/${k}.json`, JSON.stringify({ key: k, row, createdAt: new Date().toISOString() }), {
        access: 'private', addRandomSuffix: false, allowOverwrite: true
      });
    }

    const activeClasses = await list({ prefix: 'push/classes/' });
    const now = Date.now();
    for (const blob of subscriptions.blobs) {
      try {
        const privateBlob = await get(blob.url, { access: 'private' });
        if (!privateBlob || privateBlob.statusCode !== 200) continue;
        const saved = await new Response(privateBlob.stream).json();
        saved.acknowledgedClassKeys = Array.isArray(saved.acknowledgedClassKeys) ? saved.acknowledgedClassKeys : [];
        saved.lastReminderAt = saved.lastReminderAt && typeof saved.lastReminderAt === 'object' ? saved.lastReminderAt : {};
        let changed = false;

        for (const classBlob of activeClasses.blobs) {
          const classDataBlob = await get(classBlob.url, { access: 'private' });
          if (!classDataBlob || classDataBlob.statusCode !== 200) continue;
          const item = await new Response(classDataBlob.stream).json();
          if (!item.key || !item.row || saved.acknowledgedClassKeys.includes(item.key)) continue;
          const lastSent = Number(saved.lastReminderAt[item.key] || 0);
          if (lastSent && now - lastSent < 60 * 60 * 1000) continue;

          const row = item.row;
          const type = String(row.type || '').toLowerCase();
          const isPdf = type.includes('pdf') || String(row.link || '').toLowerCase().includes('.pdf');
          const subject = String(row.subject || '').trim();
          const chapter = String(row.chapter || '').trim();
          const lecture = String(row.lecture || '').trim();
          const payload = JSON.stringify({
            title: subject || 'Civil 4th Semester',
            body: [
              isPdf ? 'নতুন PDF / Note যোগ হয়েছে' : 'নতুন Lecture যোগ হয়েছে',
              chapter ? 'Chapter ' + chapter : '',
              lecture ? 'Lecture ' + lecture : ''
            ].filter(Boolean).join(' • '),
            url: '/?openClass=' + encodeURIComponent(item.key),
            classKey: item.key,
            subject,
            chapter,
            lecture,
            resourceType: isPdf ? 'pdf' : 'lecture',
            tag: 'civil4th-class-' + item.key
          });
          try {
            await webpush.sendNotification(saved.subscription, payload);
            saved.lastReminderAt[item.key] = now;
            changed = true;
            sent++;
            if (lastSent) reminders++;
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) {
              await del(blob.url); removed++; break;
            }
            failed++;
            console.error('Push delivery failed:', e.message);
          }
        }
        if (changed) {
          await put(blob.pathname || `push/subscriptions/${blob.pathname}`, JSON.stringify(saved), {
            access: 'private', addRandomSuffix: false, allowOverwrite: true
          });
        }
      } catch (e) {
        console.error('Subscription reminder processing failed:', e.message);
      }
    }

    await put(SNAPSHOT, JSON.stringify(rows), { access: 'private', addRandomSuffix: false, allowOverwrite: true });
    return res.status(200).json({ checked: rows.length, added: added.length, sent, reminders, failed, removed });
  } catch (error) {
    console.error('Push cron error:', error);
    return res.status(500).json({ error: 'Notification check failed' });
  }
};
