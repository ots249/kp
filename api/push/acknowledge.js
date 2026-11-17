const { put, list, get } = require('@vercel/blob');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://civil4th.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, link } = req.body || {};
    if (!subscription?.endpoint || typeof link !== 'string' || !link.trim()) {
      return res.status(400).json({ success: false, error: 'Subscription and class link are required' });
    }
    const id = crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
    const path = `push/subscriptions/${id}.json`;
    const found = await list({ prefix: path });
    if (!found.blobs[0]) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const blob = await get(found.blobs[0].url, { access: 'private' });
    if (!blob || blob.statusCode !== 200) return res.status(404).json({ success: false, error: 'Subscription data unavailable' });
    const saved = await new Response(blob.stream).json();
    const key = crypto.createHash('sha256').update(link.trim()).digest('hex');
    saved.acknowledgedClassKeys = Array.isArray(saved.acknowledgedClassKeys) ? saved.acknowledgedClassKeys : [];
    if (!saved.acknowledgedClassKeys.includes(key)) saved.acknowledgedClassKeys.push(key);
    if (saved.lastReminderAt && typeof saved.lastReminderAt === 'object') delete saved.lastReminderAt[key];

    await put(path, JSON.stringify(saved), { access: 'private', addRandomSuffix: false, allowOverwrite: true });
    return res.status(200).json({ success: true, acknowledged: true });
  } catch (error) {
    console.error('Class reminder acknowledgement failed:', error);
    return res.status(500).json({ success: false, error: 'Could not acknowledge class' });
  }
};
