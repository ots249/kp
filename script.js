// ============================================================
// Read API Endpoints (with fallback)
// ============================================================
const API_ENDPOINT = 'https://sheetapi249.vercel.app/api/v1/diploma-tutor/Sheet1';
const API_ENDPOINTS = [
    { name: 'SheetAPI249', url: API_ENDPOINT, timeout: 15000 }
];

// ============================================================
// Write API Endpoints
// ⚠️ SECURITY: browser theke write default e BONDHO.
// Server-side proxy (Apps Script / Vercel function) baniye
// ENABLE_DB_WRITE = true korle tokhon e chalu koro.
// ============================================================
const ENABLE_DB_WRITE = false;
const WRITE_API_ENDPOINTS = [{
    name: 'SheetAPI249',
    baseUrl: API_ENDPOINT,
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        ...(sessionStorage.getItem('sheetapi249_write_key')
            ? { 'X-API-Key': sessionStorage.getItem('sheetapi249_write_key') }
            : {})
    },
    buildPayload: (rowId, seconds) => ({ data: { duration: seconds } }),
    buildUrl: (baseUrl, rowId) => `${baseUrl}?row=${encodeURIComponent(rowId)}`
}];

// ============================================================
// API Config
// ============================================================
// 🔑 Notun key banao (purano ta leak hoyeche, delete koro).
// Google Cloud Console e: HTTP referrer = tomar domain, API restriction = YouTube Data API v3
const YOUTUBE_API_KEY = 'AIzaSyD8JqRloRcTNoZuR0tBy14wF7Bs7BxT3t4';
const COMPLETION_THRESHOLD = 0.90;
const DB_SAVE_CONCURRENT = 15;

const ADMIN_CLICKS_REQUIRED = 5;
const ADMIN_CLICK_WINDOW = 3000;
const ADMIN_PAGE = 'new.html';

// ============================================================
// State
// ============================================================
let completedItems = {};
let videoWatchProgress = {};
let videoDurationCache = {};   // videoId -> label ("MM:SS" / "H:MM:SS")
let cacheSaveTimer = null;
let _currentDbRows = [];

// ============================================================
// Theme — page load e system theme respect kore
// ============================================================
(function applyInitialTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    const apply = () => {
        document.body.classList.toggle('dark-mode', dark);
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.classList.toggle('fa-moon', dark);
            icon.classList.toggle('fa-sun', !dark);
        }
    };
    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', apply);
})();

// ============================================================
// YouTube IFrame API Loader
// ============================================================
let ytApiReady = false;
let ytApiReadyCallbacks = [];

function loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) {
        ytApiReady = true;
        ytApiReadyCallbacks.forEach(cb => cb());
        ytApiReadyCallbacks = [];
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        ytApiReadyCallbacks.push(resolve);
        if (document.getElementById('yt-iframe-api-script')) return;
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    });
}

window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    ytApiReadyCallbacks.forEach(cb => cb());
    ytApiReadyCallbacks = [];
};

// ============================================================
// localStorage
// ============================================================
function loadJSON(key, fallback) {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : fallback;
    } catch (e) { return fallback; }
}
function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error(`Error saving ${key}:`, e); }
}

function loadCompletedItems() { completedItems = loadJSON('completedCourseItems', {}); }
function saveCompletedItems() { saveJSON('completedCourseItems', completedItems); }
function loadVideoProgress() { videoWatchProgress = loadJSON('videoWatchProgress', {}); }
function saveVideoProgress() { saveJSON('videoWatchProgress', videoWatchProgress); }
function loadVideoDurationCache() { videoDurationCache = loadJSON('videoDurationCache', {}); }
function saveVideoDurationCache() {
    if (cacheSaveTimer) clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(() => saveJSON('videoDurationCache', videoDurationCache), 1000);
}

// Flush cache on tab hide/close
window.addEventListener('visibilitychange', () => {
    if (document.hidden && Object.keys(videoDurationCache).length > 0) {
        saveJSON('videoDurationCache', videoDurationCache);
    }
});

// ============================================================
// Fetch helpers
// ============================================================
function fetchWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalizeApiResponse(responseData) {
    // API 1 wrapper: { success, project, sheet, total, data: [...] }
    // Other sheet APIs: direct [...] or { data: [...] } / { sheet1: [...] }
    let data = responseData;

    // Some proxies return JSON encoded as a string.
    if (typeof data === 'string') {
        try { data = JSON.parse(data); }
        catch { throw new Error('API response valid JSON string নয়'); }
    }

    if (data && typeof data === 'object' && !Array.isArray(data) && data.success === false) {
        throw new Error(data.message || data.error || 'API success=false রিটার্ন করেছে');
    }

    // Unwrap common API response envelopes, including nested data/result/payload.
    for (let depth = 0; depth < 5; depth++) {
        if (Array.isArray(data)) {
            const rows = data.filter(row => row && typeof row === 'object' && !Array.isArray(row));
            if (rows.length !== data.length) {
                throw new Error('API data Array-তে invalid row পাওয়া গেছে');
            }
            return rows;
        }

        if (!data || typeof data !== 'object') return null;

        // Prefer the first key whose value is array/object (skip primitives).
        const preferredKeys = ['data', 'classes', 'rows', 'results', 'result', 'payload', 'sheet1'];
        let next = null;
        for (const key of preferredKeys) {
            const v = data[key];
            if (v !== undefined && v !== null && (Array.isArray(v) || typeof v === 'object')) {
                next = v;
                break;
            }
        }

        // Fallback: first array-valued key
        if (next === null) {
            const arrayValue = Object.values(data).find(Array.isArray);
            if (arrayValue) next = arrayValue;
        }

        if (next === null) return null;
        data = next;

        if (typeof data === 'string') {
            try { data = JSON.parse(data); }
            catch { return null; }
        }
    }

    return null;
}

async function fetchClassesWithFallback() {
    let lastError = null;
    const apiDiagnostics = [];

    for (let i = 0; i < API_ENDPOINTS.length; i++) {
        const api = API_ENDPOINTS[i];
        const startedAt = Date.now();
        let stage = 'request';
        let response = null;

        console.groupCollapsed(`[Course API] ${api.name} — চেষ্টা শুরু`);
        console.info('URL:', api.url);
        console.info('Timeout:', `${api.timeout}ms`);

        try {
            response = await fetchWithTimeout(api.url, api.timeout);

            console.info('HTTP response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                contentType: response.headers.get('content-type'),
                elapsedMs: Date.now() - startedAt
            });

            if (!response.ok) {
                stage = 'http';
                let errorBody = '';
                try { errorBody = (await response.text()).slice(0, 1000); } catch (_) {}
                throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim() +
                    (errorBody ? ` | Response: ${errorBody}` : ''));
            }

            stage = 'json';
            const data = await response.json();

            console.info('Response structure:', {
                rootType: Array.isArray(data) ? 'Array' : typeof data,
                rootKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
                success: data && data.success,
                project: data && data.project,
                sheet: data && data.sheet,
                total: data && data.total,
                cached: data && data.cached,
                stale: data && data.stale,
                dataIsArray: !!(data && Array.isArray(data.data)),
                dataLength: data && Array.isArray(data.data) ? data.data.length : undefined
            });

            stage = 'normalize';
            const normalizedRows = normalizeApiResponse(data);
            const classes = Array.isArray(normalizedRows)
                ? normalizedRows.map((row, index) => ({ ...row, _sheetRow: index + 2, id: row.id ?? index + 2 }))
                : normalizedRows;

            if (!Array.isArray(classes) || classes.length === 0) {
                throw new Error('JSON পাওয়া গেছে, কিন্তু usable rows Array খালি বা অনুপস্থিত');
            }

            const invalidRows = classes.filter(row =>
                !row || typeof row !== 'object' || Array.isArray(row)
            ).length;

            console.info('Normalized data:', {
                rowCount: classes.length,
                invalidRows,
                firstRowKeys: classes[0] ? Object.keys(classes[0]) : [],
                firstRowPreview: classes[0] || null,
                elapsedMs: Date.now() - startedAt
            });

            apiDiagnostics.push({
                api: api.name,
                result: 'SUCCESS',
                status: response.status,
                rows: classes.length,
                elapsedMs: Date.now() - startedAt
            });
            console.info(`✅ ${api.name} সফল — ${classes.length} rows`);
            console.groupEnd();

            if (i > 0) {
                console.warn('[Course API] Primary API ব্যর্থ হওয়ায় fallback ব্যবহার হয়েছে। বিস্তারিত উপরের error log-এ দেখুন।');
                showNotification(`⚠️ Primary API কাজ করেনি, ${api.name} ব্যবহার করা হয়েছে`, 'info');
            }

            console.table(apiDiagnostics);
            return classes;
        } catch (error) {
            const reason = error && error.name === 'AbortError'
                ? `Timeout (${api.timeout}ms)`
                : (error && error.message) || 'Unknown fetch error';

            let hint = '';
            if (error && error.name === 'AbortError') {
                hint = 'API নির্ধারিত সময়ের মধ্যে response দেয়নি। Timeout বাড়ানো বা server latency পরীক্ষা করুন।';
            } else if (/Failed to fetch|NetworkError|Load failed/i.test(reason)) {
                hint = 'সম্ভাব্য CORS, DNS, SSL, internet/network বা server connectivity সমস্যা। Browser response পড়তে পারেনি।';
            } else if (stage === 'json') {
                hint = 'HTTP response এসেছে, কিন্তু body valid JSON নয় অথবা JSON parse করা যায়নি।';
            } else if (stage === 'normalize') {
                hint = 'JSON এসেছে, কিন্তু response-এর ভেতরে প্রত্যাশিত rows Array পাওয়া যায়নি।';
            } else if (stage === 'http') {
                hint = 'Server non-2xx HTTP status দিয়েছে। Response body উপরে দেখুন।';
            }

            const diagnostic = {
                api: api.name,
                result: 'FAILED',
                stage,
                status: response ? response.status : 'NO_RESPONSE',
                elapsedMs: Date.now() - startedAt,
                errorName: error && error.name,
                error: reason,
                hint
            };
            apiDiagnostics.push(diagnostic);

            console.error(`❌ ${api.name} ব্যর্থ`, diagnostic);
            if (error && error.stack) console.error('Error stack:', error.stack);
            console.groupEnd();

            lastError = new Error(`${api.name} [${stage}]: ${reason}`);
        }
    }

    console.error('[Course API] সব API ব্যর্থ — সারাংশ:');
    console.table(apiDiagnostics);
    throw lastError || new Error('সব API ব্যর্থ হয়েছে');
}

// ============================================================
// Transform classes -> sections
// ✅ Notice row (subject starts with ⚠️) alada section hishebe rakha hoy
// ============================================================
function transformClassesToSections(classes) {
    if (!Array.isArray(classes)) return [];

    const grouped = {};
    const subjectOrder = [];

    classes.forEach((item, index) => {
        const subject = item.subject || `Subject ${index + 1}`;
        if (!grouped[subject]) {
            grouped[subject] = [];
            subjectOrder.push(subject);
        }
        grouped[subject].push(item);
    });

    let sectionId = 1;
    const sections = [];

    subjectOrder.forEach((subject) => {
        const items = grouped[subject];
        const isNotice = /^[⚠️\s]/.test(subject);

        const contents = items.map((item, idx) => {
            const chapter = item.chapter != null && item.chapter !== '' ? String(item.chapter) : '';
            const lecture = item.lecture != null && item.lecture !== '' ? String(item.lecture) : String(idx + 1);

            let title = '';
            if (isNotice) {
                // Notice row e chapter/lecture gulo text — sheta title hishebe dekhabo
                const parts = [chapter, lecture].filter(Boolean);
                title = parts.join(' — ') || 'নোটিশ';
            } else if (chapter) {
                title = `Chapter ${chapter} - Lecture ${lecture}`;
            } else {
                // chapter empty (Old Classes) => lecture er text-i title
                title = lecture;
            }

            const rowId = item.id != null && item.id !== '' ? String(item.id) : null;
            const contentId = rowId
                ? `row_${rowId}`
                : `${subject}_${chapter}_${lecture}_${idx}`.replace(/\s+/g, '_');

            const linkLower = String(item.link || '').toLowerCase();
            const explicitType = String(item.type || '').toLowerCase();
            let type = explicitType;
            if (!type) {
                if (linkLower.includes('.pdf')) type = 'pdf';
                else if (/youtu\.?be|youtube\.com/.test(linkLower)) type = 'video';
                else type = 'link';
            }

            return {
                id: contentId,
                title: title,
                type: type,
                link: item.link || '#',
                rowId: rowId,
                duration: item.duration || '',
                resource: { resourceable: { link: item.link || '#' } }
            };
        });

        sections.push({ id: sectionId++, title: subject, contents: contents });
    });

    return sections;
}

// ============================================================
// YouTube Video ID
// ============================================================
function extractYouTubeVideoId(url) {
    if (!url) return '';
    try {
        if (url.includes('youtu.be/')) {
            const rest = url.split('youtu.be/')[1];
            return rest ? rest.split(/[?&#]/)[0] : '';
        }
        if (url.includes('youtube.com/watch')) return new URL(url).searchParams.get('v') || '';
        if (url.includes('youtube.com/embed/')) {
            const rest = url.split('embed/')[1];
            return rest ? rest.split(/[?&#]/)[0] : '';
        }
        if (url.includes('youtube.com/shorts/')) {
            const rest = url.split('shorts/')[1];
            return rest ? rest.split(/[?&#]/)[0] : '';
        }
    } catch (e) { console.error('Invalid URL:', url); }
    return '';
}

// ============================================================
// Duration helpers
// DB te duration SECONDS (integer) hishebe save hobe — ambiguity nei.
// UI te label dekhabe: "MM:SS" ba "H:MM:SS"
// ============================================================
const pad2 = (n) => String(n).padStart(2, '0');

function secondsToLabel(total) {
    total = Math.max(0, Math.round(total));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function isoToSeconds(iso) {
    if (!iso) return 0;
    const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return 0;
    return (parseInt(match[1] || 0, 10) * 3600) +
           (parseInt(match[2] || 0, 10) * 60) +
           parseInt(match[3] || 0, 10);
}

// DB value -> label, ba null (invalid hole YouTube theke abar ana hobe)
function dbValueToLabel(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (!str || str === '--:--') return null;

    // Notun format: seconds
    if (/^\d+$/.test(str)) {
        const n = parseInt(str, 10);
        return n > 0 ? secondsToLabel(n) : null;
    }
    // Purano "MM:SS" (valid hole rakhi)
    if (/^\d{1,3}:[0-5]\d$/.test(str)) return str;

    // 3 ongsho ("15:30:00" — Sheets er auto-convert) ambiguous => invalid, refetch
    return null;
}

// ============================================================
// YouTube Durations — DB first, API fallback
// ============================================================
async function getVideoDurationsBatch(videoIds, dbRows) {
    const result = {};
    const uncachedIds = [];

    videoIds.forEach(id => {
        const row = Array.isArray(dbRows) ? dbRows.find(r => extractYouTubeVideoId(r.link) === id) : null;
        const label = row ? dbValueToLabel(row.duration) : null;

        if (label) {
            result[id] = label;
            videoDurationCache[id] = label;
        } else {
            uncachedIds.push({ id, rowId: row && (row._sheetRow || row.id) != null ? String(row._sheetRow || row.id) : null });
        }
    });

    if (uncachedIds.length === 0) return result;

    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        uncachedIds.forEach(({ id }) => { result[id] = videoDurationCache[id] || '--:--'; });
        return result;
    }

    const CHUNK_SIZE = 50;
    for (let i = 0; i < uncachedIds.length; i += CHUNK_SIZE) {
        const chunk = uncachedIds.slice(i, i + CHUNK_SIZE);
        const idsOnly = chunk.map(c => c.id);

        try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${idsOnly.join(',')}&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (!response.ok || data.error) {
                console.error('YouTube API Error:', data.error);
                chunk.forEach(({ id }) => { result[id] = videoDurationCache[id] || '--:--'; });
                continue;
            }

            const foundIds = new Set();
            const toSave = [];

            (data.items || []).forEach(item => {
                const seconds = isoToSeconds(item.contentDetails.duration);
                if (!seconds) return;
                const label = secondsToLabel(seconds);
                result[item.id] = label;
                videoDurationCache[item.id] = label;
                foundIds.add(item.id);

                const match = chunk.find(c => c.id === item.id);
                if (match && match.rowId) toSave.push({ rowId: match.rowId, seconds });
            });

            chunk.forEach(({ id }) => {
                if (!foundIds.has(id)) result[id] = videoDurationCache[id] || '--:--';
            });

            if (toSave.length > 0) await saveDurationsToDB(toSave);
        } catch (error) {
            console.error('Batch fetch error:', error);
            chunk.forEach(({ id }) => { result[id] = videoDurationCache[id] || '--:--'; });
        }
    }

    saveVideoDurationCache();
    return result;
}

// ============================================================
// Save durations to DB (ENABLE_DB_WRITE = true hole tobei)
// ============================================================
async function saveDurationsToDB(items) {
    if (!ENABLE_DB_WRITE || !items || items.length === 0) return;

    const validItems = items.filter(({ rowId, seconds }) => rowId && Number.isInteger(seconds) && seconds > 0);
    if (validItems.length === 0) return;

    const failedItems = [];

    for (let i = 0; i < validItems.length; i += DB_SAVE_CONCURRENT) {
        const chunk = validItems.slice(i, i + DB_SAVE_CONCURRENT);

        await Promise.allSettled(chunk.map(async ({ rowId, seconds }) => {
            const result = await saveSingleDurationWithFallback(rowId, seconds);
            if (!result.success) failedItems.push({ rowId, seconds });
        }));

        if (i + DB_SAVE_CONCURRENT < validItems.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    if (failedItems.length > 0 && failedItems.length <= 30) {
        for (const { rowId, seconds } of failedItems) {
            await saveSingleDurationWithFallback(rowId, seconds);
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function saveSingleDurationWithFallback(rowId, seconds) {
    for (const api of WRITE_API_ENDPOINTS) {
        try {
            const response = await fetch(api.buildUrl(api.baseUrl, rowId), {
                method: api.method,
                headers: api.headers,
                body: JSON.stringify(api.buildPayload(rowId, seconds))
            });
            if (response.ok) return { success: true, apiName: api.name };
            console.warn(`${api.name} failed (${response.status})`);
        } catch (error) {
            console.warn(`${api.name} error:`, error.message);
        }
    }
    return { success: false };
}

// ============================================================
// Update all video durations in DOM
// ============================================================
async function updateAllVideoDurations() {
    const items = [];
    const allIds = [];

    document.querySelectorAll('.content-item[data-type="video"]').forEach(contentItem => {
        const videoId = extractYouTubeVideoId(contentItem.dataset.link || '');
        if (!videoId) return;

        let durationSpan = contentItem.querySelector('.video-duration');
        if (!durationSpan) {
            durationSpan = document.createElement('span');
            durationSpan.className = 'video-duration';
            const linkIcon = contentItem.querySelector('.link-icon');
            if (linkIcon) contentItem.insertBefore(durationSpan, linkIcon);
            else contentItem.appendChild(durationSpan);
        }

        if (!durationSpan.textContent.trim() || durationSpan.querySelector('.fa-spinner')) {
            durationSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        items.push({ videoId, durationSpan });
        allIds.push(videoId);
    });

    if (allIds.length === 0) return;

    const durations = await getVideoDurationsBatch(allIds, _currentDbRows);

    items.forEach(({ videoId, durationSpan }) => {
        durationSpan.textContent = durations[videoId] || '--:--';
    });
}

// ============================================================
// Notification
// ============================================================
function showNotification(message, type = 'success') {
    document.querySelectorAll('.notification').forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'info' ? 'fa-info-circle' : 'fa-exclamation-circle';
    const bg = type === 'success' ? '#10b981' : type === 'info' ? '#3b82f6' : '#ef4444';

    const i = document.createElement('i');
    i.className = `fas ${icon}`;
    const span = document.createElement('span');
    span.textContent = message;
    notification.append(i, span);

    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${bg}; color: white;
        padding: 1rem 1.5rem; border-radius: 0.5rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
        z-index: 9999999; display: flex; align-items: center; gap: 0.75rem;
        animation: slideInRight 0.3s ease; font-weight: 500; max-width: 350px;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================================
// Complete toggle
// ============================================================
window.toggleComplete = function (itemId, checkbox, event) {
    if (event) event.stopPropagation();

    if (checkbox.checked) completedItems[itemId] = true;
    else delete completedItems[itemId];
    saveCompletedItems();

    const contentItem = checkbox.closest('.content-item');
    if (contentItem) contentItem.classList.toggle('completed', checkbox.checked);

    updateSectionProgress(checkbox.closest('.section-card'));
    updateOverallProgress();
};

function markCompletedAuto(itemId) {
    if (completedItems[itemId]) return false;

    completedItems[itemId] = true;
    saveCompletedItems();

    const contentItem = document.querySelector(`.content-item[data-item-id="${CSS.escape(itemId)}"]`);
    if (contentItem) {
        const checkbox = contentItem.querySelector('.complete-checkbox');
        if (checkbox) checkbox.checked = true;
        contentItem.classList.add('completed');
        showCompletionBurst(contentItem);
    }

    updateAllProgress();
    return true;
}

function showCompletionBurst(element) {
    const burst = document.createElement('div');
    burst.textContent = '✓';
    burst.style.cssText = `
        position: fixed; z-index: 99998; font-size: 2rem; color: #10b981;
        font-weight: bold; pointer-events: none; animation: completeBurst 1s ease forwards;
    `;
    const rect = element.getBoundingClientRect();
    burst.style.left = (rect.left + 20) + 'px';
    burst.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1000);
}

// ============================================================
// Progress
// ============================================================
function updateSectionProgress(sectionCard) {
    if (!sectionCard) return;

    const items = sectionCard.querySelectorAll('.content-item');
    const total = items.length;
    const done = Array.from(items).filter(i => i.querySelector('.complete-checkbox:checked')).length;

    const bar = sectionCard.querySelector('.section-progress-bar');
    const text = sectionCard.querySelector('.progress-text');
    if (bar && text) {
        bar.style.width = `${total > 0 ? (done / total) * 100 : 0}%`;
        text.textContent = `${done}/${total}`;
    }
}

function updateOverallProgress() {
    const items = document.querySelectorAll('.content-item');
    const total = items.length;
    const done = Array.from(items).filter(i => i.querySelector('.complete-checkbox:checked')).length;

    const fill = document.getElementById('global-progress-fill');
    const text = document.getElementById('global-progress-text');
    if (fill && text) {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        fill.style.width = `${pct}%`;
        text.textContent = `${pct}%`;
    }
}

function updateAllProgress() {
    document.querySelectorAll('.section-card').forEach(updateSectionProgress);
    updateOverallProgress();
}

// ============================================================
// Icon detection
// ============================================================
function getIconForContent(content, link, title) {
    const titleLower = (title || '').toLowerCase();
    const linkLower = (link || '').toLowerCase();

    if (content.type === 'pdf' || linkLower.includes('.pdf') || titleLower.includes('pdf') || titleLower.includes('পিডিএফ')) {
        return { iconClass: 'fas fa-file-pdf', isPDF: true, isYouTube: false };
    }

    if (content.type === 'video' || linkLower.includes('youtube.com') || linkLower.includes('youtu.be') ||
        titleLower.includes('ভিডিও') || titleLower.includes('video') ||
        titleLower.includes('ইউটিউব') || titleLower.includes('youtube')) {
        return { iconClass: 'fab fa-youtube', isPDF: false, isYouTube: true };
    }

    if (linkLower.includes('whatsapp') || titleLower.includes('whatsapp') || titleLower.includes('হোয়াটসঅ্যাপ')) {
        return { iconClass: 'fab fa-whatsapp', isPDF: false, isYouTube: false };
    }

    // Notice (relative link like notice.html) — special icon
    if (content.type === 'notice' || /^[⚠️\s]/.test(content.title || '')) {
        return { iconClass: 'fas fa-bullhorn', isPDF: false, isYouTube: false };
    }

    return { iconClass: 'fas fa-file-alt', isPDF: false, isYouTube: false };
}

// ============================================================
// Escape / URL helpers
// ============================================================
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escapeAttr = escapeHtml;

// ✅ FIX: '#' ba invalid / unsafe (javascript:) link block kora
// Relative same-origin link (notice.html) o allow kora hoy
function isUsableLink(url) {
    if (!url || url === '#') return false;
    try {
        const u = new URL(url, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        // javascript:, data:, vbscript: etc block hoy already
        return true;
    } catch { return false; }
}

// ============================================================
// PDF Viewer
// ============================================================
window.openPDFViewer = function (pdfUrl, title) {
    if (!isUsableLink(pdfUrl)) {
        showNotification('এই আইটেমের লিংক পাওয়া যায়নি', 'error');
        return;
    }

    const encodedUrl = encodeURIComponent(pdfUrl);
    const safeTitle = escapeHtml(title);

    const existing = document.getElementById('pdf-overlay-viewer');
    if (existing) existing.remove();

    if (!document.getElementById('pdf-overlay-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'pdf-overlay-style';
        styleEl.textContent = `
            @keyframes pdfFadeIn { from { opacity: 0; } to { opacity: 1; } }
            body.pdf-overlay-open { overflow: hidden !important; }
            #pdf-overlay-viewer { position: fixed; inset: 0; background: #f1f5f9; z-index: 999999; display: flex; flex-direction: column; animation: pdfFadeIn 0.25s ease; }
            #pdf-overlay-viewer .pdf-toolbar { background: #fff; padding: 0.75rem 1.25rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.08); border-bottom: 1px solid #e2e8f0; flex-shrink: 0; gap: 0.75rem; }
            #pdf-overlay-viewer .pdf-title-wrap { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }
            #pdf-overlay-viewer .pdf-title-wrap i { color: #2563eb; font-size: 1.4rem; flex-shrink: 0; }
            #pdf-overlay-viewer .pdf-title { color: #1e293b; font-size: 1rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
            #pdf-overlay-viewer .pdf-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
            #pdf-overlay-viewer .pdf-btn { background: #2563eb; color: #fff; border: none; border-radius: 0.5rem; padding: 0.55rem 1rem; font-size: 0.9rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; text-decoration: none; }
            #pdf-overlay-viewer .pdf-btn:hover { background: #1d4ed8; }
            #pdf-overlay-viewer .pdf-btn-close { background: #fff; color: #64748b; border: 1px solid #e2e8f0; width: 40px; height: 40px; padding: 0; justify-content: center; border-radius: 50%; font-size: 1rem; }
            #pdf-overlay-viewer .pdf-frame { flex: 1; width: 100%; border: none; background: #e2e8f0; }
            @media (max-width: 480px) {
                #pdf-overlay-viewer .pdf-title { font-size: 0.85rem; }
                #pdf-overlay-viewer .pdf-btn span { display: none; }
                #pdf-overlay-viewer .pdf-btn { padding: 0.5rem 0.7rem; }
            }
            @media (orientation: landscape) and (max-height: 500px) {
                #yt-overlay-player .yt-toolbar { padding: 0.25rem 0.6rem; }
                #yt-overlay-player .yt-btn { width: 30px; height: 30px; }
                #yt-overlay-player .yt-video-wrap { width: min(100%, calc((100dvh - 105px) * 1.7777778)); }
                #yt-overlay-player .yt-progress-info { padding: 0.2rem 0.6rem; }
                #yt-overlay-player .yt-control-panel { padding: 0.2rem 0.5rem; }
                #yt-overlay-player .yt-secondary-controls { display: flex; gap: 0.25rem; padding-top: 0.2rem; }
                #yt-overlay-player .yt-control-btn { min-height: 28px; padding: 0.2rem 0.4rem; }
                #yt-overlay-player .yt-control-btn span { display: inline; }
                #yt-overlay-player .yt-hint { display: none; }
            }
        `;
        document.head.appendChild(styleEl);
    }

    const overlay = document.createElement('div');
    overlay.id = 'pdf-overlay-viewer';
    overlay.innerHTML = `
        <div class="pdf-toolbar">
            <div class="pdf-title-wrap">
                <i class="fas fa-file-pdf"></i>
                <h3 class="pdf-title">${safeTitle}</h3>
            </div>
            <div class="pdf-actions">
                <a class="pdf-btn" href="${escapeAttr(pdfUrl)}" download target="_blank" rel="noopener">
                    <i class="fas fa-download"></i><span>ডাউনলোড</span>
                </a>
                <button class="pdf-btn pdf-btn-close" id="pdf-overlay-close"><i class="fas fa-times"></i></button>
            </div>
        </div>
        <iframe class="pdf-frame" src="https://docs.google.com/viewer?url=${encodedUrl}&embedded=true"></iframe>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('pdf-overlay-open');

    function closeOverlay() {
        const el = document.getElementById('pdf-overlay-viewer');
        document.removeEventListener('keydown', onKeydown);
        if (el) {
            el.style.animation = 'pdfFadeIn 0.15s ease reverse';
            setTimeout(() => {
                el.remove();
                document.body.classList.remove('pdf-overlay-open');
            }, 140);
        }
    }
    function onKeydown(e) {
        if (e.key === 'Escape' && document.fullscreenElement === overlay) {
            e.preventDefault();
            document.exitFullscreen().catch(() => {});
            return;
        }
        if (e.key === 'Escape') closeOverlay();
    }

    document.getElementById('pdf-overlay-close').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onKeydown);
};

// ============================================================
// YouTube Player — overlay
// ============================================================
window.openYouTubePlayer = async function (videoUrl, title, itemId) {
    const videoId = extractYouTubeVideoId(videoUrl);
    const safeTitle = escapeHtml(title);

    if (!videoId) {
        if (isUsableLink(videoUrl)) window.open(videoUrl, '_blank', 'noopener');
        else showNotification('এই আইটেমের লিংক পাওয়া যায়নি', 'error');
        return;
    }

    const existing = document.getElementById('yt-overlay-player');
    if (existing) existing.remove();

    if (!document.getElementById('yt-overlay-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'yt-overlay-style';
        styleEl.textContent = `
            @keyframes ytFadeIn { from { opacity: 0; } to { opacity: 1; } }
            body.yt-overlay-open { overflow: hidden !important; }
            #yt-overlay-player { position: fixed; inset: 0; height: 100vh; height: 100dvh; box-sizing: border-box; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); background: #000; z-index: 999999; display: flex; flex-direction: column; animation: ytFadeIn 0.25s ease; }
            #yt-overlay-player .yt-toolbar { background: #151515; padding: 0.55rem 0.8rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #242424; flex-shrink: 0; gap: 0.5rem; min-height: 48px; }
            #yt-overlay-player .yt-title-wrap { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }
            #yt-overlay-player .yt-title-wrap i.fa-youtube { color: #ff0000; font-size: 1.4rem; flex-shrink: 0; }
            #yt-overlay-player .yt-title { color: #fff; font-size: 0.88rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; line-height: 1.25; }
            #yt-overlay-player .yt-actions { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
            #yt-overlay-player .yt-control-panel { flex-shrink: 0; background: #101010; padding: 0.45rem 0.75rem 0.55rem; border-top: 1px solid #222; }
            #yt-overlay-player .yt-main-controls { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
            #yt-overlay-player .yt-control-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; min-width: 38px; min-height: 36px; padding: 0.35rem 0.55rem; border: 1px solid #383838; border-radius: 8px; color: #eee; background: #202020; font-size: 0.78rem; line-height: 1; text-decoration: none; cursor: pointer; white-space: nowrap; }
            #yt-overlay-player .yt-control-btn.is-active { color: #7dd3fc; border-color: #0369a1; background: #082f49; }
            #yt-overlay-player .yt-control-btn i { font-size: 0.9rem; }
            #yt-overlay-player .yt-play-toggle { width: 38px; padding: 0; color: #fff; background: #b91c1c; border-color: #dc2626; }
            #yt-overlay-player .yt-time { color: #cfcfcf; font: 500 0.72rem/1.2 system-ui,sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
            #yt-overlay-player .yt-seek { flex: 1; min-width: 30px; width: 100%; accent-color: #ef4444; height: 24px; cursor: pointer; }
            #yt-overlay-player .yt-secondary-controls { display: flex; justify-content: center; gap: 0.45rem; padding-top: 0.45rem; flex-wrap: wrap; }
            #yt-overlay-player .yt-progress-label { color:#888; font-size:0.68rem; white-space:nowrap; }
            #yt-overlay-player .yt-btn.is-active { background:#075985; border-color:#0284c7; color:#fff; }
            #yt-overlay-player .yt-video-wrap.is-locked::after { content:'SCREEN LOCKED'; position:absolute; inset:0; z-index:5; background:transparent; }
            #yt-overlay-player .yt-video-wrap.is-locked { touch-action:none; }
            #yt-overlay-player .yt-video-wrap.is-locked #yt-player-container { pointer-events:none; }
            #yt-overlay-player .yt-btn { background: rgba(51,51,51,0.85); border: 1px solid #444; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; font-size: 1rem; transition: all 0.2s ease; text-decoration: none; }
            #yt-overlay-player .yt-btn:hover { background: #333; }
            #yt-overlay-player .yt-btn.yt-yt-btn { background: rgba(255,0,0,0.9); border-color: #cc0000; }
            #yt-overlay-player .yt-btn.yt-yt-btn:hover { background: #cc0000; }
            /* Responsive 16:9 video viewport; avoids a tall letterboxed iframe on phones. */
            #yt-overlay-player .yt-video-wrap { flex: 0 1 auto; position: relative; width: min(100%, calc((100dvh - 170px) * 1.7777778)); aspect-ratio: 16 / 9; height: auto; align-self: center; margin: auto 0; background: #000; min-height: 0; overflow: hidden; }
            #yt-overlay-player #yt-player-container { position: absolute; inset: 0; width: 100%; height: 100%; }
            #yt-overlay-player #yt-player-container iframe { width: 100%; height: 100%; border: 0; }
            #yt-overlay-player .yt-video-wrap.is-locked::after { pointer-events: none; }
            #yt-overlay-player .yt-progress-info { background: #111; padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; border-top: 1px solid #222; }
            #yt-overlay-player .yt-progress-bar-wrap { flex: 1; height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
            #yt-overlay-player .yt-progress-bar { height: 100%; width: 0%; background: linear-gradient(90deg, #ef4444, #10b981); transition: width 0.3s ease; border-radius: 3px; }
            #yt-overlay-player .yt-progress-text { color: #aaa; font-size: 0.8rem; font-weight: 500; min-width: 45px; text-align: right; font-variant-numeric: tabular-nums; }
            #yt-overlay-player .yt-progress-text.threshold-reached { color: #10b981; }
            #yt-overlay-player .yt-hint { background: #111; color: #888; padding: 0.4rem 1rem; font-size: 0.75rem; text-align: center; border-top: 1px solid #222; flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
            #yt-overlay-player .yt-hint.unlocked { background: linear-gradient(90deg, #065f46, #10b981); color: #fff; }
            @media (max-width: 480px) {
                #yt-overlay-player .yt-title { font-size: 0.82rem; max-width: 78vw; }
                #yt-overlay-player .yt-btn { width: 32px; height: 32px; font-size: 0.78rem; }
                #yt-overlay-player .yt-actions { gap: 0.2rem; }
                #yt-overlay-player .yt-toolbar { padding: 0.35rem 0.5rem; gap: 0.3rem; }
                #yt-overlay-player .yt-control-panel { padding: 0.35rem 0.45rem 0.45rem; }
                #yt-overlay-player .yt-main-controls { gap: 0.35rem; }
                #yt-overlay-player .yt-time { font-size: 0.66rem; }
                #yt-overlay-player .yt-secondary-controls { gap: 0.3rem; padding-top: 0.35rem; }
                #yt-overlay-player .yt-control-btn { min-height: 32px; padding: 0.3rem 0.42rem; font-size: 0.68rem; }
                #yt-overlay-player .yt-control-btn i { font-size: 0.78rem; }
                #yt-overlay-player .yt-progress-label { display:none; }
                #yt-overlay-player .yt-hint { font-size: 0.7rem; padding: 0.3rem 0.5rem; }
            }
            @media (orientation: landscape) and (max-height: 500px) {
                #yt-overlay-player .yt-toolbar { padding: 0.25rem 0.6rem; }
                #yt-overlay-player .yt-btn { width: 30px; height: 30px; }
                #yt-overlay-player .yt-video-wrap { width: min(100%, calc((100dvh - 105px) * 1.7777778)); }
                #yt-overlay-player .yt-progress-info { padding: 0.25rem 0.7rem; }
                #yt-overlay-player .yt-hint { display: none; }
            }

            /* Fullscreen: let the video wrapper use remaining flex space,
               then size the actual 16:9 iframe viewport within that space. */
            #yt-overlay-player:fullscreen .yt-video-wrap,
            #yt-overlay-player:-webkit-full-screen .yt-video-wrap,
            #yt-overlay-player:-moz-full-screen .yt-video-wrap {
                flex: 1 1 auto !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                height: auto !important;
                aspect-ratio: auto !important;
                align-self: stretch !important;
                margin: 0 !important;
            }
            #yt-overlay-player:fullscreen #yt-player-container,
            #yt-overlay-player:-webkit-full-screen #yt-player-container,
            #yt-overlay-player:-moz-full-screen #yt-player-container {
                position: relative !important;
                inset: auto !important;
                flex: 0 1 auto !important;
                width: min(100%, calc((100dvh - 190px) * 1.7777778)) !important;
                max-width: 100% !important;
                max-height: 100% !important;
                height: auto !important;
                aspect-ratio: 16 / 9 !important;
            }
            #yt-overlay-player:fullscreen #yt-player-container iframe,
            #yt-overlay-player:-webkit-full-screen #yt-player-container iframe,
            #yt-overlay-player:-moz-full-screen #yt-player-container iframe {
                position: absolute !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }
            @media (orientation: landscape) and (max-height: 500px) {
                #yt-overlay-player:fullscreen #yt-player-container,
                #yt-overlay-player:-webkit-full-screen #yt-player-container,
                #yt-overlay-player:-moz-full-screen #yt-player-container {
                    width: min(100%, calc((100dvh - 145px) * 1.7777778)) !important;
                }
            }
        `;
        document.head.appendChild(styleEl);
    }

    const overlay = document.createElement('div');
    overlay.id = 'yt-overlay-player';
    overlay.innerHTML = `
        <div class="yt-toolbar">
            <div class="yt-title-wrap">
                <i class="fab fa-youtube"></i>
                <h3 class="yt-title">${safeTitle}</h3>
            </div>
            <div class="yt-actions">
                <button class="yt-btn" id="yt-overlay-close" type="button" aria-label="Close player" title="বন্ধ করুন"><i class="fas fa-times"></i></button>
            </div>
        </div>
        <div class="yt-video-wrap"><div id="yt-player-container"></div></div>
        <div class="yt-control-panel" aria-label="Video controls">
            <div class="yt-main-controls">
                <button class="yt-control-btn yt-play-toggle" id="yt-play-toggle" type="button" aria-label="Play" title="Play"><i class="fas fa-play"></i></button>
                <span class="yt-time" id="yt-current-time">0:00</span>
                <input class="yt-seek" id="yt-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek video">
                <span class="yt-time" id="yt-duration">0:00</span>
            </div>
            <div class="yt-secondary-controls">
                <button class="yt-control-btn" id="yt-auto-next" type="button" aria-pressed="true" title="Auto Next চালু"><i class="fas fa-forward-step"></i><span>Auto Next</span></button>
                <button class="yt-control-btn" id="yt-screen-lock" type="button" aria-pressed="false" title="Screen Lock"><i class="fas fa-lock-open"></i><span>Lock</span></button>
                <button class="yt-control-btn" id="yt-mute-toggle" type="button" aria-pressed="false" title="Mute"><i class="fas fa-volume-up"></i><span>Sound</span></button>
                <button class="yt-control-btn" id="yt-fullscreen-toggle" type="button" aria-pressed="false" title="Fullscreen" aria-label="Enter fullscreen"><i class="fas fa-expand"></i><span>Fullscreen</span></button>
                <a class="yt-control-btn" href="${escapeAttr(videoUrl)}" target="_blank" rel="noopener" title="YouTube-এ খুলুন"><i class="fab fa-youtube"></i><span>YouTube</span></a>
            </div>
        </div>
        <div class="yt-progress-info">
            <span class="yt-progress-label">Course progress</span>
            <div class="yt-progress-bar-wrap"><div class="yt-progress-bar" id="yt-progress-bar"></div></div>
            <span class="yt-progress-text" id="yt-progress-text">0%</span>
        </div>
        <div class="yt-hint" id="yt-hint">
            <i class="fas fa-info-circle"></i>
            <span>ভিডিও <strong>90%</strong> দেখলে অটো Complete হবে</span>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('yt-overlay-open');

    const closeBtn = document.getElementById('yt-overlay-close');
    const autoNextBtn = document.getElementById('yt-auto-next');
    const screenLockBtn = document.getElementById('yt-screen-lock');
    const playToggleBtn = document.getElementById('yt-play-toggle');
    const muteToggleBtn = document.getElementById('yt-mute-toggle');
    const fullscreenToggleBtn = document.getElementById('yt-fullscreen-toggle');
    const seekInput = document.getElementById('yt-seek');
    const currentTimeLabel = document.getElementById('yt-current-time');
    const durationLabel = document.getElementById('yt-duration');
    const videoWrap = overlay.querySelector('.yt-video-wrap');
    let isSeeking = false;

    const PLAYER_MEMORY_KEY = 'civil4thPlayerSettings';
    let playerMemory = {};
    try { playerMemory = JSON.parse(localStorage.getItem(PLAYER_MEMORY_KEY) || '{}'); } catch (_) {}
    const savedAutoNext = playerMemory.autoNext !== false;
    let autoNextEnabled = savedAutoNext;
    let screenLocked = false;

    function savePlayerMemory(patch) {
        playerMemory = { ...playerMemory, ...patch };
        try { localStorage.setItem(PLAYER_MEMORY_KEY, JSON.stringify(playerMemory)); } catch (_) {}
    }

    function updateAutoNextButton() {
        autoNextBtn.classList.toggle('is-active', autoNextEnabled);
        autoNextBtn.setAttribute('aria-pressed', String(autoNextEnabled));
        autoNextBtn.title = autoNextEnabled ? 'Auto Next চালু' : 'Auto Next বন্ধ';
        autoNextBtn.classList.toggle('is-active', autoNextEnabled);
    }
    updateAutoNextButton();

    screenLockBtn.addEventListener('click', () => {
        screenLocked = !screenLocked;
        videoWrap.classList.toggle('is-locked', screenLocked);
        screenLockBtn.classList.toggle('is-active', screenLocked);
        screenLockBtn.setAttribute('aria-pressed', String(screenLocked));
        screenLockBtn.innerHTML = screenLocked
            ? '<i class="fas fa-lock"></i>'
            : '<i class="fas fa-lock-open"></i>';
        screenLockBtn.title = screenLocked ? 'Screen Unlock' : 'Screen Lock';
        const lockLabel = screenLockBtn.querySelector('span');
        if (lockLabel) lockLabel.textContent = screenLocked ? 'Unlock' : 'Lock';
    });

    function formatPlayerTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const value = Math.floor(seconds);
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const secs = value % 60;
        return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0') : minutes + ':' + String(secs).padStart(2, '0');
    }

    function updatePlaybackControls() {
        if (!player || !player.getPlayerState) return;
        const state = player.getPlayerState();
        const playing = state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING;
        playToggleBtn.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        playToggleBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        playToggleBtn.title = playing ? 'Pause' : 'Play';
        try {
            const duration = player.getDuration() || 0;
            const current = player.getCurrentTime() || 0;
            durationLabel.textContent = formatPlayerTime(duration);
            currentTimeLabel.textContent = formatPlayerTime(current);
            if (!isSeeking && duration > 0) seekInput.value = String(Math.round((current / duration) * 1000));
        } catch (_) {}
        const muted = player.isMuted && player.isMuted();
        muteToggleBtn.innerHTML = muted ? '<i class="fas fa-volume-mute"></i><span>Muted</span>' : '<i class="fas fa-volume-up"></i><span>Sound</span>';
        muteToggleBtn.setAttribute('aria-pressed', String(!!muted));
        muteToggleBtn.classList.toggle('is-active', !!muted);
    }

    playToggleBtn.addEventListener('click', () => {
        if (!player) return;
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) player.pauseVideo();
        else player.playVideo();
        setTimeout(updatePlaybackControls, 100);
    });

    muteToggleBtn.addEventListener('click', () => {
        if (!player) return;
        if (player.isMuted()) player.unMute();
        else player.mute();
        updatePlaybackControls();
    });

    function updateFullscreenButton() {
        const active = !!document.fullscreenElement;
        fullscreenToggleBtn.innerHTML = active
            ? '<i class="fas fa-compress"></i><span>Exit</span>'
            : '<i class="fas fa-expand"></i><span>Fullscreen</span>';
        fullscreenToggleBtn.setAttribute('aria-pressed', String(active));
        fullscreenToggleBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
        fullscreenToggleBtn.title = active ? 'Exit fullscreen' : 'Fullscreen';
    }

    fullscreenToggleBtn.addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (overlay.requestFullscreen) {
                await overlay.requestFullscreen();
                // Orientation lock is optional; unsupported browsers simply stay in fullscreen.
                if (screen.orientation && screen.orientation.lock) {
                    try { await screen.orientation.lock('landscape'); } catch (_) {}
                }
            } else {
                showNotification('এই ব্রাউজারে Fullscreen সমর্থিত নয়', 'warning');
            }
        } catch (error) {
            console.warn('Fullscreen request failed:', error);
            showNotification('Fullscreen চালু করা যায়নি। Chrome-এর অনুমতি পরীক্ষা করুন।', 'warning');
        }
        updateFullscreenButton();
    });

    document.addEventListener('fullscreenchange', updateFullscreenButton);

    seekInput.addEventListener('pointerdown', () => { isSeeking = true; });
    seekInput.addEventListener('input', () => {
        isSeeking = true;
        const duration = player && player.getDuration ? player.getDuration() : 0;
        if (duration > 0) currentTimeLabel.textContent = formatPlayerTime((Number(seekInput.value) / 1000) * duration);
    });
    const finishSeek = () => {
        if (!isSeeking) return;
        const duration = player && player.getDuration ? player.getDuration() : 0;
        if (duration > 0) player.seekTo((Number(seekInput.value) / 1000) * duration, true);
        isSeeking = false;
        setTimeout(updatePlaybackControls, 250);
    };
    seekInput.addEventListener('change', finishSeek);
    seekInput.addEventListener('pointerup', finishSeek);
    seekInput.addEventListener('pointercancel', finishSeek);

    autoNextBtn.addEventListener('click', () => {
        autoNextEnabled = !autoNextEnabled;
        savePlayerMemory({ autoNext: autoNextEnabled });
        updateAutoNextButton();
        showNotification(autoNextEnabled ? 'Auto Next চালু হয়েছে' : 'Auto Next বন্ধ হয়েছে', 'info');
    });

    await loadYouTubeIframeAPI();

    let player = null;
    let progressCheckInterval = null;
    let completedFlag = false;

    const savedProgress = videoWatchProgress[itemId] || 0;

    player = new YT.Player('yt-player-container', {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1, fs: 0, iv_load_policy: 3 },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });

    // Resume position — video er asol duration diye seek
    function onPlayerReady(event) {
        const d = event.target.getDuration();
        if (d && savedProgress > 0.02 && savedProgress < COMPLETION_THRESHOLD) {
            event.target.seekTo(savedProgress * d, true);
        }
        // Already completed? reflect in hint UI
        if (itemId && completedItems[itemId]) updateHintUI();
        durationLabel.textContent = formatPlayerTime(event.target.getDuration() || 0);
        updatePlaybackControls();
        event.target.playVideo();
        startProgressTracking();
    }

    function onPlayerStateChange(event) {
        updatePlaybackControls();
        if (event.data === YT.PlayerState.PLAYING) {
            startProgressTracking();
        } else if (event.data === YT.PlayerState.PAUSED) {
            stopProgressTracking();
        } else if (event.data === YT.PlayerState.ENDED) {
            checkAndMarkCompletion(true);
            stopProgressTracking();
            if (autoNextEnabled) playNextLecture();
        }
    }

    function playNextLecture() {
        const videoItems = Array.from(document.querySelectorAll('.content-item[data-type="video"]'));
        const currentIndex = videoItems.findIndex(item => item.dataset.itemId === itemId);
        const nextItem = currentIndex >= 0 ? videoItems[currentIndex + 1] : null;
        if (!nextItem) {
            showNotification('এটাই শেষ ভিডিও। আর কোনো পরের Lecture নেই।', 'info');
            return;
        }
        const nextTitle = nextItem.dataset.title || 'পরবর্তী Lecture';
        const nextLink = nextItem.dataset.link || '';
        const nextId = nextItem.dataset.itemId;
        showNotification('পরবর্তী Lecture চালু হচ্ছে: ' + nextTitle, 'success');
        closeOverlay();
        setTimeout(() => window.openYouTubePlayer(nextLink, nextTitle, nextId), 180);
    }

    function onPlayerError(event) {
        console.error('Player error:', event.data);
        showNotification('ভিডিও লোড করা যায়নি', 'error');
    }

    function startProgressTracking() {
        if (progressCheckInterval) return;
        progressCheckInterval = setInterval(() => {
            checkAndMarkCompletion(false);
            updatePlaybackControls();
        }, 1000);
    }

    function stopProgressTracking() {
        if (progressCheckInterval) {
            clearInterval(progressCheckInterval);
            progressCheckInterval = null;
        }
    }

    function checkAndMarkCompletion(forceComplete) {
        if (!player || !player.getDuration) return;

        const duration = player.getDuration();
        const current = player.getCurrentTime();
        if (!duration) return;

        const percentage = Math.min(current / duration, 1);
        updateProgressUI(percentage);

        if (itemId && percentage > (videoWatchProgress[itemId] || 0)) {
            videoWatchProgress[itemId] = percentage;
            saveVideoProgress();
        }

        if ((percentage >= COMPLETION_THRESHOLD || forceComplete) && !completedFlag) {
            completedFlag = true;
            if (itemId && markCompletedAuto(itemId)) {
                updateHintUI();
                showNotification('🎉 লেকচার সম্পন্ন হিসেবে চিহ্নিত হয়েছে', 'success');
            }
        }
    }

    function updateProgressUI(percentage) {
        const bar = document.getElementById('yt-progress-bar');
        const text = document.getElementById('yt-progress-text');
        if (bar && text) {
            bar.style.width = (percentage * 100) + '%';
            text.textContent = Math.round(percentage * 100) + '%';
            if (percentage >= COMPLETION_THRESHOLD) text.classList.add('threshold-reached');
        }
    }

    function updateHintUI() {
        const hint = document.getElementById('yt-hint');
        if (hint) {
            hint.classList.add('unlocked');
            hint.innerHTML = '<i class="fas fa-check-circle"></i><span><strong>সম্পন্ন ✓</strong> — চমৎকার!</span>';
        }
    }

    function closeOverlay() {
        try {
            if (player && player.getCurrentTime && player.getDuration) {
                const duration = player.getDuration();
                const current = player.getCurrentTime();
                if (duration > 0 && itemId) {
                    const percentage = Math.min(current / duration, 1);
                    if (percentage > (videoWatchProgress[itemId] || 0)) {
                        videoWatchProgress[itemId] = percentage;
                        saveVideoProgress();
                    }
                }
            }
        } catch (e) { /* ignore */ }

        stopProgressTracking();
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('fullscreenchange', updateFullscreenButton);
        if (document.fullscreenElement === overlay && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        if (screen.orientation && screen.orientation.unlock) {
            try { screen.orientation.unlock(); } catch (_) {}
        }

        if (player && player.destroy) {
            try { player.destroy(); } catch (e) { /* ignore */ }
        }

        const el = document.getElementById('yt-overlay-player');
        if (el) {
            el.style.animation = 'ytFadeIn 0.15s ease reverse';
            setTimeout(() => {
                el.remove();
                document.body.classList.remove('yt-overlay-open');
            }, 140);
        }
    }

    function onKeydown(e) { if (e.key === 'Escape') closeOverlay(); }

    closeBtn.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onKeydown);
    setTimeout(() => closeBtn.focus(), 100);
};

// ============================================================
// Hidden Admin Access — Course Title e 5 bar click
// ⚠️ Eta shudhu lukano, security na. new.html e nijer login/auth lagbe.
// ============================================================
function setupHiddenAdminAccess() {
    let clickCount = 0;
    let resetTimer = null;

    function attachClickCounter() {
        const titleEl = document.getElementById('course-title');
        if (!titleEl) { setTimeout(attachClickCounter, 500); return; }

        if (titleEl.dataset.hiddenAdminBound === '1') return;
        titleEl.dataset.hiddenAdminBound = '1';

        titleEl.style.cursor = 'pointer';
        titleEl.style.userSelect = 'none';

        titleEl.addEventListener('click', function () {
            clickCount++;

            if (clickCount >= 3 && clickCount < ADMIN_CLICKS_REQUIRED) {
                titleEl.style.transition = 'transform 0.08s ease';
                titleEl.style.transform = 'scale(0.97)';
                setTimeout(() => { titleEl.style.transform = 'scale(1)'; }, 80);
            }

            if (resetTimer) clearTimeout(resetTimer);
            resetTimer = setTimeout(() => { clickCount = 0; }, ADMIN_CLICK_WINDOW);

            if (clickCount >= ADMIN_CLICKS_REQUIRED) {
                clickCount = 0;
                if (resetTimer) clearTimeout(resetTimer);
                openHiddenAdminPanel();
            }
        });
    }

    function openHiddenAdminPanel() {
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

        const adminWindow = window.open(ADMIN_PAGE, 'adminPanel', 'width=1200,height=800,scrollbars=yes,resizable=yes');

        if (!adminWindow || adminWindow.closed || typeof adminWindow.closed === 'undefined') {
            showNotification('Admin panel খুলছে...', 'info');
            setTimeout(() => { window.location.href = ADMIN_PAGE; }, 500);
        } else {
            adminWindow.focus();
        }
    }

    attachClickCounter();
}

// ============================================================
// Load sections
// ============================================================
async function loadSections() {
    loadCompletedItems();
    loadVideoProgress();
    loadVideoDurationCache();

    try {
        const classes = await fetchClassesWithFallback();
        _currentDbRows = classes;

        document.getElementById('course-title').textContent = 'Civil 4th Semester';

        const sections = transformClassesToSections(classes);
        window._currentSections = sections;

        displaySections(sections);
        // Fetch missing YouTube durations only after the initial page has settled.
        const updateDurationsWhenIdle = () => updateAllVideoDurations();
        if ('requestIdleCallback' in window) {
            requestIdleCallback(updateDurationsWhenIdle, { timeout: 8000 });
        } else {
            setTimeout(updateDurationsWhenIdle, 6000);
        }
    } catch (error) {
        console.error('সব API ব্যর্থ:', error);
        document.getElementById('sections-container').innerHTML = `
            <div class="empty-message" style="padding: 4rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 0.5rem;">সব API থেকে ডেটা লোড করা যায়নি।</p>
                <button onclick="location.reload()" style="padding: 0.75rem 2rem; background: #2563eb; color: white; border: none; border-radius: 1rem; cursor: pointer; font-size: 1rem; font-weight: 500;">
                    <i class="fas fa-redo-alt" style="margin-right: 0.5rem;"></i>আবার চেষ্টা করুন
                </button>
            </div>
        `;
    }
}

// ============================================================
// Display sections
// ============================================================
function displaySections(sections) {
    const container = document.getElementById('sections-container');

    if (!sections || sections.length === 0) {
        container.innerHTML = '<div class="empty-message">কোনো সেকশন পাওয়া যায়নি।</div>';
        return;
    }

    const sectionsHTML = sections.map((section, index) => {
        const sectionTitle = decodeUnicode(section.title) || `অধ্যায় ${index + 1}`;
        const contents = section.contents || [];
        const contentCount = contents.length;

        const contentsHTML = contents.map((content, contentIndex) => {
            const contentTitle = decodeUnicode(content.title) || 'লেকচার';

            let contentLink = '#';
            if (content.resource && content.resource.resourceable) {
                contentLink = content.resource.resourceable.link || '#';
            } else if (content.link) {
                contentLink = content.link;
            }

            // row id based stable ID
            const itemId = content.rowId
                ? `item_${content.rowId}`
                : `section_${section.id || index}_content_${content.id || contentIndex}`;

            const { iconClass, isPDF, isYouTube } = getIconForContent(content, contentLink, contentTitle);
            const isCompleted = completedItems[itemId] || false;

            let durationHTML = '';
            if (isYouTube) {
                const label = dbValueToLabel(content.duration);
                durationHTML = label
                    ? `<span class="video-duration">${escapeHtml(label)}</span>`
                    : '<span class="video-duration"><i class="fas fa-spinner fa-spin"></i></span>';
            }

            return `
                <div class="content-item ${isCompleted ? 'completed' : ''}"
                     data-item-id="${escapeAttr(itemId)}"
                     data-link="${escapeAttr(contentLink)}"
                     data-title="${escapeAttr(contentTitle)}"
                     data-type="${isPDF ? 'pdf' : isYouTube ? 'video' : 'link'}">
                    <input type="checkbox" class="complete-checkbox"
                        ${isCompleted ? 'checked' : ''}
                        title="সম্পন্ন হিসাবে চিহ্নিত করুন">
                    <i class="${iconClass}"></i>
                    <span class="content-title">${escapeHtml(contentTitle)}</span>
                    ${durationHTML}
                    ${!isPDF && !isYouTube ? '<i class="fas fa-external-link-alt link-icon" title="খুলুন"></i>' : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="section-card">
                <div class="section-header">
                    <div class="left-content">
                        <i class="fas fa-chevron-right section-icon"></i>
                        <h3>${escapeHtml(sectionTitle)}</h3>
                    </div>
                    <div class="right-content">
                        <div class="section-progress-container">
                            <div class="section-progress-bar" style="width: 0%"></div>
                        </div>
                        <span class="progress-text">0/${contentCount}</span>
                    </div>
                </div>
                <div class="contents-list ${index === 0 ? '' : 'hidden'}">
                    ${contentsHTML || '<div class="empty-message">এখনও ক্লাস হয়নি 😔</div>'}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = sectionsHTML;
    attachEventHandlers();

    const firstIcon = document.querySelector('.section-header .section-icon');
    if (firstIcon) firstIcon.classList.add('rotated');

    updateAllProgress();
}

// ============================================================
// Event delegation
// ============================================================
function attachEventHandlers() {
    const container = document.getElementById('sections-container');
    if (!container || container.dataset.handlersAttached === '1') return;
    container.dataset.handlersAttached = '1';

    container.addEventListener('click', (e) => {
        const header = e.target.closest('.section-header');
        if (header) { window.toggleSection(header); return; }

        const contentItem = e.target.closest('.content-item');
        if (!contentItem) return;

        if (e.target.classList.contains('complete-checkbox')) {
            window.toggleComplete(contentItem.dataset.itemId, e.target, e);
            return;
        }

        const isTitle = e.target.classList.contains('content-title');
        const isLinkIcon = e.target.classList.contains('link-icon');
        if (!isTitle && !isLinkIcon) return;

        const { link, title, type, itemId } = contentItem.dataset;

        if (!isUsableLink(link)) {
            showNotification('এই আইটেমের লিংক এখনও যোগ করা হয়নি', 'info');
            return;
        }

        if (type === 'pdf') window.openPDFViewer(link, title);
        else if (type === 'video') window.openYouTubePlayer(link, title, itemId);
        else window.open(link, '_blank', 'noopener');
    });
}

// ============================================================
// Toggle Section
// ============================================================
window.toggleSection = function (header) {
    const contentsList = header.nextElementSibling;
    const icon = header.querySelector('.section-icon');
    if (!contentsList) return;

    contentsList.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotated');

    document.querySelectorAll('.section-card').forEach(section => {
        const otherContents = section.querySelector('.contents-list');
        const otherIcon = section.querySelector('.section-icon');
        if (otherContents && otherContents !== contentsList && !otherContents.classList.contains('hidden')) {
            otherContents.classList.add('hidden');
            if (otherIcon) otherIcon.classList.remove('rotated');
        }
    });
};

// ============================================================
// Unicode Decode
// ============================================================
function decodeUnicode(str) {
    if (str == null) return '';
    const s = String(str);
    // Only attempt JSON decode when actual \uXXXX escapes are present
    if (!/\\u[0-9a-fA-F]{4}/.test(s)) return s;
    try {
        return JSON.parse('"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
    } catch (e) {
        return s;
    }
}

// ============================================================
// Reset All Progress
// ============================================================
window.resetAllProgress = function () {
    if (!confirm('সব সম্পন্ন চিহ্নিত করা মুছে ফেলতে চান?')) return;

    completedItems = {};
    videoWatchProgress = {};
    saveCompletedItems();
    saveVideoProgress();

    document.querySelectorAll('.complete-checkbox').forEach(checkbox => {
        checkbox.checked = false;
        const contentItem = checkbox.closest('.content-item');
        if (contentItem) contentItem.classList.remove('completed');
    });

    updateAllProgress();
    showNotification('সব প্রোগ্রেস রিসেট করা হয়েছে', 'info');
};

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        @keyframes completeBurst { 0% { transform: scale(1) translateY(0); opacity: 1; } 100% { transform: scale(2.5) translateY(-50px); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    // Load the YouTube IFrame API only when a user opens a video.
    loadSections();
    setupHiddenAdminAccess();

    const resetBtn = document.getElementById('reset-progress');
    if (resetBtn) resetBtn.addEventListener('click', window.resetAllProgress);

    if (window.location.search.includes('reset=true')) {
        setTimeout(() => window.resetAllProgress(), 1000);
    }

    if (!navigator.onLine) showNotification('আপনি অফলাইনে আছেন।', 'info');
    window.addEventListener('online', () => showNotification('আপনি অনলাইনে ফিরে এসেছেন!', 'success'));
    window.addEventListener('offline', () => showNotification('আপনি অফলাইনে চলে গেছেন।', 'info'));

    const reloadBtn = document.getElementById('floating-reload-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const icon = this.querySelector('i');
            if (icon) icon.style.animation = 'spin 0.5s ease-in-out';
            setTimeout(() => window.location.reload(), 300);
        });
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        document.body.classList.add('theme-transition');

        themeToggle.addEventListener('click', function () {
            const dark = document.body.classList.toggle('dark-mode');
            icon.classList.toggle('fa-moon', dark);
            icon.classList.toggle('fa-sun', !dark);
            localStorage.setItem('theme', dark ? 'dark' : 'light');
            showThemeNotification(dark ? 'নাইট মোড চালু হয়েছে' : 'ডে মোড চালু হয়েছে');
        });
    }

    function showThemeNotification(message) {
        const n = document.createElement('div');
        n.className = 'auto-save-status show';
        n.style.cssText = `
            position: fixed; top: 80px; right: 20px; background: var(--primary); color: white;
            padding: 10px 20px; border-radius: 50px; font-size: 14px; z-index: 2001;
        `;
        n.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 2000);
    }

    // PWA Install — attach click listener once
    const installButton = document.getElementById('install-button');
    if (installButton) {
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installButton.style.display = 'none';
        });
    }
});

// System theme change (user manually theme na bachle)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (localStorage.getItem('theme')) return;
    document.body.classList.toggle('dark-mode', e.matches);
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.classList.toggle('fa-moon', e.matches);
        icon.classList.toggle('fa-sun', !e.matches);
    }
});

// ============================================================
// PWA Install
// ============================================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installButton = document.getElementById('install-button');
    if (installButton) installButton.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
    showNotification('অ্যাপ সফলভাবে ইন্সটল হয়েছে! 🎉', 'success');
});