// Content script for Instagram video extraction

class VideoExtractor {
  constructor() {
    this.frames = [];
    this.isExtracting = false;
  }

  // Find the video element on the Instagram post
  findVideoElement() {
    // Instagram uses video elements for posts
    const videos = document.querySelectorAll('video');

    // Find the main post video (usually the largest or most visible)
    let mainVideo = null;
    let maxArea = 0;

    videos.forEach(video => {
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      // Check if video is visible in viewport
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (isVisible && area > maxArea) {
        maxArea = area;
        mainVideo = video;
      }
    });

    return mainVideo;
  }

  // Capture a frame from the video as base64
  captureFrame(video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Return as base64 JPEG (smaller than PNG)
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  // Extract frames at intervals throughout the video
  async extractFrames(video, numFrames = 8) {
    this.frames = [];
    this.isExtracting = true;

    const duration = video.duration;
    if (!duration || duration === Infinity) {
      // If duration unknown, just capture current frame
      this.frames.push({
        timestamp: video.currentTime,
        data: this.captureFrame(video)
      });
      return this.frames;
    }

    // Calculate intervals
    const interval = duration / (numFrames + 1);
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;

    if (wasPlaying) {
      video.pause();
    }

    // Capture frames at each interval
    for (let i = 1; i <= numFrames; i++) {
      const targetTime = interval * i;

      await new Promise((resolve) => {
        video.currentTime = targetTime;
        video.onseeked = () => {
          this.frames.push({
            timestamp: targetTime,
            data: this.captureFrame(video)
          });
          resolve();
        };
      });
    }

    // Restore original state
    video.currentTime = originalTime;
    if (wasPlaying) {
      video.play();
    }

    this.isExtracting = false;
    return this.frames;
  }

  // Try to get the video source URL for audio extraction
  getVideoSourceUrl(video) {
    // Check direct src
    if (video.src) {
      return video.src;
    }

    // Check source elements
    const source = video.querySelector('source');
    if (source && source.src) {
      return source.src;
    }

    // Instagram often uses blob URLs, which we can't directly access
    // but we can try to find the actual URL in the page data
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.video && data.video.contentUrl) {
          return data.video.contentUrl;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    return null;
  }

  // Extract post metadata
  getPostMetadata() {
    const metadata = {
      url: window.location.href,
      caption: '',
      username: ''
    };

    // Try to get caption
    const captionEl = document.querySelector('h1') ||
                      document.querySelector('[class*="Caption"]') ||
                      document.querySelector('article span');
    if (captionEl) {
      metadata.caption = captionEl.textContent.trim();
    }

    // Try to get username
    const usernameEl = document.querySelector('a[href*="/"] span') ||
                       document.querySelector('header a');
    if (usernameEl) {
      metadata.username = usernameEl.textContent.trim();
    }

    return metadata;
  }
}

// Initialize extractor
const extractor = new VideoExtractor();

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractVideo') {
    handleExtraction(request.options || {})
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'checkForVideo') {
    const video = extractor.findVideoElement();
    sendResponse({
      hasVideo: !!video,
      duration: video ? video.duration : 0
    });
    return true;
  }
});

async function handleExtraction(options) {
  const numFrames = options.numFrames || 8;

  // Show extraction overlay
  showExtractionOverlay('Finding video...');

  try {
    const video = extractor.findVideoElement();
    if (!video) {
      throw new Error('No video found on this page');
    }

    // Wait for video to be ready
    if (video.readyState < 2) {
      showExtractionOverlay('Waiting for video to load...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 10000);
        video.onloadeddata = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
    }

    showExtractionOverlay('Extracting frames...');
    const frames = await extractor.extractFrames(video, numFrames);

    showExtractionOverlay('Getting metadata...');
    const metadata = extractor.getPostMetadata();
    const videoUrl = extractor.getVideoSourceUrl(video);

    hideExtractionOverlay();

    return {
      frames,
      metadata,
      videoUrl,
      videoDuration: video.duration
    };
  } catch (error) {
    hideExtractionOverlay();
    throw error;
  }
}

// UI overlay for extraction progress
function showExtractionOverlay(message) {
  let overlay = document.getElementById('video-extractor-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'video-extractor-overlay';
    overlay.innerHTML = `
      <div class="extractor-content">
        <div class="extractor-spinner"></div>
        <div class="extractor-message"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  overlay.querySelector('.extractor-message').textContent = message;
  overlay.style.display = 'flex';
}

function hideExtractionOverlay() {
  const overlay = document.getElementById('video-extractor-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

console.log('Video to Steps Extractor: Content script loaded');
