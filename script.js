// ============================================================
// 🌐 API Endpoints (with fallback)
// ============================================================
const API_ENDPOINTS = [
    {
        name: 'API 1 (Primary)',
        url: 'https://sheetdb.io/api/v1/bw2ae39l9rmaj',
        timeout: 8000
    },
    {
        name: 'API 2 (Fallback)',
        url: 'https://sheet2api.com/v1/jJwY3qT5TFqV/civil-4th-diploma-tutor',
        timeout: 10000
    },
    {
        name: 'API 3 (Fallback)',
        url: 'https://api.sheety.co/821ecc958a063a3a52c103e87f8a214f/civil4ThDiplomaTutor/sheet1',
        timeout: 10000
    },
    {
        name: 'API 4 (Fallback)',
        url: 'https://script.google.com/macros/s/AKfycbwSamBeEh5VSs939teC74Riw6XW0ZHveyTtCNr8itBm7BtwnDeKjChxNG3gnplySwk/exec',
        timeout: 10000
    }
];

// ============================================================
// 🔑 YouTube API Key
// ============================================================
const YOUTUBE_API_KEY = 'AIzaSyD8JqRloRcTNoZuR0tBy14wF7Bs7BxT3t4';

// Complete status tracking
let completedItems = {};

// Cache for video durations
let videoDurationCache = {};

// Debounce timer for cache save
let cacheSaveTimer = null;

// ============================================================
// 💾 localStorage লোড/সেভ
// ============================================================
function loadCompletedItems() {
    try {
        const saved = localStorage.getItem('completedCourseItems');
        if (saved) completedItems = JSON.parse(saved);
    } catch (error) {
        console.error('Error loading completed items:', error);
        completedItems = {};
    }
}

function saveCompletedItems() {
    try {
        localStorage.setItem('completedCourseItems', JSON.stringify(completedItems));
    } catch (error) {
        console.error('Error saving completed items:', error);
    }
}

function loadVideoDurationCache() {
    try {
        const saved = localStorage.getItem('videoDurationCache');
        if (saved) videoDurationCache = JSON.parse(saved);
    } catch (error) {
        console.error('Error loading video duration cache:', error);
        videoDurationCache = {};
    }
}

// Debounced save — প্রতি ভিডিওতে write হবে না
function saveVideoDurationCache() {
    if (cacheSaveTimer) clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('videoDurationCache', JSON.stringify(videoDurationCache));
        } catch (error) {
            console.error('Error saving video duration cache:', error);
        }
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
// 🔍 Normalize different API response formats
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
    
    console.warn(`⚠️ ${apiName}: unknown response format`, data);
    return null;
}

// ============================================================
// 🚀 Try each API in order until one works
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
            
            if (i < API_ENDPOINTS.length - 1) {
                console.log(`➡️ পরবর্তী API চেষ্টা করা হচ্ছে...`);
            }
        }
    }
    
    throw lastError || new Error('সব API ব্যর্থ হয়েছে');
}

// ============================================================
// 🔄 API classes → sections রূপান্তর
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
// 🎬 YouTube Video ID বের করা
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
        } catch (e) {
            console.error('Invalid URL:', url);
        }
    } else if (url.includes('youtube.com/embed/')) {
        videoId = url.split('embed/')[1].split('?')[0];
    } else if (url.includes('youtube.com/shorts/')) {
        videoId = url.split('shorts/')[1].split('?')[0];
    }
    
    return videoId;
}

// ============================================================
// ⏱️ Duration ফরম্যাট (ISO 8601 → MM:SS / HH:MM:SS)
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
// 📡 YouTube API থেকে batch ডিউরেশন
// ============================================================
async function getVideoDurationsBatch(videoIds) {
    const result = {};
    const uncachedIds = [];
    
    videoIds.forEach(id => {
        if (!id) return;
        if (videoDurationCache[id]) {
            result[id] = videoDurationCache[id];
        } else {
            uncachedIds.push(id);
        }
    });
    
    if (uncachedIds.length === 0) return result;
    
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        console.warn('⚠️ YouTube API Key সেট করা নেই');
        uncachedIds.forEach(id => result[id] = '--:--');
        return result;
    }
    
    const CHUNK_SIZE = 50;
    for (let i = 0; i < uncachedIds.length; i += CHUNK_SIZE) {
        const chunk = uncachedIds.slice(i, i + CHUNK_SIZE);
        
        try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunk.join(',')}&key=${YOUTUBE_API_KEY}`;
            console.log(`📡 YouTube API batch call: ${chunk.length}টি ভিডিও`);
            
            const response = await fetch(apiUrl);
            const data = await response.json();
            
            if (!response.ok || data.error) {
                console.error('❌ YouTube API Error:', data.error);
                chunk.forEach(id => result[id] = '--:--');
                continue;
            }
            
            const foundIds = new Set();
            if (data.items) {
                data.items.forEach(item => {
                    const duration = formatDuration(item.contentDetails.duration);
                    result[item.id] = duration;
                    videoDurationCache[item.id] = duration;
                    foundIds.add(item.id);
                });
            }
            
            chunk.forEach(id => {
                if (!foundIds.has(id)) {
                    result[id] = '--:--';
                }
            });
            
        } catch (error) {
            console.error('❌ Batch fetch error:', error);
            chunk.forEach(id => result[id] = '--:--');
        }
    }
    
    saveVideoDurationCache();
    return result;
}

// ============================================================
// 🔄 সব ভিডিওর ডিউরেশন আপডেট
// ============================================================
async function updateAllVideoDurations() {
    const videoItems = document.querySelectorAll('.content-item .fa-youtube');
    
    const itemsWithId = [];
    const allIds = [];
    
    videoItems.forEach(videoIcon => {
        const contentItem = videoIcon.closest('.content-item');
        const linkIcon = contentItem.querySelector('.link-icon');
        
        let videoLink = contentItem.dataset.link || '';
        
        if (videoLink) {
            const videoId = extractYouTubeVideoId(videoLink);
            
            if (videoId) {
                let durationSpan = contentItem.querySelector('.video-duration');
                
                if (!durationSpan) {
                    durationSpan = document.createElement('span');
                    durationSpan.className = 'video-duration';
                    
                    if (linkIcon) {
                        contentItem.insertBefore(durationSpan, linkIcon);
                    } else {
                        contentItem.appendChild(durationSpan);
                    }
                }
                
                durationSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                itemsWithId.push({ videoId, durationSpan });
                allIds.push(videoId);
            }
        }
    });
    
    if (allIds.length === 0) return;
    
    const durations = await getVideoDurationsBatch(allIds);
    
    itemsWithId.forEach(({ videoId, durationSpan }) => {
        durationSpan.textContent = durations[videoId] || '--:--';
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
// ✅ Complete toggle
// ============================================================
window.toggleComplete = function(itemId, checkbox, event) {
    if (event) event.stopPropagation();
    
    if (checkbox.checked) {
        completedItems[itemId] = true;
        showNotification('✓ সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে', 'success');
    } else {
        delete completedItems[itemId];
        showNotification('সম্পন্ন চিহ্নিত করা সরানো হয়েছে', 'info');
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

// ============================================================
// 📊 Progress আপডেট
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
// 🧰 HTML escape (XSS protection)
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
// 📄 PDF Viewer
// ============================================================
window.openPDFViewer = function(pdfUrl, title) {
    const encodedUrl = encodeURIComponent(pdfUrl);
    const safeTitle = escapeHtml(title);
    
    const popupHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${safeTitle} - PDF ভিউয়ার</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; background: #f1f5f9; height: 100vh; overflow: hidden; position: fixed; width: 100%; }
                .pdf-container { display: flex; flex-direction: column; height: 100vh; }
                .toolbar { background: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-bottom: 1px solid #e2e8f0; }
                .toolbar-left { display: flex; align-items: center; gap: 1rem; flex: 1; min-width: 0; }
                .toolbar-left i { color: #ef4444; font-size: 1.5rem; flex-shrink: 0; }
                .toolbar-left h3 { color: #1e293b; font-size: 1.2rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 1rem; }
                .toolbar-right { display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }
                .btn-download { background: #2563eb; color: white; padding: 0.6rem 1.5rem; border-radius: 0.5rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
                .close-btn { background: white; border: 1px solid #e2e8f0; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; font-size: 1.2rem; }
                .pdf-frame { flex: 1; width: 100%; border: none; background: #e2e8f0; }
                @media (max-width: 480px) {
                    .toolbar-left h3 { max-width: 150px; font-size: 0.9rem; }
                    .btn-download span { display: none; }
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        </head>
        <body>
            <div class="pdf-container">
                <div class="toolbar">
                    <div class="toolbar-left">
                        <i class="fas fa-file-pdf"></i>
                        <h3>${safeTitle}</h3>
                    </div>
                    <div class="toolbar-right">
                        <button class="btn-download" id="downloadBtn">
                            <i class="fas fa-download"></i>
                            <span>ডাউনলোড</span>
                        </button>
                        <div class="close-btn" onclick="window.close()" title="বন্ধ করুন">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                </div>
                <iframe class="pdf-frame" src="https://docs.google.com/viewer?url=${encodedUrl}&embedded=true" allowfullscreen></iframe>
            </div>
            <script>
                document.getElementById('downloadBtn').addEventListener('click', function() {
                    const a = document.createElement('a');
                    a.href = ${JSON.stringify(pdfUrl)};
                    a.download = ${JSON.stringify(pdfUrl.split('/').pop() || 'document.pdf')};
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
                document.addEventListener('keydown', function(e) { if (e.key === 'Escape') window.close(); });
            <\/script>
        </body>
        </html>
    `;
    
    const pdfWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    if (pdfWindow) {
        pdfWindow.document.write(popupHTML);
        pdfWindow.document.close();
    } else {
        showNotification('পপ-আপ ব্লকার সক্রিয়। সরাসরি খুলছি...', 'info');
        setTimeout(() => window.open(pdfUrl, '_blank'), 1000);
    }
};

// ============================================================
// ▶️ YouTube Player (custom fullscreen button removed)
// ============================================================
window.openYouTubePlayer = function(videoUrl, title) {
    const videoId = extractYouTubeVideoId(videoUrl);
    const safeTitle = escapeHtml(title);
    
    if (!videoId) {
        window.open(videoUrl, '_blank');
        return;
    }
    
    // ✅ fs=1 → YouTube fullscreen enable
    // ✅ playsinline=1 → mobile-এ iframe-এর ভেতরে play
    const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=1&autoplay=1&fs=1&playsinline=1`;
    
    const playerHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>${safeTitle} - ইউটিউব প্লেয়ার</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { 
                    width: 100%; height: 100%; 
                    background: #000; overflow: hidden; 
                    font-family: 'Inter', sans-serif;
                }
                .player-container { 
                    display: flex; flex-direction: column; 
                    height: 100vh; width: 100vw;
                    background: #0f0f0f;
                }
                .toolbar { 
                    background: #1f1f1f; 
                    padding: 0.75rem 1.5rem; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    flex-shrink: 0;
                    border-bottom: 1px solid #333;
                }
                .toolbar-left { 
                    display: flex; align-items: center; gap: 0.75rem; 
                    flex: 1; min-width: 0;
                }
                .toolbar-left i { 
                    color: #ff0000; font-size: 1.3rem; flex-shrink: 0;
                }
                .toolbar-left h3 { 
                    color: #fff; font-size: 1rem; font-weight: 500; 
                    overflow: hidden; text-overflow: ellipsis; 
                    white-space: nowrap;
                }
                .toolbar-right { 
                    display: flex; align-items: center; gap: 0.75rem; 
                    flex-shrink: 0;
                }
                .btn-watch { 
                    background: #ff0000; color: white; 
                    padding: 0.5rem 1.25rem; border-radius: 2rem; 
                    font-weight: 500; cursor: pointer; border: none; 
                    font-size: 0.9rem; display: flex; 
                    align-items: center; gap: 0.4rem;
                    text-decoration: none;
                }
                .btn-watch:hover { background: #cc0000; }
                .close-btn { 
                    background: rgba(51,51,51,0.9); 
                    border: 1px solid #444; 
                    border-radius: 50%; 
                    width: 36px; height: 36px; 
                    display: flex; align-items: center; 
                    justify-content: center; cursor: pointer; 
                    color: white; font-size: 1rem;
                }
                .close-btn:hover { background: #333; }
                .video-wrapper { 
                    flex: 1; 
                    position: relative; 
                    background: #000; 
                    overflow: hidden;
                    min-height: 0;
                }
                .video-frame { 
                    position: absolute; 
                    top: 0; left: 0; 
                    width: 100%; height: 100%; 
                    border: 0; 
                    background: #000;
                }
                @media (max-width: 480px) {
                    .toolbar-left h3 { max-width: 140px; font-size: 0.85rem; }
                    .btn-watch span { display: none; }
                    .btn-watch { padding: 0.5rem 0.75rem; }
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        </head>
        <body>
            <div class="player-container">
                <div class="toolbar">
                    <div class="toolbar-left">
                        <i class="fab fa-youtube"></i>
                        <h3>${safeTitle}</h3>
                    </div>
                    <div class="toolbar-right">
                        <a class="btn-watch" id="watchBtn" href="${escapeAttr(videoUrl)}" target="_blank" rel="noopener">
                            <i class="fab fa-youtube"></i>
                            <span>ইউটিউবে</span>
                        </a>
                        <div class="close-btn" onclick="window.close()" title="বন্ধ করুন">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                </div>
                <div class="video-wrapper">
                    <iframe 
                        class="video-frame" 
                        src="${embedUrl}" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" 
                        allowfullscreen="true"
                        webkitallowfullscreen="true"
                        mozallowfullscreen="true"
                        frameborder="0"
                        referrerpolicy="strict-origin-when-cross-origin">
                    </iframe>
                </div>
            </div>
            <script>
                document.addEventListener('keydown', function(e) { 
                    if (e.key === 'Escape') window.close(); 
                });
            <\/script>
        </body>
        </html>
    `;
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const features = isMobile 
        ? `width=${screen.availWidth},height=${screen.availHeight},scrollbars=no,resizable=yes`
        : 'width=1200,height=800,scrollbars=no,resizable=yes';
    
    const videoWindow = window.open('', '_blank', features);
    if (videoWindow) {
        videoWindow.document.write(playerHTML);
        videoWindow.document.close();
    } else {
        window.open(videoUrl, '_blank');
    }
};

// ============================================================
// 🚀 Main load function
// ============================================================
async function loadSections() {
    loadCompletedItems();
    loadVideoDurationCache();
    
    try {
        const classes = await fetchClassesWithFallback();
        
        document.getElementById('course-title').textContent = 'Civil 4th Semester';
        
        const sections = transformClassesToSections(classes);
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
                <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem;">
                    ইন্টারনেট সংযোগ পরীক্ষা করুন।
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
                    ${isYouTube ? '<span class="video-duration"><i class="fas fa-spinner fa-spin"></i></span>' : ''}
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
            
            if (type === 'pdf') {
                window.openPDFViewer(link, title);
            } else if (type === 'video') {
                window.openYouTubePlayer(link, title);
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
        saveCompletedItems();
        
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
    `;
    document.head.appendChild(style);
    
    loadSections();
    
    const resetBtn = document.getElementById('reset-progress');
    if (resetBtn) resetBtn.addEventListener('click', window.resetAllProgress);
    
    if (window.location.search.includes('reset=true')) {
        setTimeout(() => window.resetAllProgress(), 1000);
    }
    
    if (!navigator.onLine) {
        showNotification('আপনি অফলাইনে আছেন। কিছু ফিচার কাজ নাও করতে পারে।', 'info');
    }
    
    window.addEventListener('online', () => {
        showNotification('আপনি অনলাইনে ফিরে এসেছেন!', 'success');
    });
    
    window.addEventListener('offline', () => {
        showNotification('আপনি অফলাইনে চলে গেছেন।', 'info');
    });
    
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
                position: fixed;
                top: 80px;
                right: 20px;
                background: var(--primary);
                color: white;
                padding: 10px 20px;
                border-radius: 50px;
                font-size: 14px;
                z-index: 2001;
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

window.addEventListener('appinstalled', (evt) => {
    console.log('App was installed.');
    showNotification('অ্যাপ সফলভাবে ইন্সটল হয়েছে! 🎉', 'success');
});