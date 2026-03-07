// API Endpoint
const API_URL = 'https://api.karigoripathsala.com/api/courses/3rd-semester-full-course-chbite-likha-dipartment-gulor-jnz-1';

// YouTube API Key
const YOUTUBE_API_KEY = 'AIzaSyC4jVo_d7EEo1115oUexLMm-d2WzaK29UM';

// Complete status tracking
let completedItems = {};

// Cache for video durations
let videoDurationCache = {};

// New items tracking
let newItems = {};

// Live items tracking
let liveItems = {};

// YouTube Player Instance
let youtubePlayer = null;
let currentVideoId = null;
let currentVideoItemId = null;
let autoCompleteTimer = null;

// বাংলাদেশ সময় ইউটিলিটি ফাংশন
function getBangladeshTime(date = new Date()) {
    return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
}

function getBangladeshNow() {
    const now = new Date();
    return getBangladeshTime(now);
}

// Load completed items from localStorage
function loadCompletedItems() {
    try {
        const saved = localStorage.getItem('completedCourseItems');
        if (saved) {
            completedItems = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Error loading completed items:', error);
        completedItems = {};
    }
}

// Load new items tracking
function loadNewItems() {
    try {
        const saved = localStorage.getItem('newCourseItems');
        if (saved) {
            const data = JSON.parse(saved);
            const bangladeshNow = getBangladeshNow().getTime();
            
            newItems = {};
            Object.entries(data).forEach(([key, expiryTime]) => {
                if (bangladeshNow < expiryTime) {
                    newItems[key] = expiryTime;
                }
            });
            
            saveNewItems();
        } else {
            newItems = {};
        }
    } catch (error) {
        console.error('Error loading new items:', error);
        newItems = {};
    }
}

// Load live items tracking
function loadLiveItems() {
    try {
        const saved = localStorage.getItem('liveCourseItems');
        if (saved) {
            liveItems = JSON.parse(saved);
        } else {
            liveItems = {};
        }
    } catch (error) {
        console.error('Error loading live items:', error);
        liveItems = {};
    }
}

// Save new items
function saveNewItems() {
    try {
        localStorage.setItem('newCourseItems', JSON.stringify(newItems));
    } catch (error) {
        console.error('Error saving new items:', error);
    }
}

// Save live items
function saveLiveItems() {
    try {
        localStorage.setItem('liveCourseItems', JSON.stringify(liveItems));
    } catch (error) {
        console.error('Error saving live items:', error);
    }
}

// ============= নতুন ফাংশন: লাইভ স্ট্যাটাস চেক =============
function getLiveStatus(startTime, endTime) {
    if (!startTime) return null;
    
    const bangladeshNow = getBangladeshNow();
    const startTimeBD = getBangladeshTime(new Date(startTime));
    
    let endTimeBD;
    if (endTime) {
        endTimeBD = getBangladeshTime(new Date(endTime));
        // যদি end_time start_time এর চেয়ে ছোট হয়, তাহলে start_time + ২ ঘন্টা
        if (endTimeBD <= startTimeBD) {
            endTimeBD = new Date(startTimeBD.getTime() + (2 * 60 * 60 * 1000));
        }
    } else {
        // end_time না থাকলে start_time + ২ ঘন্টা
        endTimeBD = new Date(startTimeBD.getTime() + (2 * 60 * 60 * 1000));
    }
    
    // লাইভ চলছে কিনা চেক করুন (start_time এবং end_time এর মধ্যে)
    if (bangladeshNow >= startTimeBD && bangladeshNow <= endTimeBD) {
        return {
            status: 'live',
            startTime: startTimeBD,
            endTime: endTimeBD,
            badge: '<span class="live-badge-small"><i class="fas fa-circle"></i> লাইভ</span>',
            message: '🔴 লাইভ চলছে'
        };
    }
    
    // লাইভ শেষ হয়েছে কিনা এবং ২৪ ঘন্টার মধ্যে কিনা চেক করুন
    const twentyFourHoursAfterEnd = new Date(endTimeBD.getTime() + (24 * 60 * 60 * 1000));
    if (bangladeshNow > endTimeBD && bangladeshNow <= twentyFourHoursAfterEnd) {
        return {
            status: 'new',
            startTime: startTimeBD,
            endTime: endTimeBD,
            badge: '<span class="new-badge">নতুন</span>',
            message: 'নতুন (২৪ ঘন্টা)'
        };
    }
    
    return null;
}

// Check if item is new (for non-live items)
function isItemNew(itemKey, availableFrom) {
    if (!availableFrom) return false;
    
    // First check if we have it in storage
    if (newItems[itemKey]) {
        const bangladeshNow = getBangladeshNow().getTime();
        return bangladeshNow < newItems[itemKey];
    }
    
    const availableDate = new Date(availableFrom);
    const availableTimeBD = getBangladeshTime(availableDate).getTime();
    const expiryTimeBD = availableTimeBD + (24 * 60 * 60 * 1000);
    const bangladeshNow = getBangladeshNow().getTime();
    
    if (bangladeshNow < expiryTimeBD) {
        newItems[itemKey] = expiryTimeBD;
        saveNewItems();
        return true;
    }
    
    return false;
}

// ============= লাইভ ক্লাস চেক (ব্যানারের জন্য) =============
async function checkLiveContent(sections) {
    const bangladeshNow = getBangladeshNow();
    const bannerImage = document.getElementById('banner-image');
    const liveContainer = document.getElementById('live-video-container');
    const liveFrame = document.getElementById('live-video-frame');
    
    let liveContentFound = false;
    let liveClassDetails = null;
    
    console.log('🕐 লাইভ ক্লাস চেক করা হচ্ছে...');
    
    for (const section of sections) {
        if (section.contents && section.contents.length > 0) {
            for (const content of section.contents) {
                if (content.type !== 'live') continue;
                
                let startTime = null;
                let endTime = null;
                let liveLink = null;
                let contentTitle = decodeUnicode(content.title);
                
                if (content.resource && content.resource.resourceable) {
                    if (content.resource.resourceable.start_time) {
                        startTime = content.resource.resourceable.start_time;
                    }
                    if (content.resource.resourceable.end_time) {
                        endTime = content.resource.resourceable.end_time;
                    }
                    liveLink = content.resource.resourceable.link || content.link;
                }
                
                if (startTime) {
                    const status = getLiveStatus(startTime, endTime);
                    
                    if (status && status.status === 'live') {
                        liveContentFound = true;
                        liveClassDetails = {
                            title: contentTitle,
                            section: decodeUnicode(section.title),
                            start: status.startTime,
                            end: status.endTime,
                            link: liveLink
                        };
                        break;
                    }
                }
            }
            if (liveContentFound) break;
        }
    }
    
    if (liveContentFound && liveClassDetails) {
        let videoLink = liveClassDetails.link || '';
        
        if (videoLink.includes('youtube.com/watch') || videoLink.includes('youtu.be')) {
            let videoId = '';
            if (videoLink.includes('youtu.be/')) {
                videoId = videoLink.split('youtu.be/')[1].split('?')[0];
            } else if (videoLink.includes('youtube.com/watch')) {
                try {
                    const urlParams = new URLSearchParams(new URL(videoLink).search);
                    videoId = urlParams.get('v');
                } catch (e) {
                    console.error('Invalid YouTube URL:', videoLink);
                }
            }
            
            if (videoId) {
                videoLink = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=1&enablejsapi=1`;
            }
        }
        
        bannerImage.style.display = 'none';
        liveContainer.style.display = 'block';
        liveFrame.src = videoLink;
        
        let controls = document.querySelector('.live-video-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'live-video-controls';
            liveContainer.appendChild(controls);
        }
        
        controls.innerHTML = `
            <i class="fas fa-circle"></i>
            আজকের লাইভ ক্লাস: ${liveClassDetails.title}
        `;
        
        showNotification(`🔴 ${liveClassDetails.section} - ${liveClassDetails.title} লাইভ চলছে`, 'info');
        
    } else {
        bannerImage.style.display = 'block';
        liveContainer.style.display = 'none';
        liveFrame.src = '';
        
        const controls = document.querySelector('.live-video-controls');
        if (controls) {
            controls.remove();
        }
    }
    
    return liveContentFound;
}

// Load video duration cache
function loadVideoDurationCache() {
    try {
        const saved = localStorage.getItem('videoDurationCache');
        if (saved) {
            videoDurationCache = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Error loading video duration cache:', error);
        videoDurationCache = {};
    }
}

// Save video duration cache
function saveVideoDurationCache() {
    try {
        localStorage.setItem('videoDurationCache', JSON.stringify(videoDurationCache));
    } catch (error) {
        console.error('Error saving video duration cache:', error);
    }
}

// Save completed items
function saveCompletedItems() {
    try {
        localStorage.setItem('completedCourseItems', JSON.stringify(completedItems));
    } catch (error) {
        console.error('Error saving completed items:', error);
    }
}

// Toggle complete status
window.toggleComplete = function(itemId, checkbox) {
    if (event) {
        event.stopPropagation();
    }
    
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
        if (checkbox.checked) {
            contentItem.classList.add('completed');
        } else {
            contentItem.classList.remove('completed');
        }
    }
    
    updateSectionProgress(checkbox.closest('.section-card'));
    updateOverallProgress();
}

// Show notification
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
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .live-badge-small {
        display: inline-flex;
        align-items: center;
        background: #ef4444;
        color: white;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.2rem 0.5rem;
        border-radius: 1rem;
        margin-left: 0.5rem;
        animation: livePulseSmall 1.5s infinite;
    }
    
    .live-badge-small i {
        font-size: 0.5rem;
        margin-right: 0.2rem;
        animation: liveBlinkSmall 1s infinite;
    }
    
    @keyframes livePulseSmall {
        0% { opacity: 0.9; }
        50% { opacity: 1; background: #dc2626; }
        100% { opacity: 0.9; }
    }
    
    @keyframes liveBlinkSmall {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

// Update section progress
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

// Update overall progress
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

// Update all progress
function updateAllProgress() {
    document.querySelectorAll('.section-card').forEach(section => {
        updateSectionProgress(section);
    });
    updateOverallProgress();
}

// Get icon for content
function getIconForContent(content, link, title) {
    const titleLower = title.toLowerCase();
    const linkLower = link.toLowerCase();
    
    if (content.type === 'pdf' || linkLower.includes('.pdf') || titleLower.includes('pdf') || titleLower.includes('পিডিএফ')) {
        return { iconClass: 'fas fa-file-pdf', isPDF: true, isYouTube: false };
    }
    
    if (content.type === 'video' || content.type === 'live' ||
        linkLower.includes('youtube.com') || 
        linkLower.includes('youtu.be') || 
        titleLower.includes('ভিডিও') || 
        titleLower.includes('video') ||
        titleLower.includes('ইউটিউব') ||
        titleLower.includes('youtube')) {
        return { iconClass: 'fab fa-youtube', isPDF: false, isYouTube: true };
    }
    
    if (linkLower.includes('whatsapp') || titleLower.includes('whatsapp') || titleLower.includes('হোয়াটসঅ্যাপ')) {
        return { iconClass: 'fab fa-whatsapp', isPDF: false, isYouTube: false };
    }
    
    return { iconClass: 'fas fa-file-alt', isPDF: false, isYouTube: false };
}

// Extract YouTube Video ID
function extractYouTubeVideoId(url) {
    let videoId = '';
    
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

// Format duration
function formatDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    
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

// Get video duration
async function getVideoDuration(videoId) {
    if (videoDurationCache[videoId]) {
        return videoDurationCache[videoId];
    }
    
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        return '--:--';
    }
    
    try {
        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error('YouTube API request failed');
        }
        
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const duration = data.items[0].contentDetails.duration;
            const formattedDuration = formatDuration(duration);
            
            videoDurationCache[videoId] = formattedDuration;
            saveVideoDurationCache();
            
            return formattedDuration;
        }
        
        return '--:--';
    } catch (error) {
        console.error('Error fetching video duration:', error);
        return '--:--';
    }
}

// Update all video durations
async function updateAllVideoDurations() {
    const videoItems = document.querySelectorAll('.content-item .fa-youtube');
    
    for (const videoIcon of videoItems) {
        const contentItem = videoIcon.closest('.content-item');
        const titleSpan = contentItem.querySelector('.content-title');
        const linkIcon = contentItem.querySelector('.link-icon');
        
        const onclickAttr = titleSpan.getAttribute('onclick');
        let videoLink = '';
        
        if (onclickAttr) {
            const match = onclickAttr.match(/'([^']+)'/g);
            if (match && match[0]) {
                videoLink = match[0].replace(/'/g, '');
            }
        }
        
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
                
                const duration = await getVideoDuration(videoId);
                durationSpan.textContent = duration;
            }
        }
    }
}

// PDF Viewer
window.openPDFViewer = function(pdfUrl, title) {
    const encodedUrl = encodeURIComponent(pdfUrl);
    
    const popupHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title} - PDF ভিউয়ার</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; background: #f1f5f9; height: 100vh; overflow: hidden; position: fixed; width: 100%; }
                .pdf-container { display: flex; flex-direction: column; height: 100vh; }
                .toolbar { background: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-bottom: 1px solid #e2e8f0; }
                .toolbar-left { display: flex; align-items: center; gap: 1rem; flex: 1; min-width: 0; }
                .toolbar-left i { color: #ef4444; font-size: 1.5rem; flex-shrink: 0; }
                .toolbar-left h3 { color: #1e293b; font-size: 1.2rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .toolbar-right { display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }
                .btn-download { background: #2563eb; color: white; padding: 0.6rem 1.5rem; border-radius: 0.5rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s ease; white-space: nowrap; }
                .btn-download:hover { background: #1d4ed8; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
                .close-btn { background: white; border: 1px solid #e2e8f0; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; color: #64748b; font-size: 1.2rem; flex-shrink: 0; }
                .close-btn:hover { background: #f1f5f9; transform: rotate(90deg); color: #ef4444; }
                .pdf-frame { flex: 1; width: 100%; border: none; background: #e2e8f0; }
                @media (max-width: 768px) { .toolbar { padding: 0.75rem 1rem; } .toolbar-left h3 { font-size: 1rem; max-width: 200px; } .btn-download { padding: 0.5rem 1rem; font-size: 0.85rem; } .close-btn { width: 36px; height: 36px; } }
                @media (max-width: 480px) { .toolbar-left h3 { max-width: 150px; font-size: 0.9rem; } .btn-download span { display: none; } .btn-download i { margin-right: 0; } .close-btn { width: 32px; height: 32px; } }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        </head>
        <body>
            <div class="pdf-container">
                <div class="toolbar">
                    <div class="toolbar-left">
                        <i class="fas fa-file-pdf"></i>
                        <h3 title="${title}">${title}</h3>
                    </div>
                    <div class="toolbar-right">
                        <button class="btn-download" onclick="downloadPDF('${pdfUrl}')">
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
                function downloadPDF(url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = url.split('/').pop() || 'document.pdf';
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape') window.close();
                });
            <\/script>
        </body>
        </html>
    `;
    
    const pdfWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    if (pdfWindow) {
        pdfWindow.document.write(popupHTML);
        pdfWindow.document.close();
    } else {
        window.open(pdfUrl, '_blank');
    }
};

// ==================== ইউটিউব প্লেয়ার ফাংশন ====================

// Load YouTube IFrame API
function loadYouTubeAPI() {
    return new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }
        
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        window.onYouTubeIframeAPIReady = () => {
            resolve(window.YT);
        };
    });
}

// মোবাইল ডিভাইস চেক
function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ভিডিও সাইজ অ্যাডজাস্ট
function adjustVideoSize() {
    if (!youtubePlayer) return;
    
    try {
        const iframe = youtubePlayer.getIframe();
        if (iframe) {
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.objectFit = 'contain';
            iframe.style.maxWidth = '100%';
            iframe.style.maxHeight = '100%';
            
            const container = document.getElementById('youtube-player-container');
            if (container) {
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'center';
                container.style.overflow = 'hidden';
            }
        }
    } catch (e) {
        console.error('Error adjusting video size:', e);
    }
}

// প্লেয়ার রেডি ইভেন্ট
function onPlayerReady(event) {
    console.log('✅ YouTube Player ready');
    
    adjustVideoSize();
    
    window.addEventListener('resize', adjustVideoSize);
    
    if (autoCompleteTimer) clearInterval(autoCompleteTimer);
    
    autoCompleteTimer = setInterval(() => {
        if (youtubePlayer && youtubePlayer.getCurrentTime && youtubePlayer.getDuration) {
            try {
                const currentTime = youtubePlayer.getCurrentTime();
                const duration = youtubePlayer.getDuration();
                const timeInfo = document.getElementById('video-time-info');
                
                if (timeInfo && duration > 0) {
                    const currentFormatted = formatTime(currentTime);
                    const durationFormatted = formatTime(duration);
                    timeInfo.innerHTML = `<i class="fas fa-clock"></i> ${currentFormatted} / ${durationFormatted}`;
                }
            } catch (e) {
                console.error('Error updating time:', e);
            }
        }
    }, 1000);
}

// প্লেয়ার স্টেট চেঞ্জ ইভেন্ট
function onPlayerStateChange(event) {
    if (event.data === 0) {
        console.log('🎬 ভিডিও শেষ হয়েছে');
        
        if (currentVideoItemId && !completedItems[currentVideoItemId]) {
            completedItems[currentVideoItemId] = true;
            saveCompletedItems();
            
            const checkbox = document.querySelector(`.content-item[data-item-id="${currentVideoItemId}"] .complete-checkbox`);
            if (checkbox) {
                checkbox.checked = true;
                const contentItem = checkbox.closest('.content-item');
                if (contentItem) {
                    contentItem.classList.add('completed');
                }
            }
            
            const sectionCard = document.querySelector(`.content-item[data-item-id="${currentVideoItemId}"]`)?.closest('.section-card');
            if (sectionCard) {
                updateSectionProgress(sectionCard);
            }
            updateOverallProgress();
            
            const completeBtn = document.getElementById('mark-completed-btn');
            completeBtn.classList.add('completed');
            
            showNotification('✓ ভিডিও শেষ! অটোমেটিক সম্পন্ন হয়েছে', 'success');
        }
    }
}

// প্লেয়ার এরর ইভেন্ট
function onPlayerError(event) {
    console.error('❌ YouTube Player error:', event.data);
    showNotification('ভিডিও লোড করতে সমস্যা হচ্ছে', 'error');
}

// টাইম ফরম্যাট
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// ইউটিউব প্লেয়ার ওপেন
window.openYouTubePlayer = async function(videoUrl, title, itemId) {
    const videoId = extractYouTubeVideoId(videoUrl);
    
    if (!videoId) {
        console.error('Invalid YouTube URL:', videoUrl);
        window.open(videoUrl, '_blank');
        return;
    }
    
    const YT = await loadYouTubeAPI();
    
    if (youtubePlayer && youtubePlayer.destroy) {
        youtubePlayer.destroy();
    }
    
    if (autoCompleteTimer) {
        clearInterval(autoCompleteTimer);
        autoCompleteTimer = null;
    }
    
    const container = document.getElementById('youtube-player-container');
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    
    const playerDiv = document.createElement('div');
    playerDiv.id = 'youtube-player';
    playerDiv.style.width = '100%';
    playerDiv.style.height = '100%';
    playerDiv.style.position = 'absolute';
    playerDiv.style.top = '0';
    playerDiv.style.left = '0';
    container.appendChild(playerDiv);
    
    document.getElementById('player-modal-title').textContent = title;
    
    currentVideoId = videoId;
    currentVideoItemId = itemId;
    
    const isCompleted = completedItems[itemId] || false;
    const completeBtn = document.getElementById('mark-completed-btn');
    if (isCompleted) {
        completeBtn.classList.add('completed');
        completeBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>সম্পন্ন</span>';
    } else {
        completeBtn.classList.remove('completed');
        completeBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>সম্পন্ন</span>';
    }
    
    youtubePlayer = new YT.Player('youtube-player', {
        videoId: videoId,
        playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            controls: 1,
            fs: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            playsinline: 1,
            origin: window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
    
    document.getElementById('youtube-player-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        adjustVideoSize();
    }, 500);
};

// প্লেয়ার বন্ধ
window.closeYouTubePlayer = function() {
    window.removeEventListener('resize', adjustVideoSize);
    
    if (youtubePlayer && youtubePlayer.destroy) {
        youtubePlayer.destroy();
        youtubePlayer = null;
    }
    
    if (autoCompleteTimer) {
        clearInterval(autoCompleteTimer);
        autoCompleteTimer = null;
    }
    
    document.getElementById('youtube-player-modal').style.display = 'none';
    document.body.style.overflow = '';
    
    currentVideoId = null;
    currentVideoItemId = null;
};

// সম্পন্ন হিসেবে চিহ্নিত
window.markCurrentVideoComplete = function() {
    if (!currentVideoItemId) {
        showNotification('কোনো ভিডিও সক্রিয় নেই', 'info');
        return;
    }
    
    const checkbox = document.querySelector(`.content-item[data-item-id="${currentVideoItemId}"] .complete-checkbox`);
    if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        completedItems[currentVideoItemId] = true;
        saveCompletedItems();
        
        const contentItem = checkbox.closest('.content-item');
        if (contentItem) {
            contentItem.classList.add('completed');
        }
        
        const sectionCard = contentItem?.closest('.section-card');
        if (sectionCard) {
            updateSectionProgress(sectionCard);
        }
        updateOverallProgress();
        
        const completeBtn = document.getElementById('mark-completed-btn');
        completeBtn.classList.add('completed');
        
        showNotification('✓ ভিডিও সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে', 'success');
    }
};

// ইউটিউবে দেখুন
window.watchOnYouTube = function() {
    if (currentVideoId) {
        window.open(`https://www.youtube.com/watch?v=${currentVideoId}`, '_blank');
    }
};

// ==================== মূল ফাংশন ====================

// Main function to load data
async function loadSections() {
    loadCompletedItems();
    loadVideoDurationCache();
    loadNewItems();
    loadLiveItems();
    
    try {
        console.log('📡 API কল করা হচ্ছে:', API_URL);
        
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        console.log('📦 API ডাটা:', data);
        
        document.getElementById('course-title').textContent = 
            decodeUnicode(data.title) || '৩য় সেমিস্টার ফুল কোর্স';
        
        displaySections(data.sections || []);
        
        await checkLiveContent(data.sections || []);
        
        setTimeout(() => {
            updateAllVideoDurations();
        }, 1000);
        
        // প্রতি ১ মিনিট পর লাইভ স্ট্যাটাস চেক করুন
        setInterval(() => {
            checkLiveContent(data.sections || []);
        }, 60000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('sections-container').innerHTML = `
            <div class="empty-message" style="padding: 4rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 1.5rem;">ডেটা লোড করতে সমস্যা হচ্ছে।</p>
                <button onclick="location.reload()" style="padding: 0.75rem 2rem; background: #2563eb; color: white; border: none; border-radius: 1rem; cursor: pointer; font-size: 1rem; font-weight: 500; transition: all 0.3s ease;">
                    <i class="fas fa-redo-alt" style="margin-right: 0.5rem;"></i>
                    আবার চেষ্টা করুন
                </button>
            </div>
        `;
    }
}

// Display sections and contents - আপডেটেড ভার্সন
function displaySections(sections) {
    const container = document.getElementById('sections-container');
    
    if (!sections || sections.length === 0) {
        container.innerHTML = '<div class="empty-message">কোনো সেকশন পাওয়া যায়নি।</div>';
        return;
    }
    
    const sectionsHTML = sections.map((section, index) => {
        const sectionTitle = decodeUnicode(section.title) || `অধ্যায় ${index + 1}`;
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
            
            // লাইভ স্ট্যাটাস এবং ব্যাজ ডিটেক্ট করুন
            let badgeHTML = '';
            let availableFrom = null;
            
            if (content.type === 'live' && content.resource?.resourceable) {
                const startTime = content.resource.resourceable.start_time;
                const endTime = content.resource.resourceable.end_time;
                
                if (startTime) {
                    const status = getLiveStatus(startTime, endTime);
                    if (status) {
                        badgeHTML = status.badge;
                    }
                }
            } else {
                // অন্যান্য কন্টেন্টের জন্য নতুন ব্যাজ
                if (content.available_from) {
                    availableFrom = content.available_from;
                } else if (content.resource?.resourceable?.start_time) {
                    availableFrom = content.resource.resourceable.start_time;
                } else if (content.start_time) {
                    availableFrom = content.start_time;
                }
                
                const isNew = isItemNew(itemId, availableFrom);
                if (isNew) {
                    badgeHTML = '<span class="new-badge">নতুন</span>';
                }
            }
            
            let clickHandler = '';
            if (isPDF) {
                clickHandler = `openPDFViewer('${contentLink.replace(/'/g, "\\'")}', '${contentTitle.replace(/'/g, "\\'")}')`;
            } else if (isYouTube) {
                clickHandler = `openYouTubePlayer('${contentLink.replace(/'/g, "\\'")}', '${contentTitle.replace(/'/g, "\\'")}', '${itemId}')`;
            } else {
                clickHandler = `window.open('${contentLink.replace(/'/g, "\\'")}', '_blank')`;
            }
            
            const isCompleted = completedItems[itemId] || false;
            
            return `
                <div class="content-item ${isCompleted ? 'completed' : ''}" data-item-id="${itemId}">
                    <input type="checkbox" class="complete-checkbox" 
                        onchange="toggleComplete('${itemId}', this)" 
                        ${isCompleted ? 'checked' : ''}
                        onclick="event.stopPropagation()"
                        title="সম্পন্ন হিসাবে চিহ্নিত করুন">
                    <i class="${iconClass}"></i>
                    <span class="content-title" onclick="${clickHandler}">${contentTitle}${badgeHTML}</span>
                    ${isYouTube ? '<span class="video-duration"><i class="fas fa-spinner fa-spin"></i></span>' : ''}
                    ${!isPDF && !isYouTube ? '<i class="fas fa-external-link-alt link-icon" onclick="' + clickHandler + '" title="খুলুন"></i>' : ''}
                </div>
            `;
        }).join('');
        
        return `
            <div class="section-card">
                <div class="section-header" onclick="toggleSection(this)">
                    <div class="left-content">
                        <i class="fas fa-chevron-right section-icon"></i>
                        <h3>${sectionTitle}</h3>
                    </div>
                    <div class="right-content">
                        <div class="section-progress-container">
                            <div class="section-progress-bar" style="width: 0%"></div>
                        </div>
                        <span class="progress-text">0/${contentCount}</span>
                    </div>
                </div>
                <div class="contents-list ${index === 0 ? '' : 'hidden'}">
                    ${contentsHTML || '<div class="empty-message">এখনও ক্লাস হয়নি 😔</div>'}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = sectionsHTML;
    
    const firstSection = document.querySelector('.section-card .contents-list');
    if (firstSection) {
        firstSection.classList.remove('hidden');
        const firstIcon = document.querySelector('.section-header .section-icon');
        if (firstIcon) firstIcon.classList.add('rotated');
    }
    
    updateAllProgress();
}

// Toggle section
window.toggleSection = function(header) {
    if (event) {
        event.stopPropagation();
    }
    
    const contentsList = header.nextElementSibling;
    const icon = header.querySelector('.section-icon');
    
    contentsList.classList.toggle('hidden');
    
    if (icon) {
        icon.classList.toggle('rotated');
    }
    
    const allSections = document.querySelectorAll('.section-card');
    allSections.forEach(section => {
        const otherContents = section.querySelector('.contents-list');
        const otherIcon = section.querySelector('.section-icon');
        if (otherContents !== contentsList && !otherContents.classList.contains('hidden')) {
            otherContents.classList.add('hidden');
            if (otherIcon) otherIcon.classList.remove('rotated');
        }
    });
}

// Decode Unicode
function decodeUnicode(str) {
    if (!str) return '';
    try {
        return JSON.parse('"' + str.replace(/"/g, '\\"') + '"');
    } catch (e) {
        return str;
    }
}

// Reset all progress
window.resetAllProgress = function() {
    if (confirm('সব সম্পন্ন চিহ্নিত করা মুছে ফেলতে চান?')) {
        completedItems = {};
        saveCompletedItems();
        
        document.querySelectorAll('.complete-checkbox').forEach(checkbox => {
            checkbox.checked = false;
            const contentItem = checkbox.closest('.content-item');
            if (contentItem) {
                contentItem.classList.remove('completed');
            }
        });
        
        updateAllProgress();
        showNotification('সব প্রোগ্রেস রিসেট করা হয়েছে', 'info');
    }
}

// PWA Install Button
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSections();
    
    setupModalListeners();
    
    const resetBtn = document.getElementById('reset-progress');
    if (resetBtn) {
        resetBtn.addEventListener('click', window.resetAllProgress);
    }
    
    if (window.location.search.includes('reset=true')) {
        setTimeout(() => {
            window.resetAllProgress();
        }, 1000);
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
});

// Setup modal listeners
function setupModalListeners() {
    document.getElementById('close-player-btn').addEventListener('click', closeYouTubePlayer);
    document.getElementById('mark-completed-btn').addEventListener('click', markCurrentVideoComplete);
    document.getElementById('watch-on-youtube-btn').addEventListener('click', watchOnYouTube);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('youtube-player-modal').style.display === 'flex') {
            closeYouTubePlayer();
        }
    });
    
    document.getElementById('youtube-player-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('youtube-player-modal')) {
            closeYouTubePlayer();
        }
    });
}

// Floating Reload Button
document.addEventListener('DOMContentLoaded', function() {
    const reloadBtn = document.getElementById('floating-reload-btn');
    
    if (reloadBtn) {
        reloadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            const icon = this.querySelector('i');
            icon.style.animation = 'spin 0.5s ease-in-out';
            
            setTimeout(() => {
                window.location.reload();
            }, 300);
        });
        
        reloadBtn.addEventListener('animationend', function(e) {
            if (e.target.tagName === 'I') {
                e.target.style.animation = '';
            }
        });
    }
});

// Day/Night Mode Toggle
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('theme-toggle');
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
            animation: slideIn 0.3s ease;
        `;
        notification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }
});

// System theme preference
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        if (e.matches) {
            document.body.classList.add('dark-mode');
            document.querySelector('#theme-toggle i').classList.replace('fa-sun', 'fa-moon');
        } else {
            document.body.classList.remove('dark-mode');
            document.querySelector('#theme-toggle i').classList.replace('fa-moon', 'fa-sun');
        }
    }
});