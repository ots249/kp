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
  if (origin && origin !== 'https://civil4th.vercel.app') {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }

  const apiKey = process.env.SHEETAPI_WRITE_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'Duration write is not configured' });

  try {
    const rowNumber = Number(req.body && req.body.row);
    const videoId = String(req.body && req.body.videoId || '').trim();
    const seconds = Number(req.body && req.body.seconds);

    if (!Number.isInteger(rowNumber) || rowNumber < 2 ||
        !/^[A-Za-z0-9_-]{6,20}$/.test(videoId) ||
        !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
      return res.status(400).json({ success: false, error: 'Invalid row, videoId or duration' });
    }

    // Read the current sheet row first: never overwrite a populated duration
    // and only allow updates when the requested YouTube ID matches that row.
    const readResponse = await fetch(SHEET_API);
    const readData = await readResponse.json().catch(() => ({}));
    if (!readResponse.ok) throw new Error('Could not read the course sheet');
    const rows = unwrapRows(readData);
    const row = rows[rowNumber - 2];
    if (!row) return res.status(404).json({ success: false, error: 'Sheet row not found' });
    if (extractVideoId(row.link) !== videoId) {
      return res.status(409).json({ success: false, error: 'Video ID does not match the selected sheet row' });
    }

    const existing = String(row.duration == null ? '' : row.duration).trim();
    if (/^\d+$/.test(existing) && Number(existing) > 0) {
      return res.status(200).json({ success: true, cached: true, duration: Number(existing) });
    }
    if (/^\d{1,3}:[0-5]\d$/.test(existing)) {
      const parts = existing.split(':').map(Number);
      const savedSeconds = parts[0] * 60 + parts[1];
      return res.status(200).json({ success: true, cached: true, duration: savedSeconds });
    }

    const writeResponse = await fetch(SHEET_API + '?row=' + encodeURIComponent(rowNumber), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ data: { duration: seconds } })
    });
    const writeData = await writeResponse.json().catch(() => ({}));
    if (!writeResponse.ok || writeData.success === false) {
      console.error('[Duration save] SheetAPI249 rejected write:', writeResponse.status, writeData);
      return res.status(502).json({ success: false, error: 'SheetAPI249 write failed' });
    }

    return res.status(200).json({ success: true, cached: false, duration: seconds });
  } catch (error) {
    console.error('[Duration save] Error:', error);
    return res.status(500).json({ success: false, error: 'Duration could not be saved' });
  }
};
