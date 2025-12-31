# Video to Steps Extension

Chrome extension that extracts exercise routines and recipes from Instagram videos/reels using Claude Vision AI.

## Project Overview

**Purpose**: Watch an Instagram fitness video or recipe reel → click extension → get structured text output (exercises with sets/reps/duration, or recipes with ingredients/steps) → optionally save to Obsidian.

**Status**: Working MVP. Handles both `/p/` posts and `/reel/` URLs.

## Architecture

```
video-to-steps-extension/
├── manifest.json      # Chrome extension config (Manifest V3)
├── popup.html/js      # Extension popup UI
├── content.js         # Injected into Instagram pages, captures video frames
├── content.css        # Overlay styling for extraction progress
├── background.js      # Service worker - handles Claude API calls
└── icons/             # Extension icons
```

### Data Flow

1. User navigates to Instagram video/reel
2. User clicks extension → popup.js sends `checkForVideo` message
3. content.js polls for video element (handles dynamic loading)
4. User clicks "Extract" → content.js captures frames via canvas
5. Frames sent to background.js → Claude Vision API
6. Claude analyzes frames, returns structured JSON
7. Optional: Save to Obsidian via Local REST API

## Key Technical Details

### Instagram Video Detection
- Instagram is a React SPA - videos load dynamically
- content.js uses polling (`waitForVideo()`) to wait up to 3-5 seconds for video element
- Checks `videoWidth > 0` to ensure video has actual content
- Finds largest visible video element on page

### Frame Capture
- Uses canvas `drawImage()` to capture video frames
- Seeks through video at intervals to get multiple frames
- Returns base64 JPEG images
- Works with blob URLs (Instagram uses MSE)

### Claude Vision API
- Model: `claude-sonnet-4-20250514`
- Sends frames as base64 images with analysis prompt
- System prompts tuned for exercise vs recipe extraction
- Returns structured JSON

### Obsidian Integration
- Uses [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin
- HTTPS on port 27124 (default)
- Requires API key from plugin settings
- Creates folder structure: `ai-extractions/exercises/` or `ai-extractions/recipes/`

## Configuration (stored in Chrome local storage)

- `anthropicKey` - Required for Claude API
- `openaiKey` - Optional, for Whisper transcription (not fully implemented)
- `numFrames` - Number of frames to capture (default: 8)
- `obsidianUrl` - Default: `https://127.0.0.1:27124`
- `obsidianKey` - Required for Obsidian saves
- `obsidianFolder` - Base folder in vault (default: `ai-extractions`)

## Output Formats

### Exercise JSON
```json
{
  "title": "3-Minute Mobility Routine",
  "exercises": [
    {
      "name": "Melasana Squats",
      "sets": "3",
      "reps": "10",
      "duration": "30 seconds",
      "rest": "30s",
      "notes": "Focus on hip mobility"
    }
  ],
  "notes": "Total workout duration is 3 minutes"
}
```

### Recipe JSON
```json
{
  "title": "Protein Pancakes",
  "servings": "2",
  "prepTime": "5 min",
  "cookTime": "10 min",
  "ingredients": ["1 cup oats", "2 eggs", "1 scoop protein"],
  "steps": ["Blend oats", "Mix ingredients", "Cook on medium"],
  "notes": "Can add berries"
}
```

## Known Issues / Future Work

1. **Audio transcription** - Whisper integration is wired up but not fully working (Instagram blob URLs)
2. **SPA navigation** - May need page refresh when navigating between reels
3. **Rate limiting** - No handling for Claude API rate limits
4. **Error UX** - Could improve error messages

## Development

### Testing locally
1. `chrome://extensions/` → Enable Developer mode
2. Load unpacked → select this folder
3. Navigate to Instagram video/reel
4. Click extension icon

### After changes
- Reload extension in `chrome://extensions/`
- Refresh Instagram page (content script needs re-injection)

## Dependencies

- Chrome Extension Manifest V3
- Anthropic Claude API (Vision)
- Obsidian + Local REST API plugin (optional)

## Server (for mobile/remote use)

The `server/` directory contains a Flask server that can process Instagram URLs without the browser extension.

### Setup
```bash
cd server
cp .env.example .env
# Edit .env with your API keys
./run.sh
```

### Usage
```bash
curl -X POST http://localhost:5555/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://instagram.com/reel/ABC123", "type": "exercise", "topic": "mobility"}'
```

### iOS Shortcut Integration
Create an iOS Shortcut that:
1. Accepts share from Instagram
2. POSTs to `http://YOUR_MAC_IP:5555/extract`
3. Shows result or saves to Obsidian

### How it works
- Uses Playwright (headless Chrome) to load Instagram
- Captures video frames via canvas
- Sends to Claude Vision for analysis
- Returns structured JSON + saves to Obsidian

### Note
Tested and working as of Dec 2024. Instagram may change their anti-bot measures.

## Related Project

This is the "reverse" of `article-to-video` project which converts articles → short videos.
This extension does video → structured text.
