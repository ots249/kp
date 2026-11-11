const SHEET_API = 'https://sheetapi249.vercel.app/api/v1/diploma-tutor/Sheet1';

function extractVideoId(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch (_) {}
  return '';
}

function unwrapRows(payload) {
  let data = payload;
  for (let i = 0; i < 5; i++) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    data = data.data || data.rows || data.records || data.results || data.sheet1 || [];
  }
  return Array.isArray(data) ? data : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const origin = req.headers.origin || '';
  if (origin && origin !== 'https://civil4th.vercel.app') return res.status(403).json({ success: false, error: 'Origin not allowed' });

  const apiKey = process.env.SHEETAPI_WRITE_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'Duration write is not configured' });

  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
    if (!incoming.length || incoming.length > 500) return res.status(400).json({ success: false, error: 'items must contain between 1 and 500 entries' });

    const unique = new Map();
    for (const item of incoming) {
      const row = Number(item.row);
      const videoId = String(item.videoId || '').trim();
      const seconds = Number(item.seconds);
      if (!Number.isInteger(row) || row < 2 || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId) ||
          !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
        return res.status(400).json({ success: false, error: 'Invalid row, videoId or duration in batch' });
      }
      if (!unique.has(row)) unique.set(row, { row, videoId, seconds });
    }

    // One sheet read for the entire batch.
    const readResponse = await fetch(SHEET_API);
    const readData = await readResponse.json().catch(() => ({}));
    if (!readResponse.ok) throw new Error('Could not read the course sheet');
    const rows = unwrapRows(readData);

    const updates = [];
    const skipped = [];
    for (const item of unique.values()) {
      const row = rows[item.row - 2];
      if (!row || extractVideoId(row.link) !== item.videoId) {
        skipped.push({ row: item.row, reason: 'row_or_video_mismatch' });
        continue;
      }
      const existing = String(row.duration == null ? '' : row.duration).trim();
      if ((/^\d+$/.test(existing) && Number(existing) > 0) || /^\d{1,3}:[0-5]\d$/.test(existing)) {
        skipped.push({ row: item.row, reason: 'already_cached' });
        continue;
      }
      updates.push({ row: item.row, data: { duration: item.seconds } });
    }

    if (!updates.length) return res.status(200).json({ success: true, updatedCount: 0, skippedCount: skipped.length, skipped });

    // One SheetAPI PATCH request writes every missing duration in a single batch.
    const writeResponse = await fetch(SHEET_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ rows: updates })
    });
    const writeData = await writeResponse.json().catch(() => ({}));
    if (!writeResponse.ok || writeData.success === false) {
      console.error('[Duration save] SheetAPI249 batch write failed:', writeResponse.status, writeData);
      return res.status(502).json({ success: false, error: 'SheetAPI249 batch write failed' });
    }

    return res.status(200).json({ success: true, updatedCount: updates.length, skippedCount: skipped.length, updatedRows: updates.map(x => x.row), skipped });
  } catch (error) {
    console.error('[Duration save] Batch error:', error);
    return res.status(500).json({ success: false, error: 'Duration batch could not be saved' });
  }
};
