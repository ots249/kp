const { list, get, del } = require('@vercel/blob');
const webpush = require('web-push');

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin === 'https://civil4th.vercel.app') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supplied = String(req.headers['x-admin-secret'] || '');
  const expected = String(process.env.PUSH_ADMIN_SECRET || '');
  const crypto = require('crypto');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const row = req.body?.data || req.body || {};
    if (!row.subject || !row.chapter || !row.lecture || !row.type || !row.link) {
      return res.status(400).json({ error: 'Incomplete resource data' });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const type = String(row.type).toLowerCase();
    const isPdf = type.includes('pdf') || String(row.link).toLowerCase().includes('.pdf');
    const title = [row.subject, 'Chapter ' + row.chapter, row.lecture].filter(Boolean).join(' — ');
    const payload = JSON.stringify({
      title: isPdf ? 'নতুন PDF / Note যোগ হয়েছে' : 'নতুন Lecture যোগ হয়েছে',
      body: title,
      url: '/?notification=class',
      tag: 'civil4th-new-resource'
    });

    const subscriptions = await list({ prefix: 'push/subscriptions/' });
    let sent = 0;
    let removed = 0;
    let failed = 0;

    for (const blob of subscriptions.blobs) {
      try {
        const savedBlob = await get(blob.url, { access: 'private' });
        if (!savedBlob || savedBlob.statusCode !== 200) continue;
        const saved = await new Response(savedBlob.stream).json();
        await webpush.sendNotification(saved.subscription, payload);
        sent++;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await del(blob.url);
          removed++;
        } else {
          failed++;
          console.error('Immediate push delivery failed:', error.message);
        }
      }
    }

    return res.status(200).json({ success: true, sent, failed, removed, subscribers: subscriptions.blobs.length });
  } catch (error) {
    console.error('Immediate push error:', error);
    return res.status(500).json({ error: 'Notification delivery failed' });
  }
};
