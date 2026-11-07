const { put, list, del } = require('@vercel/blob');
const crypto = require('crypto');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://civil4th.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { subscription, action } = req.body || {};
    if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
    const id = crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
    const path = `push/subscriptions/${id}.json`;
    if (action === 'unsubscribe') {
      const found = await list({ prefix: path });
      if (found.blobs[0]) await del(found.blobs[0].url);
      return res.status(200).json({ success: true, subscribed: false });
    }
    if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription keys' });
    }
    await put(path, JSON.stringify({ subscription, createdAt: new Date().toISOString() }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true
    });
    return res.status(200).json({ success: true, subscribed: true });
  } catch (error) {
    console.error('Push subscription error:', error);
    return res.status(500).json({ error: 'Subscription could not be saved' });
  }
};