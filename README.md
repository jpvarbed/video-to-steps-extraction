# Video to Steps Extractor

Chrome extension that extracts exercise routines and recipes from Instagram videos using Claude Vision AI, with optional Obsidian integration for saving notes.

## Features

- **Frame Extraction**: Captures frames throughout Instagram videos
- **AI Analysis**: Uses Claude Vision to read on-screen text and identify exercises/recipes
- **Structured Output**: Returns organized JSON with sets, reps, durations, ingredients, steps
- **Obsidian Integration**: Save extracted content directly to your Obsidian vault with proper markdown formatting

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the `chrome-extension` folder
5. The extension icon will appear in your toolbar

## Setup

### Required: Anthropic API Key

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Click the extension icon → Settings
3. Enter your Anthropic API key

### Optional: Obsidian Integration

1. Install the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin in Obsidian
2. Enable the plugin and note the API URL (default: `https://127.0.0.1:27124`)
3. Copy the API key from the plugin settings
4. In Chrome, visit `https://127.0.0.1:27124/` and accept the self-signed certificate
5. Enter the URL and API key in the extension settings

## Usage

1. Navigate to an Instagram video post (exercise routine or recipe)
2. Click the extension icon
3. Select content type: **Exercise** or **Recipe**
4. Click **Extract Steps**
5. View the extracted content
6. Optionally add a topic/subfolder and click **Save to Obsidian**

## Output Format

### Exercise

```markdown
---
type: exercise
source: instagram
extracted: 2024-12-25T00:00:00Z
---

# 3-Minute Mobility Routine

## Exercises

### 1. Melasana Squats
**Duration:** 30 seconds

> Deep squat position, focus on hip mobility
```

### Recipe

```markdown
---
type: recipe
source: instagram
extracted: 2024-12-25T00:00:00Z
---

# Protein Pancakes

## Ingredients
- 1 cup oats
- 2 eggs
- 1 scoop protein powder

## Instructions
1. Blend oats into flour
2. Mix all ingredients
3. Cook on medium heat
```

## Folder Structure (Obsidian)

```
ai-extractions/
├── exercises/
│   ├── mobility/
│   │   └── 3-minute-mobility-routine.md
│   └── hiit/
│       └── full-body-workout.md
└── recipes/
    └── breakfast/
        └── protein-pancakes.md
```

## Development

The extension consists of:

- `manifest.json` - Extension configuration
- `popup.html/js` - UI and main logic
- `content.js/css` - Instagram page integration for frame capture
- `background.js` - Claude API calls

## Privacy

- API keys are stored locally in Chrome storage
- No data is sent to any servers except:
  - Anthropic API (for Claude Vision analysis)
  - Your local Obsidian instance (if configured)

## License

MIT
