// ============================================================
// 🌐 API Endpoints (with fallback)
// ============================================================
const API_ENDPOINTS = [
    {
        name: 'API 1 (Primary)',
        url: 'https://api.sheety.co/821ecc958a063a3a52c103e87f8a214f/civil4ThDiplomaTutor/sheet1',
        timeout: 8000
    },
    {
        name: 'API 2 (Fallback)',
        url: 'https://sheet2api.com/v1/jJwY3qT5TFqV/civil-4th-diploma-tutor',
        timeout: 10000
    },
    {
        name: 'API 3 (Fallback)',
        url: 'https://sheetdb.io/api/v1/bw2ae39l9rmaj',
        timeout: 10000
    },
    {
        name: 'API 4 (Fallback)',
        url: 'https://script.google.com/macros/s/AKfycbwSamBeEh5VSs939teC74Riw6XW0ZHveyTtCNr8itBm7BtwnDeKjChxNG3gnplySwk/exec',
        timeout: 10000
    }
];

// ============================================================
// 🔑 API Config
// ============================================================
const YOUTUBE_API_KEY = 'AIzaSyD8JqRloRcTNoZuR0tBy14wF7Bs7BxT3t4';
const SHEETY_API = 'https://api.sheety.co/821ecc958a063a3a52c103e87f8a214f/civil4ThDiplomaTutor/sheet1';
const COMPLETION_THRESHOLD = 0.90;

// ✅ Hidden Admin Settings
const ADMIN_CLICKS_REQUIRED = 5;   // কতবার click লাগবে
const ADMIN_CLICK_WINDOW = 3000;   // কত ms এর মধ্যে (3 সেকেন্ড)
const ADMIN_PAGE = 'new.html';     // admin panel file name

// ============================================================
// 📊 State Variables
// ============================================================
let completedItems = {};
let videoWatchProgress = {};
let videoDurationCache = {};
let cacheSaveTimer = null;
let _currentDbRows = [];

// ============================================================
// 📺 YouTube IFrame API Loader
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

window.onYouTubeIframeAPIReady = function() {
    ytApiReady = true;
    ytApiReadyCallbacks.forEach(cb => cb());
    ytApiReadyCallbacks = [];
};

// ============================================================
// 💾 localStorage লোড/সেভ
// ============================================================
function loadCompletedItems() {
    try {
        const saved = localStorage.getItem('completedCourseItems');
        if (saved) completedItems = JSON.parse(saved);
    } catch (error) { completedItems = {}; }
}

function saveCompletedItems() {
    try {
        localStorage.setItem('completedCourseItems', JSON.stringify(completedItems));
    } catch (error) { console.error('Error saving completed items:', error); }
}

function loadVideoProgress() {
    try {
        const saved = localStorage.getItem('videoWatchProgress');
        if (saved) videoWatchProgress = JSON.parse(saved);
    } catch (error) { videoWatchProgress = {}; }
}

function saveVideoProgress() {
    try {
        localStorage.setItem('videoWatchProgress', JSON.stringify(videoWatchProgress));
    } catch (error) { console.error('Error saving video progress:', error); }
}

function loadVideoDurationCache() {
    try {
        const saved = localStorage.getItem('videoDurationCache');
        if (saved) videoDurationCache = JSON.parse(saved);
    } catch (error) { videoDurationCache = {}; }
}

function saveVideoDurationCache() {
    if (cacheSaveTimer) clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('videoDurationCache', JSON.stringify(videoDurationCache));
        } catch (error) { console.error('Error saving video duration cache:', error); }
    }, 1000);
}

// ============================================================
// 🌐 Fetch with timeout
// ============================================================
function fetchWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

// ============================================================
// 🔍 Normalize API response
// ============================================================
function normalizeApiResponse(data, apiName) {
    if (!data) return null;
    if (data.success && Array.isArray(data.classes)) return data.classes;
    if (Array.isArray(data.classes)) return data.classes;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    
    if (typeof data === 'object') {
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                console.log(`ℹ️ ${apiName}: found array at key "${key}"`);
                return data[key];
            }
        }
    }
    return null;
}

// ============================================================
// 🚀 Fetch classes with fallback
// ============================================================
async function fetchClassesWithFallback() {
    let lastError = null;
    
    for (let i = 0; i < API_ENDPOINTS.length; i++) {
        const api = API_ENDPOINTS[i];
        const startTime = Date.now();
        
        try {
            console.log(`📡 [${i + 1}/${API_ENDPOINTS.length}] ${api.name} কল করা হচ্ছে...`);
            
            const response = await fetchWithTimeout(api.url, api.timeout);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const classes = normalizeApiResponse(data, api.name);
            
            if (!classes || classes.length === 0) {
                throw new Error('কোনো ক্লাস ডাটা পাওয়া যায়নি');
            }
            
            const elapsed = Date.now() - startTime;
            console.log(`✅ ${api.name} সফল (${elapsed}ms), ${classes.length}টি ক্লাস`);
            
            if (i > 0) {
                showNotification(`⚠️ Primary API কাজ করেনি, ${api.name} ব্যবহার করা হয়েছে`, 'info');
            }
            
            return classes;
            
        } catch (error) {
            const elapsed = Date.now() - startTime;
            
            if (error.name === 'AbortError') {
                console.warn(`⏱️ ${api.name} টাইমআউট (${elapsed}ms)`);
                lastError = new Error(`${api.name} সময়সীমা ছাড়িয়ে গেছে`);
            } else {
                console.warn(`❌ ${api.name} ব্যর্থ (${elapsed}ms):`, error.message);
                lastError = error;
            }
        }
    }
    
    throw lastError || new Error('সব API ব্যর্থ হয়েছে');
}

// ============================================================
// 🔄 Transform classes → sections
// ============================================================
function transformClassesToSections(classes) {
    if (!Array.isArray(classes)) return [];
    
    const grouped = {};
    
    classes.forEach((item, index) => {
        const subject = item.subject || `Subject ${index + 1}`;
        if (!grouped[subject]) grouped[subject] = [];
        grouped[subject].push(item);
    });
    
    let sectionId = 1;
    const sections = [];
    
    Object.entries(grouped).forEach(([subject, items]) => {
        const contents = items.map((item, idx) => {
            const chapter = item.chapter || '';
            const lecture = item.lecture || (idx + 1);
            
            let title = '';
            if (chapter) title += `Chapter ${chapter}`;
            if (chapter && lecture) title += ` - `;
            title += `Lecture ${lecture}`;
            
            const contentId = `${subject}_${chapter}_${lecture}_${idx}`.replace(/\s+/g, '_');
            
            return {
                id: contentId,
                title: title,
                type: 'video',
                link: item.link || '#',
                rowId: item.id || null,
                duration: item.duration || '',
                resource: {
                    resourceable: {
                        link: item.link || '#'
                    }
                }
            };
        });
        
        sections.push({
            id: sectionId++,
            title: subject,
            contents: contents
        });
    });
    
    return sections;
}

// ============================================================
// 🎬 YouTube Video ID
// ============================================================
function extractYouTubeVideoId(url) {
    let videoId = '';
    if (!url) return '';
    
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/watch')) {
        try {
            const urlParams = new URLSearchParams(new URL(url).search);
            videoId = urlParams.get('v');
        } catch (e) { console.error('Invalid URL:', url); }
    } else if (url.includes('youtube.com/embed/')) {
        videoId = url.split('embed/')[1].split('?')[0];
    } else if (url.includes('youtube.com/shorts/')) {
        videoId = url.split('shorts/')[1].split('?')[0];
    }
    
    return videoId;
}

// ============================================================
// ⏱️ Format duration
// ============================================================
function formatDuration(duration) {
    if (!duration) return '--:--';
    
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '--:--';
    
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    
    let result = '';
    if (hours) {
        result += `${hours.padStart(2, '0')}:`;
        result += `${(minutes || '0').padStart(2, '0')}:`;
        result += `${(seconds || '0').padStart(2, '0')}`;
    } else if (minutes) {
        result += `${minutes.padStart(2, '0')}:`;
        result += `${(seconds || '0').padStart(2, '0')}`;
    } else {
        result = `00:${(seconds || '0').padStart(2, '0')}`;
    }
    return result;
}

// ============================================================
// 📡 YouTube Durations — DB First, API Fallback, Save to DB
// ============================================================
async function getVideoDurationsBatch(videoIds, dbRows) {
    const result = {};
    const uncachedIds = [];
    
    if (dbRows && Array.isArray(dbRows)) {
        videoIds.forEach(id => {
            const row = dbRows.find(r => extractYouTubeVideoId(r.link) === id);
            
            if (row && row.duration && String(row.duration).trim() !== '' && row.duration !== '--:--') {
                result[id] = String(row.duration).trim();
                videoDurationCache[id] = result[id];
                console.log(`📦 DB → ${id} : ${result[id]}`);
            } else {
                uncachedIds.push({ id, rowId: row ? row.id : null });
            }
        });
    } else {
        videoIds.forEach(id => uncachedIds.push({ id, rowId: null }));
    }
    
    if (uncachedIds.length === 0) {
        console.log('✅ সব duration DB থেকে পাওয়া গেছে');
        return result;
    }
    
    console.log(`📡 ${uncachedIds.length}টি duration API থেকে আনতে হবে`);
    
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        uncachedIds.forEach(({ id }) => result[id] = '--:--');
        return result;
    }
    
    const CHUNK_SIZE = 50;
    for (let i = 0; i < uncachedIds.length; i += CHUNK_SIZE) {
        const chunk = uncachedIds.slice(i, i + CHUNK_SIZE);
        const idsOnly = chunk.map(c => c.id);
        
        try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${idsOnly.join(',')}&key=${YOUTUBE_API_KEY}`;
            console.log(`📡 YouTube API batch: ${idsOnly.length}টি`);
            
            const response = await fetch(apiUrl);
            const data = await response.json();
            
            if (!response.ok || data.error) {
                console.error('❌ YouTube API Error:', data.error);
                chunk.forEach(({ id }) => result[id] = '--:--');
                continue;
            }
            
            const foundIds = new Set();
            const toSaveToDb = [];
            
            if (data.items) {
                data.items.forEach(item => {
                    const duration = formatDuration(item.contentDetails.duration);
                    result[item.id] = duration;
                    videoDurationCache[item.id] = duration;
                    foundIds.add(item.id);
                    
                    const match = chunk.find(c => c.id === item.id);
                    if (match && match.rowId && duration !== '--:--') {
                        toSaveToDb.push({ rowId: match.rowId, duration });
                    }
                });
            }
            
            chunk.forEach(({ id }) => {
                if (!foundIds.has(id)) result[id] = '--:--';
            });
            
            if (toSaveToDb.length > 0) {
                await saveDurationsToDB(toSaveToDb);
            }
            
        } catch (error) {
            console.error('❌ Batch fetch error:', error);
            chunk.forEach(({ id }) => result[id] = '--:--');
        }
    }
    
    saveVideoDurationCache();
    return result;
}

// ============================================================
// 💾 Save new durations to DB (Sheety — No Token)
// ============================================================
async function saveDurationsToDB(items) {
    if (!items || items.length === 0) return;
    
    console.log(`💾 ${items.length}টি duration DB-তে save করছি...`);
    
    for (const { rowId, duration } of items) {
        if (!rowId || !duration || duration === '--:--') continue;
        
        try {
            const url = `${SHEETY_API}/${rowId}`;
            const payload = {
                sheet1: {
                    duration: duration
                }
            };
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                console.log(`✅ DB Save: row ${rowId} → ${duration}`);
            } else {
                const errText = await response.text();
                console.warn(`❌ DB Save failed row ${rowId}:`, errText);
            }
            
            await new Promise(r => setTimeout(r, 400));
            
        } catch (error) {
            console.error(`❌ DB Save error row ${rowId}:`, error);
        }
    }
}

// ============================================================
// 🔄 Update all video durations
// ============================================================
async function updateAllVideoDurations() {
    const videoItems = document.querySelectorAll('.content-item .fa-youtube');
    const itemsWithId = [];
    const allIds = [];
    
    videoItems.forEach(videoIcon => {
        const contentItem = videoIcon.closest('.content-item');
        const linkIcon = contentItem.querySelector('.link-icon');
        const videoLink = contentItem.dataset.link || '';
        
        if (videoLink) {
            const videoId = extractYouTubeVideoId(videoLink);
            
            if (videoId) {
                let durationSpan = contentItem.querySelector('.video-duration');
                
                if (!durationSpan) {
                    durationSpan = document.createElement('span');
                    durationSpan.className = 'video-duration';
                    
                    if (linkIcon) contentItem.insertBefore(durationSpan, linkIcon);
                    else contentItem.appendChild(durationSpan);
                }
                
                if (!durationSpan.textContent.trim() || durationSpan.querySelector('.fa-spinner')) {
                    durationSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                }
                
                itemsWithId.push({ videoId, durationSpan });
                allIds.push(videoId);
            }
        }
    });
    
    if (allIds.length === 0) return;
    
    const durations = await getVideoDurationsBatch(allIds, _currentDbRows);
    
    itemsWithId.forEach(({ videoId, durationSpan }) => {
        const dur = durations[videoId];
        if (dur && dur !== '--:--') {
            durationSpan.textContent = dur;
        } else {
            durationSpan.textContent = '--:--';
        }
    });
}

// ============================================================
// 📢 Notification
// ============================================================
function showNotification(message, type = 'success') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notif => notif.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'info' ? 'fa-info-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'info' ? '#3b82f6' : '#ef4444'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        animation: slideInRight 0.3s ease;
        font-weight: 500;
        max-width: 350px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ============================================================
// ✅ Complete toggle (manual)
// ============================================================
window.toggleComplete = function(itemId, checkbox, event) {
    if (event) event.stopPropagation();
    
    if (checkbox.checked) {
        completedItems[itemId] = true;
    } else {
        delete completedItems[itemId];
    }
    saveCompletedItems();
    
    const contentItem = checkbox.closest('.content-item');
    if (contentItem) {
        if (checkbox.checked) contentItem.classList.add('completed');
        else contentItem.classList.remove('completed');
    }
    
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
        position: fixed; z-index: 99998; font-size: 2rem;
        color: #10b981; font-weight: bold; pointer-events: none;
        animation: completeBurst 1s ease forwards;
    `;
    
    const rect = element.getBoundingClientRect();
    burst.style.left = (rect.left + 20) + 'px';
    burst.style.top = (rect.top + rect.height / 2) + 'px';
    
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1000);
}

// ============================================================
// 📊 Progress
// ============================================================
function updateSectionProgress(sectionCard) {
    if (!sectionCard) return;
    
    const contentItems = sectionCard.querySelectorAll('.content-item');
    const totalItems = contentItems.length;
    const completedCount = Array.from(contentItems).filter(item => 
        item.querySelector('.complete-checkbox:checked')
    ).length;
    
    const progressBar = sectionCard.querySelector('.section-progress-bar');
    const progressText = sectionCard.querySelector('.progress-text');
    
    if (progressBar && progressText) {
        const percentage = totalItems > 0 ? (completedCount / totalItems) * 100 : 0;
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${completedCount}/${totalItems}`;
    }
}

function updateOverallProgress() {
    const allItems = document.querySelectorAll('.content-item');
    const totalItems = allItems.length;
    const completedCount = Array.from(allItems).filter(item => 
        item.querySelector('.complete-checkbox:checked')
    ).length;
    
    const progressFill = document.getElementById('global-progress-fill');
    const progressText = document.getElementById('global-progress-text');
    
    if (progressFill && progressText) {
        const percentage = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }
}

function updateAllProgress() {
    document.querySelectorAll('.section-card').forEach(section => {
        updateSectionProgress(section);
    });
    updateOverallProgress();
}

// ============================================================
// 🎨 Icon detection
// ============================================================
function getIconForContent(content, link, title) {
    const titleLower = title.toLowerCase();
    const linkLower = (link || '').toLowerCase();
    
    if (content.type === 'pdf' || linkLower.includes('.pdf') || titleLower.includes('pdf') || titleLower.includes('পিডিএফ')) {
        return { iconClass: 'fas fa-file-pdf', isPDF: true, isYouTube: false };
    }
    
    if (content.type === 'video' ||
        linkLower.includes('youtube.com') || 
        linkLower.includes('youtu.be') || 
        titleLower.includes('ভিডিও') || 
        titleLower.includes('video') ||
        titleLower.includes('ইউটিউব') ||
        titleLower.includes('youtube')) {
        return { iconClass: 'fab fa-youtube', isPDF: false, isYouTube: true };
    }
    
    if (linkLower.includes('whatsapp') || titleLower.includes('whatsapp') ||
        titleLower.includes('wa') || titleLower.includes('হোয়াটসঅ্যাপ')) {
        return { iconClass: 'fab fa-whatsapp', isPDF: false, isYouTube: false };
    }
    
    return { iconClass: 'fas fa-file-alt', isPDF: false, isYouTube: false };
}

// ============================================================
// 🧰 Escape helpers
// ============================================================
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ============================================================
// 📄 PDF Viewer (same-page overlay)
// ============================================================
window.openPDFViewer = function(pdfUrl, title) {
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
            #pdf-overlay-viewer {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: #f1f5f9; z-index: 999999;
                display: flex; flex-direction: column; animation: pdfFadeIn 0.25s ease;
            }
            #pdf-overlay-viewer .pdf-toolbar {
                background: #fff; padding: 0.75rem 1.25rem;
                display: flex; justify-content: space-between; align-items: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08); border-bottom: 1px solid #e2e8f0;
                flex-shrink: 0; gap: 0.75rem;
            }
            #pdf-overlay-viewer .pdf-title-wrap {
                display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0;
            }
            #pdf-overlay-viewer .pdf-title-wrap i { color: #2563eb; font-size: 1.4rem; flex-shrink: 0; }
            #pdf-overlay-viewer .pdf-title {
                color: #1e293b; font-size: 1rem; font-weight: 600;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0;
            }
            #pdf-overlay-viewer .pdf-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
            #pdf-overlay-viewer .pdf-btn {
                background: #2563eb; color: #fff; border: none; border-radius: 0.5rem;
                padding: 0.55rem 1rem; font-size: 0.9rem; font-weight: 500; cursor: pointer;
                display: flex; align-items: center; gap: 0.4rem; text-decoration: none;
            }
            #pdf-overlay-viewer .pdf-btn:hover { background: #1d4ed8; }
            #pdf-overlay-viewer .pdf-btn-close {
                background: #fff; color: #64748b; border: 1px solid #e2e8f0;
                width: 40px; height: 40px; padding: 0; justify-content: center;
                border-radius: 50%; font-size: 1rem;
            }
            #pdf-overlay-viewer .pdf-frame { flex: 1; width: 100%; border: none; background: #e2e8f0; }
            @media (max-width: 480px) {
                #pdf-overlay-viewer .pdf-title { font-size: 0.85rem; }
                #pdf-overlay-viewer .pdf-btn span { display: none; }
                #pdf-overlay-viewer .pdf-btn { padding: 0.5rem 0.7rem; }
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
                    <i class="fas fa-download"></i>
                    <span>ডাউনলোড</span>
                </a>
                <button class="pdf-btn pdf-btn-close" id="pdf-overlay-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <iframe class="pdf-frame" src="https://docs.google.com/viewer?url=${encodedUrl}&embedded=true"></iframe>
    `;
    
    document.body.appendChild(overlay);
    document.body.classList.add('pdf-overlay-open');
    
    function closeOverlay() {
        const el = document.getElementById('pdf-overlay-viewer');
        if (el) {
            el.style.animation = 'pdfFadeIn 0.15s ease reverse';
            setTimeout(() => {
                el.remove();
                document.body.classList.remove('pdf-overlay-open');
                document.removeEventListener('keydown', onKeydown);
            }, 140);
        }
    }
    
    function onKeydown(e) {
        if (e.key === 'Escape') closeOverlay();
    }
    
    document.getElementById('pdf-overlay-close').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onKeydown);
};

// ============================================================
// ▶️ YouTube Player — Same-Page Overlay (Mobile + Desktop)
// ============================================================
window.openYouTubePlayer = async function(videoUrl, title, itemId) {
    const videoId = extractYouTubeVideoId(videoUrl);
    const safeTitle = escapeHtml(title);
    
    if (!videoId) {
        window.open(videoUrl, '_blank');
        return;
    }
    
    const existing = document.getElementById('yt-overlay-player');
    if (existing) existing.remove();
    
    if (!document.getElementById('yt-overlay-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'yt-overlay-style';
        styleEl.textContent = `
            @keyframes ytFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes completeBurst {
                0% { transform: scale(1) translateY(0); opacity: 1; }
                100% { transform: scale(2.5) translateY(-50px); opacity: 0; }
            }
            body.yt-overlay-open { overflow: hidden !important; }
            
            #yt-overlay-player {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: #000; z-index: 999999;
                display: flex; flex-direction: column;
                animation: ytFadeIn 0.25s ease;
            }
            #yt-overlay-player .yt-toolbar {
                background: #1a1a1a; padding: 0.6rem 1rem;
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid #2a2a2a; flex-shrink: 0; gap: 0.75rem;
            }
            #yt-overlay-player .yt-title-wrap {
                display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0;
            }
            #yt-overlay-player .yt-title-wrap i.fa-youtube {
                color: #ff0000; font-size: 1.4rem; flex-shrink: 0;
            }
            #yt-overlay-player .yt-title {
                color: #fff; font-size: 0.95rem; font-weight: 500;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                margin: 0; line-height: 1.3;
            }
            #yt-overlay-player .yt-actions {
                display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;
            }
            #yt-overlay-player .yt-btn {
                background: rgba(51,51,51,0.85); border: 1px solid #444;
                border-radius: 50%; width: 40px; height: 40px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; color: #fff; font-size: 1rem;
                transition: all 0.2s ease; text-decoration: none;
            }
            #yt-overlay-player .yt-btn:hover { background: #333; }
            #yt-overlay-player .yt-btn.yt-yt-btn {
                background: rgba(255,0,0,0.9); border-color: #cc0000;
            }
            #yt-overlay-player .yt-btn.yt-yt-btn:hover { background: #cc0000; }
            
            #yt-overlay-player .yt-video-wrap {
                flex: 1; position: relative; background: #000;
                min-height: 0; overflow: hidden;
            }
            #yt-overlay-player #yt-player-container {
                position: absolute; top: 0; left: 0;
                width: 100%; height: 100%;
            }
            
            #yt-overlay-player .yt-progress-info {
                background: #111; padding: 0.5rem 1rem;
                display: flex; align-items: center; gap: 0.75rem;
                flex-shrink: 0; border-top: 1px solid #222;
            }
            #yt-overlay-player .yt-progress-bar-wrap {
                flex: 1; height: 6px; background: #333; border-radius: 3px; overflow: hidden;
            }
            #yt-overlay-player .yt-progress-bar {
                height: 100%; width: 0%; background: linear-gradient(90deg, #ef4444, #10b981);
                transition: width 0.3s ease; border-radius: 3px;
            }
            #yt-overlay-player .yt-progress-text {
                color: #aaa; font-size: 0.8rem; font-weight: 500;
                min-width: 45px; text-align: right; font-variant-numeric: tabular-nums;
            }
            #yt-overlay-player .yt-progress-text.threshold-reached { color: #10b981; }
            
            #yt-overlay-player .yt-hint {
                background: #111; color: #888; padding: 0.4rem 1rem;
                font-size: 0.75rem; text-align: center; border-top: 1px solid #222;
                flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 0.4rem;
            }
            #yt-overlay-player .yt-hint.unlocked {
                background: linear-gradient(90deg, #065f46, #10b981);
                color: #fff;
            }
            #yt-overlay-player:fullscreen,
            #yt-overlay-player:-webkit-full-screen {
                width: 100vw !important; height: 100vh !important;
            }
            
            @media (max-width: 480px) {
                #yt-overlay-player .yt-title { font-size: 0.85rem; }
                #yt-overlay-player .yt-btn { width: 36px; height: 36px; font-size: 0.9rem; }
                #yt-overlay-player .yt-hint { font-size: 0.7rem; padding: 0.3rem 0.5rem; }
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
                <a class="yt-btn yt-yt-btn" href="${escapeAttr(videoUrl)}" target="_blank" rel="noopener" title="YouTube-এ খুলুন">
                    <i class="fab fa-youtube"></i>
                </a>
                <button class="yt-btn" id="yt-overlay-close" title="বন্ধ করুন (ESC)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <div class="yt-video-wrap">
            <div id="yt-player-container"></div>
        </div>
        <div class="yt-progress-info">
            <i class="fas fa-play-circle" style="color:#ef4444;"></i>
            <div class="yt-progress-bar-wrap">
                <div class="yt-progress-bar" id="yt-progress-bar"></div>
            </div>
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
    
    await loadYouTubeIframeAPI();
    
    let player = null;
    let progressCheckInterval = null;
    let completedFlag = false;
    
    const savedProgress = videoWatchProgress[itemId] || 0;
    const startSeconds = (savedProgress > 0.02 && savedProgress < COMPLETION_THRESHOLD) 
        ? Math.floor(savedProgress * 60 * 60) 
        : 0;
    
    player = new YT.Player('yt-player-container', {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: {
            'autoplay': 0,
            'rel': 0,
            'modestbranding': 1,
            'playsinline': 1,
            'fs': 1,
            'start': startSeconds
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
    
    function onPlayerReady(event) {
        event.target.playVideo();
        startProgressTracking();
    }
    
    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            startProgressTracking();
        } else if (event.data === YT.PlayerState.PAUSED) {
            stopProgressTracking();
        } else if (event.data === YT.PlayerState.ENDED) {
            checkAndMarkCompletion(true);
            stopProgressTracking();
        }
    }
    
    function onPlayerError(event) {
        console.error('Player error:', event.data);
        showNotification('ভিডিও লোড করা যায়নি', 'error');
    }
    
    function startProgressTracking() {
        if (progressCheckInterval) return;
        progressCheckInterval = setInterval(() => {
            checkAndMarkCompletion(false);
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
        
        if (!duration || duration === 0) return;
        
        const percentage = Math.min(current / duration, 1);
        updateProgressUI(percentage);
        
        if (itemId && percentage > (videoWatchProgress[itemId] || 0)) {
            videoWatchProgress[itemId] = percentage;
            saveVideoProgress();
        }
        
        if ((percentage >= COMPLETION_THRESHOLD || forceComplete) && !completedFlag) {
            completedFlag = true;
            
            if (itemId) {
                const wasNewlyCompleted = markCompletedAuto(itemId);
                if (wasNewlyCompleted) {
                    updateHintUI(true);
                    showNotification('🎉 লেকচার সম্পন্ন হিসেবে চিহ্নিত হয়েছে', 'success');
                }
            }
        }
    }
    
    function updateProgressUI(percentage) {
        const bar = document.getElementById('yt-progress-bar');
        const text = document.getElementById('yt-progress-text');
        
        if (bar && text) {
            bar.style.width = (percentage * 100) + '%';
            text.textContent = Math.round(percentage * 100) + '%';
            
            if (percentage >= COMPLETION_THRESHOLD) {
                text.classList.add('threshold-reached');
            }
        }
    }
    
    function updateHintUI(completed) {
        const hint = document.getElementById('yt-hint');
        if (hint && completed) {
            hint.classList.add('unlocked');
            hint.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span><strong>সম্পন্ন ✓</strong> — চমৎকার!</span>
            `;
        }
    }
    
    function closeOverlay() {
        if (player && player.getCurrentTime && player.getDuration) {
            try {
                const duration = player.getDuration();
                const current = player.getCurrentTime();
                if (duration > 0 && itemId) {
                    const percentage = Math.min(current / duration, 1);
                    if (percentage > (videoWatchProgress[itemId] || 0)) {
                        videoWatchProgress[itemId] = percentage;
                        saveVideoProgress();
                    }
                }
            } catch (e) {}
        }
        
        stopProgressTracking();
        
        if (player && player.destroy) {
            try { player.destroy(); } catch (e) {}
        }
        
        const el = document.getElementById('yt-overlay-player');
        if (el) {
            el.style.animation = 'ytFadeIn 0.15s ease reverse';
            setTimeout(() => {
                el.remove();
                document.body.classList.remove('yt-overlay-open');
                document.removeEventListener('keydown', onKeydown);
            }, 140);
        }
    }
    
    function onKeydown(e) {
        if (e.key === 'Escape') closeOverlay();
    }
    
    closeBtn.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onKeydown);
    
    setTimeout(() => closeBtn.focus(), 100);
};

// ============================================================
// 🔒 Hidden Admin Access — Course Title-এ 5 বার Click
// ============================================================
function setupHiddenAdminAccess() {
    let clickCount = 0;
    let resetTimer = null;
    
    console.log('🔒 Hidden admin access initialized');
    
    function attachClickCounter() {
        const titleEl = document.getElementById('course-title');
        
        if (!titleEl) {
            // DOM-এ এখনো নেই, retry
            setTimeout(attachClickCounter, 500);
            return;
        }
        
        // আগের listener সরাই (duplicate এড়াতে)
        if (titleEl.dataset.hiddenAdminBound === '1') {
            console.log('✅ Hidden admin already bound');
            return;
        }
        titleEl.dataset.hiddenAdminBound = '1';
        
        // Course title-এ pointer cursor (subtle)
        titleEl.style.cursor = 'pointer';
        titleEl.style.userSelect = 'none';
        
        titleEl.addEventListener('click', function(e) {
            clickCount++;
            
            // Visual feedback — শুধু ৩য় থেকে ৪র্থ click-এ subtle scale
            if (clickCount >= 3 && clickCount < ADMIN_CLICKS_REQUIRED) {
                titleEl.style.transition = 'transform 0.08s ease';
                titleEl.style.transform = 'scale(0.97)';
                setTimeout(() => {
                    titleEl.style.transform = 'scale(1)';
                }, 80);
            }
            
            // Timer reset
            if (resetTimer) clearTimeout(resetTimer);
            resetTimer = setTimeout(() => {
                clickCount = 0;
            }, ADMIN_CLICK_WINDOW);
            
            // ৫ম click-এ admin panel খুলি
            if (clickCount >= ADMIN_CLICKS_REQUIRED) {
                clickCount = 0;
                if (resetTimer) clearTimeout(resetTimer);
                
                openHiddenAdminPanel();
            }
        });
    }
    
    function openHiddenAdminPanel() {
        console.log('🔓 Opening hidden admin panel...');
        
        // Haptic feedback (mobile only)
        if (navigator.vibrate) {
            navigator.vibrate([50, 30, 50]);
        }
        
        // নতুন window-এ admin panel খুলি
        const adminWindow = window.open(
            ADMIN_PAGE,
            'adminPanel',
            'width=1200,height=800,scrollbars=yes,resizable=yes'
        );
        
        if (!adminWindow || adminWindow.closed || typeof adminWindow.closed === 'undefined') {
            // Popup blocked → same tab-এ redirect
            console.warn('⚠️ Popup blocked — same tab-এ redirect করছি');
            showNotification('Admin panel খুলছে...', 'info');
            setTimeout(() => {
                window.location.href = ADMIN_PAGE;
            }, 500);
        } else {
            adminWindow.focus();
        }
    }
    
    // Start
    attachClickCounter();
}

// ============================================================
// 🚀 Load sections
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
        
        setTimeout(() => {
            updateAllVideoDurations();
        }, 500);
        
    } catch (error) {
        console.error('❌ সব API ব্যর্থ:', error);
        document.getElementById('sections-container').innerHTML = `
            <div class="empty-message" style="padding: 4rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 0.5rem;">
                    সব API থেকে ডেটা লোড করা যায়নি।
                </p>
                <button onclick="location.reload()" style="padding: 0.75rem 2rem; background: #2563eb; color: white; border: none; border-radius: 1rem; cursor: pointer; font-size: 1rem; font-weight: 500;">
                    <i class="fas fa-redo-alt" style="margin-right: 0.5rem;"></i>
                    আবার চেষ্টা করুন
                </button>
            </div>
        `;
    }
}

// ============================================================
// 🖼️ Display sections
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
            
            const itemId = `section_${section.id || index}_content_${content.id || contentIndex}_${contentTitle.replace(/\s+/g, '_')}`;
            const { iconClass, isPDF, isYouTube } = getIconForContent(content, contentLink, contentTitle);
            const isCompleted = completedItems[itemId] || false;
            
            let durationHTML = '';
            if (isYouTube) {
                if (content.duration && String(content.duration).trim() !== '' && content.duration !== '--:--') {
                    durationHTML = `<span class="video-duration">${escapeHtml(content.duration)}</span>`;
                } else {
                    durationHTML = '<span class="video-duration"><i class="fas fa-spinner fa-spin"></i></span>';
                }
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
    
    const firstSection = document.querySelector('.section-card .contents-list');
    if (firstSection) {
        firstSection.classList.remove('hidden');
        const firstIcon = document.querySelector('.section-header .section-icon');
        if (firstIcon) firstIcon.classList.add('rotated');
    }
    
    updateAllProgress();
}

// ============================================================
// 🎯 Event delegation
// ============================================================
function attachEventHandlers() {
    const container = document.getElementById('sections-container');
    if (!container) return;
    
    if (container.dataset.handlersAttached === '1') return;
    container.dataset.handlersAttached = '1';
    
    container.addEventListener('click', (e) => {
        const header = e.target.closest('.section-header');
        if (header) {
            window.toggleSection(header);
            return;
        }
        
        const contentItem = e.target.closest('.content-item');
        if (!contentItem) return;
        
        if (e.target.classList.contains('complete-checkbox')) {
            const itemId = contentItem.dataset.itemId;
            window.toggleComplete(itemId, e.target, e);
            return;
        }
        
        const isTitle = e.target.classList.contains('content-title');
        const isLinkIcon = e.target.classList.contains('link-icon');
        
        if (isTitle || isLinkIcon) {
            const link = contentItem.dataset.link;
            const title = contentItem.dataset.title;
            const type = contentItem.dataset.type;
            const itemId = contentItem.dataset.itemId;
            
            if (type === 'pdf') {
                window.openPDFViewer(link, title);
            } else if (type === 'video') {
                window.openYouTubePlayer(link, title, itemId);
            } else {
                window.open(link, '_blank');
            }
        }
    });
}

// ============================================================
// 🔽 Toggle Section
// ============================================================
window.toggleSection = function(header) {
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
// 🔤 Unicode Decode
// ============================================================
function decodeUnicode(str) {
    if (!str) return '';
    try {
        return JSON.parse(`"${String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`);
    } catch (e) {
        return str;
    }
}

// ============================================================
// 🔄 Reset All Progress
// ============================================================
window.resetAllProgress = function() {
    if (confirm('সব সম্পন্ন চিহ্নিত করা মুছে ফেলতে চান?')) {
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
    }
};

// ============================================================
// 🚀 Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Notification animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes completeBurst {
            0% { transform: scale(1) translateY(0); opacity: 1; }
            100% { transform: scale(2.5) translateY(-50px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    loadYouTubeIframeAPI();
    
    loadSections();
    
    // ✅ Setup hidden admin access (5-click on title)
    setupHiddenAdminAccess();
    
    const resetBtn = document.getElementById('reset-progress');
    if (resetBtn) resetBtn.addEventListener('click', window.resetAllProgress);
    
    if (window.location.search.includes('reset=true')) {
        setTimeout(() => window.resetAllProgress(), 1000);
    }
    
    if (!navigator.onLine) {
        showNotification('আপনি অফলাইনে আছেন।', 'info');
    }
    
    window.addEventListener('online', () => showNotification('আপনি অনলাইনে ফিরে এসেছেন!', 'success'));
    window.addEventListener('offline', () => showNotification('আপনি অফলাইনে চলে গেছেন।', 'info'));
    
    const reloadBtn = document.getElementById('floating-reload-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const icon = this.querySelector('i');
            if (icon) icon.style.animation = 'spin 0.5s ease-in-out';
            setTimeout(() => window.location.reload(), 300);
        });
    }
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
        
        document.body.classList.add('theme-transition');
        
        themeToggle.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
                localStorage.setItem('theme', 'dark');
                showThemeNotification('নাইট মোড চালু হয়েছে');
            } else {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
                localStorage.setItem('theme', 'light');
                showThemeNotification('ডে মোড চালু হয়েছে');
            }
        });
        
        function showThemeNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'auto-save-status show';
            notification.style.cssText = `
                position: fixed; top: 80px; right: 20px;
                background: var(--primary); color: white;
                padding: 10px 20px; border-radius: 50px;
                font-size: 14px; z-index: 2001;
            `;
            notification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }
    }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        const icon = document.querySelector('#theme-toggle i');
        if (e.matches) {
            document.body.classList.add('dark-mode');
            if (icon) icon.classList.replace('fa-sun', 'fa-moon');
        } else {
            document.body.classList.remove('dark-mode');
            if (icon) icon.classList.replace('fa-moon', 'fa-sun');
        }
    }
});

// ============================================================
// 📱 PWA Install
// ============================================================
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installButton = document.getElementById('install-button');
    if (installButton) {
        installButton.style.display = 'inline-flex';
        
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            installButton.style.display = 'none';
        });
    }
});

window.addEventListener('appinstalled', () => {
    showNotification('অ্যাপ সফলভাবে ইন্সটল হয়েছে! 🎉', 'success');
});
