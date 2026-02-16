// API Endpoint
const API_URL = 'https://api.karigoripathsala.com/api/courses/3rd-semester-full-course-chbite-likha-dipartment-gulor-jnz-1';

// Complete status tracking
let completedItems = {};

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
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'var(--success)' : 'var(--primary)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        animation: slideInRight 0.3s ease;
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
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
    
    // Check for PDF
    if (content.type === 'pdf' || linkLower.includes('.pdf') || titleLower.includes('pdf') || titleLower.includes('পিডিএফ')) {
        return { iconClass: 'fas fa-file-pdf', isPDF: true, isYouTube: false };
    }
    
    // Check for YouTube
    if (content.type === 'video' || 
        linkLower.includes('youtube.com') || 
        linkLower.includes('youtu.be') || 
        titleLower.includes('ভিডিও') || 
        titleLower.includes('video') ||
        titleLower.includes('ইউটিউব') ||
        titleLower.includes('youtube')) {
        return { iconClass: 'fab fa-youtube', isPDF: false, isYouTube: true };
    }
    
    // Check for WhatsApp
    if (linkLower.includes('whatsapp') || titleLower.includes('whatsapp') || titleLower.includes('হোয়াটসঅ্যাপ')) {
        return { iconClass: 'fab fa-whatsapp', isPDF: false, isYouTube: false };
    }
    
    // Default
    return { iconClass: 'fas fa-file-alt', isPDF: false, isYouTube: false };
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
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Inter', sans-serif;
                    background: #f1f5f9;
                    height: 100vh;
                    overflow: hidden;
                }
                
                .pdf-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                
                .toolbar {
                    background: white;
                    padding: 1rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .toolbar-left {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                
                .toolbar-left h3 {
                    color: #1e293b;
                    font-size: 1.2rem;
                    font-weight: 600;
                    max-width: 500px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .btn-download {
                    background: #2563eb;
                    color: white;
                    padding: 0.6rem 1.5rem;
                    border-radius: 0.5rem;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    font-size: 0.95rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.2s ease;
                }
                
                .btn-download:hover {
                    background: #1d4ed8;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
                }
                
                .pdf-frame {
                    flex: 1;
                    width: 100%;
                    border: none;
                    background: #e2e8f0;
                }
                
                .close-btn {
                    position: fixed;
                    top: 1rem;
                    right: 1rem;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    z-index: 1001;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                
                .close-btn:hover {
                    background: #f1f5f9;
                    transform: rotate(90deg);
                }
                
                .close-btn i {
                    font-size: 1.2rem;
                    color: #64748b;
                }
                
                @media (max-width: 768px) {
                    .toolbar {
                        padding: 0.75rem 1rem;
                    }
                    
                    .toolbar-left h3 {
                        font-size: 1rem;
                        max-width: 200px;
                    }
                    
                    .btn-download {
                        padding: 0.5rem 1rem;
                        font-size: 0.85rem;
                    }
                    
                    .close-btn {
                        width: 35px;
                        height: 35px;
                        top: 0.5rem;
                        right: 0.5rem;
                    }
                }
            </style>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        </head>
        <body>
            <div class="pdf-container">
                <div class="toolbar">
                    <div class="toolbar-left">
                        <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                        <h3 title="${title}">${title}</h3>
                    </div>
                    <button class="btn-download" onclick="downloadPDF('${pdfUrl}')">
                        <i class="fas fa-download"></i>
                        ডাউনলোড
                    </button>
                </div>
                
                <iframe 
                    class="pdf-frame" 
                    src="https://docs.google.com/viewer?url=${encodedUrl}&embedded=true"
                    allowfullscreen
                    webkitallowfullscreen
                ></iframe>
                
                <div class="close-btn" onclick="window.close()" title="বন্ধ করুন (Esc)">
                    <i class="fas fa-times"></i>
                </div>
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
                    if (e.key === 'Escape') {
                        window.close();
                    }
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
        showNotification('পপ-আপ ব্লকার সক্রিয় থাকলে PDF ভিউয়ার খোলা যাবে না। সরাসরি খুলছি...', 'info');
        setTimeout(() => {
            window.open(pdfUrl, '_blank');
        }, 1000);
    }
};

// YouTube Player
window.openYouTubePlayer = function(videoUrl, title) {
    // Extract YouTube video ID
    let videoId = '';
    
    if (videoUrl.includes('youtu.be/')) {
        videoId = videoUrl.split('youtu.be/')[1].split('?')[0];
    } else if (videoUrl.includes('youtube.com/watch')) {
        const urlParams = new URLSearchParams(new URL(videoUrl).search);
        videoId = urlParams.get('v');
    } else if (videoUrl.includes('youtube.com/embed/')) {
        videoId = videoUrl.split('embed/')[1].split('?')[0];
    } else if (videoUrl.includes('youtube.com/shorts/')) {
        videoId = videoUrl.split('shorts/')[1].split('?')[0];
    }
    
    // If we found a video ID, open in custom player
    if (videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
        
        const playerHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title} - ইউটিউব প্লেয়ার</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: 'Inter', sans-serif;
                        background: #0f0f0f;
                        height: 100vh;
                        overflow: hidden;
                    }
                    
                    .player-container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        background: #0f0f0f;
                    }
                    
                    .toolbar {
                        background: #1f1f1f;
                        padding: 1rem 2rem;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        border-bottom: 1px solid #333;
                    }
                    
                    .toolbar-left {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                    }
                    
                    .toolbar-left h3 {
                        color: #fff;
                        font-size: 1.2rem;
                        font-weight: 500;
                        max-width: 500px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    
                    .btn-watch {
                        background: #ff0000;
                        color: white;
                        padding: 0.6rem 1.5rem;
                        border-radius: 2rem;
                        font-weight: 500;
                        cursor: pointer;
                        border: none;
                        font-size: 0.95rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        transition: all 0.2s ease;
                    }
                    
                    .btn-watch:hover {
                        background: #cc0000;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(255, 0, 0, 0.3);
                    }
                    
                    .video-frame {
                        flex: 1;
                        width: 100%;
                        border: none;
                        background: #000;
                    }
                    
                    .close-btn {
                        position: fixed;
                        top: 1rem;
                        right: 1rem;
                        background: #333;
                        border: 1px solid #444;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        z-index: 1001;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                    }
                    
                    .close-btn:hover {
                        background: #444;
                        transform: rotate(90deg);
                    }
                    
                    .close-btn i {
                        font-size: 1.2rem;
                        color: #fff;
                    }
                    
                    @media (max-width: 768px) {
                        .toolbar {
                            padding: 0.75rem 1rem;
                        }
                        
                        .toolbar-left h3 {
                            font-size: 1rem;
                            max-width: 200px;
                        }
                        
                        .btn-watch {
                            padding: 0.5rem 1rem;
                            font-size: 0.85rem;
                        }
                        
                        .close-btn {
                            width: 35px;
                            height: 35px;
                            top: 0.5rem;
                            right: 0.5rem;
                        }
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
                        <button class="btn-watch" onclick="window.open('${videoUrl}', '_blank')">
                            <i class="fab fa-youtube"></i>
                            ইউটিউবে দেখুন
                        </button>
                    </div>
                    
                    <iframe 
                        class="video-frame" 
                        src="${embedUrl}"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        webkitallowfullscreen
                        frameborder="0"
                    ></iframe>
                    
                    <div class="close-btn" onclick="window.close()" title="বন্ধ করুন (Esc)">
                        <i class="fas fa-times"></i>
                    </div>
                </div>
                
                <script>
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape') {
                            window.close();
                        }
                    });
                <\/script>
            </body>
            </html>
        `;
        
        const videoWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
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

// Main function to load data
async function loadSections() {
    loadCompletedItems();
    
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        document.getElementById('course-title').textContent = 
            decodeUnicode(data.title) || '৩য় সেমিস্টার ফুল কোর্স';
        
        displaySections(data.sections || []);
        
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('sections-container').innerHTML = `
            <div class="empty-message" style="padding: 4rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--danger); margin-bottom: 1rem;"></i>
                <p style="color: var(--gray-600); font-size: 1.1rem; margin-bottom: 1.5rem;">ডেটা লোড করতে সমস্যা হচ্ছে।</p>
                <button onclick="location.reload()" style="padding: 0.75rem 2rem; background: var(--primary); color: white; border: none; border-radius: var(--radius); cursor: pointer; font-size: 1rem; font-weight: 500; transition: all 0.3s ease;">
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
            
            const itemId = `section_${index}_content_${contentIndex}_${contentTitle.replace(/\s+/g, '_')}`;
            const { iconClass, isPDF, isYouTube } = getIconForContent(content, contentLink, contentTitle);
            
            // Determine click handler based on content type
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
                    <span class="content-title" onclick="${clickHandler}">${contentTitle}</span>
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
                        <span class="content-count">${contentCount}</span>
                    </div>
                </div>
                <div class="contents-list ${index === 0 ? '' : 'hidden'}">
                    ${contentsHTML || '<div class="empty-message">কোনো কন্টেন্ট নেই</div>'}
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
    
    // Reset button
    const resetBtn = document.getElementById('reset-progress');
    if (resetBtn) {
        resetBtn.addEventListener('click', window.resetAllProgress);
    }
    
    // Check for reset parameter in URL
    if (window.location.search.includes('reset=true')) {
        setTimeout(() => {
            window.resetAllProgress();
        }, 1000);
    }
    
    // Add offline detection
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