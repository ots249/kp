const { list, get, del } = require('@vercel/blob');
const webpush = require('web-push');
const crypto = require('crypto');

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
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { title, message, url } = req.body || {};
    const cleanTitle = String(title || '').trim(), cleanMessage = String(message || '').trim();
    if (!cleanTitle || cleanTitle.length > 120 || !cleanMessage || cleanMessage.length > 500)
      return res.status(400).json({ error: 'Title (1-120) and message (1-500 characters) are required' });
    let targetUrl = '/';
    try {
      const parsed = new URL(String(url || '/'), 'https://civil4th.vercel.app');
      if (parsed.origin !== 'https://civil4th.vercel.app') return res.status(400).json({ error: 'Target URL must belong to Civil 4th' });
      targetUrl = parsed.pathname + parsed.search + parsed.hash;
    } catch (_) { return res.status(400).json({ error: 'Invalid target URL' }); }

    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const subscriptions = await list({ prefix: 'push/subscriptions/' });
    let sent = 0, removed = 0, failed = 0;
    for (const blob of subscriptions.blobs) {
      try {
        const savedBlob = await get(blob.url, { access: 'private' });
        if (!savedBlob || savedBlob.statusCode !== 200) { failed++; continue; }
        const saved = await new Response(savedBlob.stream).json();
        await webpush.sendNotification(saved.subscription, JSON.stringify({ title: cleanTitle, body: cleanMessage, url: targetUrl, tag: 'civil4th-custom-' + crypto.randomBytes(12).toString('hex') }));
        sent++;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          try { await del(blob.url); removed++; } catch (_) { failed++; }
        } else { failed++; console.error('[Custom Push] delivery failed:', error.message); }
      }
    }
    return res.status(200).json({ success: true, sent, failed, removed, subscribers: subscriptions.blobs.length });
  } catch (error) {
    console.error('[Custom Push] error:', error);
    return res.status(500).json({ error: 'Notification delivery failed' });
  }
};
