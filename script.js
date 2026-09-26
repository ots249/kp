// API Endpoint (নতুন Google Apps Script URL)
const API_URL = 'https://script.google.com/macros/s/AKfycbwSamBeEh5VSs939teC74Riw6XW0ZHveyTtCNr8itBm7BtwnDeKjChxNG3gnplySwk/exec';

// YouTube API Key
const YOUTUBE_API_KEY = 'AIzaSyD8JqRloRcTNoZuR0tBy14wF7Bs7BxT3t4';

// Complete status tracking
let completedItems = {};

// Cache for video durations
let videoDurationCache = {};

// New items tracking (based on available_from + 24 hours)
let newItems = {};

// বাংলাদেশ সময় ইউটিলিটি ফাংশন - সঠিক ভার্সন
function getBangladeshTime(date = new Date()) {
    return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
}

function getBangladeshNow() {
    const now = new Date();
    const bangladeshNow = getBangladeshTime(now);
    console.log('🕐 বাংলাদেশ এখন:', bangladeshNow.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }));
    return bangladeshNow;
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

// Save new items
function saveNewItems() {
    try {
        localStorage.setItem('newCourseItems', JSON.stringify(newItems));
    } catch (error) {
        console.error('Error saving new items:', error);
    }
}

// Check if item is new (within 24 hours of available_from in Bangladesh time)
function isItemNew(itemKey, availableFrom) {
    if (!availableFrom) return false;
    
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

// ============================================================
// 🔄 নতুন API স্ট্রাকচার (classes) থেকে sections তৈরি করার হেল্পার
// ============================================================
function transformClassesToSections(classes) {
    if (!Array.isArray(classes)) return [];
    
    // subject অনুযায়ী গ্রুপ করুন
    const grouped = {};
    
    classes.forEach((item, index) => {
        const subject = item.subject || `Subject ${index + 1}`;
        if (!grouped[subject]) {
            grouped[subject] = [];
        }
        grouped[subject].push(item);
    });
    
    // প্রতিটি subject-কে একটি section-এ রূপান্তর করুন
    let sectionId = 1;
    const sections = [];
    
    Object.entries(grouped).forEach(([subject, items]) => {
        const contents = items.map((item, idx) => {
            const chapter = item.chapter || '';
            const lecture = item.lecture || (idx + 1);
            
            // টাইটেল তৈরি করুন
            let title = `${subject}`;
            if (chapter) title += ` - Chapter ${chapter}`;
            title += ` - Lecture ${lecture}`;
            
            // ইউনিক ID তৈরি করুন
            const contentId = `${subject}_${chapter}_${lecture}`.replace(/\s+/g, '_');
            
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

// Check for live content and update banner
async function checkLiveContent(sections) {
    const bangladeshNow = getBangladeshNow();
    const bannerImage = document.getElementById('banner-image');
    const liveContainer = document.getElementById('live-video-container');
    const liveFrame = document.getElementById('live-video-frame');
    
    let liveContentFound = false;
    let liveClassDetails = null;
    
    console.log('🕐 পৃষ্ঠা লোডের সময় লাইভ ক্লাস চেক করা হচ্ছে...');
    console.log('📅 বর্তমান বাংলাদেশ সময়:', bangladeshNow.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }));
    
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
                        startTime = new Date(content.resource.resourceable.start_time);
                    }
                    if (content.resource.resourceable.end_time) {
                        endTime = new Date(content.resource.resourceable.end_time);
                    }
                    liveLink = content.resource.resourceable.link || content.link;
                }
                
                if (startTime) {
                    const startTimeBD = getBangladeshTime(startTime);
                    
                    let endTimeBD;
                    if (endTime) {
                        endTimeBD = getBangladeshTime(endTime);
                        if (endTimeBD <= startTimeBD) {
                            endTimeBD = new Date(startTimeBD.getTime() + (2 * 60 * 60 * 1000));
                        }
                    } else {
                        endTimeBD = new Date(startTimeBD.getTime() + (2 * 60 * 60 * 1000));
                    }
                    
                    console.log(`🔍 লাইভ ক্লাস চেক: ${decodeUnicode(section.title)} - ${contentTitle}`, {
                        startBD: startTimeBD.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }),
                        endBD: endTimeBD.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }),
                        nowBD: bangladeshNow.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }),
                        isLive: (bangladeshNow >= startTimeBD && bangladeshNow <= endTimeBD)
                    });
                    
                    if (bangladeshNow >= startTimeBD && bangladeshNow <= endTimeBD) {
                        liveContentFound = true;
                        liveClassDetails = {
                            title: contentTitle,
                            section: decodeUnicode(section.title),
                            start: startTimeBD,
                            end: endTimeBD,
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
        console.log('✅ লাইভ ক্লাস চলছে:', liveClassDetails);
        
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
            Now: ${liveClassDetails.title}
        `;
        
        showNotification(`${liveClassDetails.section}) ${liveClassDetails.title} লাইভ চলছে`, 'info');
        
    } else {
        bannerImage.style.display = 'block';
        liveContainer.style.display = 'none';
        liveFrame.src = '';
        
        const controls = document.querySelector('.live-video-controls');
        if (controls) {
            controls.remove();
        }
        
        console.log('ℹ️ এখন কোন লাইভ ক্লাস চলছে না');
    }
    
    return liveContentFound;
}

// Video aspect ratio toggle
window.toggleVideoAspect = function() {
    const liveFrame = document.getElementById('live-video-frame');
    if (liveFrame) {
        if (liveFrame.style.aspectRatio === '16/9') {
            liveFrame.style.aspectRatio = '4/3';
        } else {
            liveFrame.style.aspectRatio = '16/9';
        }
    }
};

// Load video duration cache from localStorage
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

// Save video duration cache to localStorage
function saveVideoDurationCache() {
    try {
        localStorage.setItem('videoDurationCache', JSON.stringify(videoDurationCache));
    } catch (error) {
        console.error('Error saving video duration cache:', error);
    }
}

// Save completed items to localStorage
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
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Update section progress bar
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

// Update all sections progress
function updateAllProgress() {
    document.querySelectorAll('.section-card').forEach(section => {
        updateSectionProgress(section);
    });
    updateOverallProgress();
}

// Get icon for content and detect types
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
    
    if (linkLower.includes('whatsapp') || titleLower.includes('whatsapp') ||
        titleLower.includes('wa') ||
        titleLower.includes('হোয়াটসঅ্যাপ')) {
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

// Format duration from ISO 8601 to MM:SS or HH:MM:SS
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

// Get video duration from YouTube API
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

// Update all video durations after content is loaded
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

// YouTube Player
window.openYouTubePlayer = function(videoUrl, title) {
    let videoId = extractYouTubeVideoId(videoUrl);
    
    if (videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=1&autoplay=1`;
        
        const playerHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title} - ইউটিউব প্লেয়ার</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Inter', sans-serif; background: #0f0f0f; height: 100vh; overflow: hidden; position: fixed; width: 100%; }
                    .player-container { display: flex; flex-direction: column; height: 100vh; background: #0f0f0f; }
                    .toolbar { background: #1f1f1f; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
                    .toolbar-left { display: flex; align-items: center; gap: 1rem; flex: 1; min-width: 0; }
                    .toolbar-left h3 { color: #fff; font-size: 1.2rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .toolbar-right { display: flex; align-items: center; gap: 1rem; }
                    .btn-watch { background: #ff0000; color: white; padding: 0.6rem 1.5rem; border-radius: 2rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; }
                    .close-btn { background: rgba(51,51,51,0.9); border: 1px solid #444; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-size: 1.2rem; }
                    .video-wrapper { flex: 1; position: relative; background: #000; overflow: hidden; }
                    .video-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; background: #000; }
                    .fullscreen-btn { position: fixed; bottom: 2rem; right: 2rem; background: rgba(0,0,0,0.7); color: white; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 1000; border: 2px solid rgba(255,255,255,0.2); }
                    @media (max-width: 480px) {
                        .toolbar-left h3 { max-width: 120px; font-size: 0.9rem; }
                        .btn-watch span { display: none; }
                    }
                </style>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
            </head>
            <body>
                <div class="player-container">
                    <div class="toolbar">
                        <div class="toolbar-left">
                            <i class="fab fa-youtube" style="color: #ff0000; font-size: 1.5rem;"></i>
                            <h3 title="${title}">${title}</h3>
                        </div>
                        <div class="toolbar-right">
                            <button class="btn-watch" onclick="window.open('${videoUrl}', '_blank')">
                                <i class="fab fa-youtube"></i>
                                <span>ইউটিউবে দেখুন</span>
                            </button>
                            <div class="close-btn" onclick="window.close()" title="বন্ধ করুন">
                                <i class="fas fa-times"></i>
                            </div>
                        </div>
                    </div>
                    <div class="video-wrapper">
                        <iframe class="video-frame" src="${embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen frameborder="0"></iframe>
                    </div>
                    <div class="fullscreen-btn" onclick="toggleFullScreen()" title="ফুলস্ক্রিন">
                        <i class="fas fa-expand"></i>
                    </div>
                </div>
                <script>
                    function toggleFullScreen() {
                        const videoFrame = document.querySelector('.video-frame');
                        if (document.fullscreenElement) {
                            document.exitFullscreen();
                        } else {
                            videoFrame.requestFullscreen();
                        }
                    }
                    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') window.close(); });
                    document.addEventListener('fullscreenchange', function() {
                        const btn = document.querySelector('.fullscreen-btn i');
                        if (btn) {
                            btn.className = document.fullscreenElement ? 'fas fa-compress' : 'fas fa-expand';
                        }
                    });
                <\/script>
            </body>
            </html>
        `;
        
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        let windowFeatures = 'width=1200,height=800,scrollbars=yes,resizable=yes';
        if (isMobile) {
            windowFeatures = 'width=' + window.screen.availWidth + ',height=' + window.screen.availHeight + ',scrollbars=yes,resizable=yes';
        }
        
        const videoWindow = window.open('', '_blank', windowFeatures);
        if (videoWindow) {
            videoWindow.document.write(playerHTML);
            videoWindow.document.close();
        } else {
            window.open(videoUrl, '_blank');
        }
    } else {
        window.open(videoUrl, '_blank');
    }
};

// ============================================================
// Main function to load data
// ============================================================
async function loadSections() {
    loadCompletedItems();
    loadVideoDurationCache();
    loadNewItems();
    
    try {
        console.log('📡 API কল করা হচ্ছে:', API_URL);
        
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        console.log('📦 API ডাটা:', data);
        
        // নতুন API স্ট্রাকচার চেক
        if (!data.success || !data.classes) {
            throw new Error('API রেসপন্স সঠিক ফরম্যাটে নেই');
        }
        
        // কোর্স টাইটেল সেট
        document.getElementById('course-title').textContent = 
            'কারিগরি পাঠশালা কোর্স';
        
        // classes থেকে sections তৈরি
        const sections = transformClassesToSections(data.classes);
        
        // Display sections
        displaySections(sections);
        
        // লাইভ ক্লাস চেক (নতুন API-তে live নেই, তাই কিছুই পাবে না)
        await checkLiveContent(sections);
        
        // Video durations আপডেট
        setTimeout(() => {
            updateAllVideoDurations();
        }, 1000);
        
        // New items expiry চেক
        setInterval(() => {
            loadNewItems();
        }, 60000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        document.getElementById('sections-container').innerHTML = `
            <div class="empty-message" style="padding: 4rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 1.5rem;">ডেটা লোড করতে সমস্যা হচ্ছে।</p>
                <button onclick="location.reload()" style="padding: 0.75rem 2rem; background: #2563eb; color: white; border: none; border-radius: 1rem; cursor: pointer; font-size: 1rem; font-weight: 500;">
                    <i class="fas fa-redo-alt" style="margin-right: 0.5rem;"></i>
                    আবার চেষ্টা করুন
                </button>
            </div>
        `;
    }
}

// Display sections and contents
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
            
            // নতুন API-তে available_from নেই
            const isNew = false;
            
            let clickHandler = '';
            if (isPDF) {
                clickHandler = `openPDFViewer('${contentLink.replace(/'/g, "\\'")}', '${contentTitle.replace(/'/g, "\\'")}')`;
            } else if (isYouTube) {
                clickHandler = `openYouTubePlayer('${contentLink.replace(/'/g, "\\'")}', '${contentTitle.replace(/'/g, "\\'")}')`;
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
                    <span class="content-title" onclick="${clickHandler}">${contentTitle}${isNew ? '<span class="new-badge">নতুন</span>' : ''}</span>
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
                    ${contentsHTML || '<div class="empty-message">এখনও ক্লাস হয়নি 😔</div>'}
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

// Floating Reload Button functionality
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
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }
});

// System theme preference detection
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