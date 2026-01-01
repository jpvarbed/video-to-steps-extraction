#!/usr/bin/env python3
"""
Video to Steps Server

Accepts Instagram URLs, extracts frames, analyzes with Claude, saves to Obsidian.

Usage:
    python server.py

Endpoints:
    POST /extract - Extract from URL
        Body: {"url": "https://instagram.com/reel/...", "type": "exercise|recipe", "topic": "optional"}

    GET /health - Health check
"""

import os
import asyncio
import base64
import json
import re
from datetime import datetime
from flask import Flask, request, jsonify
from playwright.async_api import async_playwright
import anthropic
import httpx

app = Flask(__name__)

# Configuration - set these as environment variables or update here
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
OBSIDIAN_API_URL = os.environ.get('OBSIDIAN_API_URL') or os.environ.get('OBSIDIAN_API_PORT', 'https://127.0.0.1:27124').rstrip('/')
OBSIDIAN_API_KEY = os.environ.get('OBSIDIAN_API_KEY', '')
OBSIDIAN_FOLDER = os.environ.get('OBSIDIAN_FOLDER', 'ai-extractions')


async def extract_frames(url: str, num_frames: int = 8) -> dict:
    """Load Instagram URL and extract video frames"""

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ]
        )

        context = await browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        page = await context.new_page()

        try:
            await page.goto(url, wait_until='networkidle', timeout=30000)
        except Exception:
            pass  # Continue even if networkidle times out

        # Wait for video to load
        await asyncio.sleep(3)

        # Get video info and frames
        result = await page.evaluate(f'''() => {{
            const video = document.querySelector('video');
            if (!video || video.videoWidth === 0) {{
                return {{ error: 'No video found or video not loaded' }};
            }}

            const duration = video.duration;
            const frames = [];
            const numFrames = {num_frames};

            // For now, just capture current frame
            // Full seeking would require more complex async handling
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            // Capture current frame
            ctx.drawImage(video, 0, 0);
            frames.push({{
                timestamp: video.currentTime,
                data: canvas.toDataURL('image/jpeg', 0.8)
            }});

            return {{
                duration: duration,
                width: video.videoWidth,
                height: video.videoHeight,
                frames: frames
            }};
        }}''')

        # Try to capture more frames by seeking
        if 'error' not in result:
            duration = result['duration']
            if duration and duration > 0:
                interval = duration / (num_frames + 1)
                for i in range(1, num_frames):
                    target_time = interval * i
                    await page.evaluate(f'document.querySelector("video").currentTime = {target_time}')
                    await asyncio.sleep(0.3)  # Wait for seek

                    frame_data = await page.evaluate('''() => {
                        const video = document.querySelector('video');
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        canvas.getContext('2d').drawImage(video, 0, 0);
                        return {
                            timestamp: video.currentTime,
                            data: canvas.toDataURL('image/jpeg', 0.8)
                        };
                    }''')
                    if frame_data:
                        result['frames'].append(frame_data)

        await browser.close()
        return result


def analyze_with_claude(frames: list, content_type: str) -> dict:
    """Send frames to Claude Vision for analysis"""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Build content with images
    content = []

    if content_type == 'auto' or not content_type:
        # Auto-detect content type
        content.append({
            "type": "text",
            "text": """Analyze these video frames from an Instagram video.

First, determine if this is:
- An EXERCISE/FITNESS video (workout, stretching, mobility, etc.)
- A RECIPE/COOKING video (food preparation, cooking, etc.)

Then extract the relevant structured information.

For EXERCISE content, return JSON:
{
  "detected_type": "exercise",
  "title": "Workout name",
  "exercises": [
    {"name": "...", "sets": "...", "reps": "...", "duration": "...", "rest": "...", "notes": "..."}
  ],
  "notes": "Overall notes"
}

For RECIPE content, return JSON:
{
  "detected_type": "recipe",
  "title": "Recipe name",
  "ingredients": ["..."],
  "steps": ["..."],
  "notes": "Tips or variations"
}

Read all on-screen text carefully as it contains important details."""
        })
    elif content_type == 'exercise':
        content.append({
            "type": "text",
            "text": """Analyze these video frames from an Instagram fitness video.
Extract the complete exercise routine including:
- All exercises shown (read the on-screen text carefully)
- Sets, reps, and duration for each
- Rest periods
- Any form tips or modifications

Return as JSON:
{
  "detected_type": "exercise",
  "title": "Workout name",
  "exercises": [
    {"name": "...", "sets": "...", "reps": "...", "duration": "...", "rest": "...", "notes": "..."}
  ],
  "notes": "Overall notes"
}"""
        })
    else:
        content.append({
            "type": "text",
            "text": """Analyze these video frames from an Instagram cooking video.
Extract the complete recipe including:
- All ingredients with quantities
- Step-by-step instructions
- Cooking times and temperatures

Return as JSON:
{
  "detected_type": "recipe",
  "title": "Recipe name",
  "ingredients": ["..."],
  "steps": ["..."],
  "notes": "Tips or variations"
}"""
        })

    # Add frames
    for i, frame in enumerate(frames):
        img_data = frame['data'].split(',')[1] if ',' in frame['data'] else frame['data']
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": img_data
            }
        })
        content.append({
            "type": "text",
            "text": f"[Frame {i+1} at {frame['timestamp']:.1f}s]"
        })

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": content}]
    )

    # Extract JSON from response
    text = response.content[0].text

    # Try to parse JSON
    json_match = re.search(r'```json\s*([\s\S]*?)\s*```', text) or re.search(r'\{[\s\S]*\}', text)
    if json_match:
        json_str = json_match.group(1) if '```' in text else json_match.group(0)
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

    return {"raw_response": text}


def format_markdown(data: dict, content_type: str, url: str) -> str:
    """Format extracted data as Obsidian markdown"""
    # Use detected_type if available
    if 'detected_type' in data:
        content_type = data['detected_type']

    now = datetime.now().isoformat()

    md = f"""---
type: {content_type}
source: instagram
source_url: {url}
extracted: {now}
---

"""

    if content_type == 'exercise' and 'exercises' in data:
        md += f"# {data.get('title', 'Workout')}\n\n"
        md += "## Exercises\n\n"

        for i, ex in enumerate(data['exercises'], 1):
            md += f"### {i}. {ex.get('name', 'Exercise')}\n\n"
            details = []
            if ex.get('sets'):
                details.append(f"**Sets:** {ex['sets']}")
            if ex.get('reps'):
                details.append(f"**Reps:** {ex['reps']}")
            if ex.get('duration'):
                details.append(f"**Duration:** {ex['duration']}")
            if ex.get('rest'):
                details.append(f"**Rest:** {ex['rest']}")
            if details:
                md += " | ".join(details) + "\n\n"
            if ex.get('notes'):
                md += f"> {ex['notes']}\n\n"

        if data.get('notes'):
            md += f"## Notes\n\n{data['notes']}\n"

    elif content_type == 'recipe' and 'ingredients' in data:
        md += f"# {data.get('title', 'Recipe')}\n\n"
        md += "## Ingredients\n\n"
        for ing in data['ingredients']:
            md += f"- {ing}\n"
        md += "\n## Instructions\n\n"
        for i, step in enumerate(data.get('steps', []), 1):
            md += f"{i}. {step}\n"
        if data.get('notes'):
            md += f"\n## Notes\n\n{data['notes']}\n"

    else:
        md += f"# Extracted Content\n\n```json\n{json.dumps(data, indent=2)}\n```\n"

    return md


def save_to_obsidian(markdown: str, data: dict, content_type: str, topic: str = None) -> str:
    """Save markdown to Obsidian via Local REST API"""

    if not OBSIDIAN_API_KEY:
        return None

    # Use detected_type if available
    if 'detected_type' in data:
        content_type = data['detected_type']

    # Generate filename
    title = data.get('title', f'{content_type}-{int(datetime.now().timestamp())}')
    filename = re.sub(r'[^a-z0-9\s-]', '', title.lower())
    filename = re.sub(r'\s+', '-', filename)[:50]

    # Build path
    type_folder = 'exercises' if content_type == 'exercise' else 'recipes'
    if topic:
        path = f"{OBSIDIAN_FOLDER}/{type_folder}/{topic}/{filename}.md"
    else:
        path = f"{OBSIDIAN_FOLDER}/{type_folder}/{filename}.md"

    # Save via API (skip SSL verification for self-signed cert)
    try:
        response = httpx.put(
            f"{OBSIDIAN_API_URL}/vault/{path}",
            headers={
                'Authorization': f'Bearer {OBSIDIAN_API_KEY}',
                'Content-Type': 'text/markdown'
            },
            content=markdown,
            verify=False,
            timeout=10
        )
        if response.status_code in (200, 204):
            return path
    except Exception as e:
        print(f"Obsidian save error: {e}")

    return None


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


@app.route('/extract', methods=['POST'])
def extract():
    """Main extraction endpoint"""

    data = request.json or {}
    url = data.get('url', '')
    content_type = data.get('type', 'auto')  # Default to auto-detect
    topic = data.get('topic', '')

    if not url:
        return jsonify({"error": "URL required"}), 400

    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not configured"}), 500

    try:
        # Extract frames
        print(f"Extracting from: {url}")
        frames_result = asyncio.run(extract_frames(url))

        if 'error' in frames_result:
            return jsonify({"error": frames_result['error']}), 400

        print(f"Got {len(frames_result['frames'])} frames")

        # Analyze with Claude
        print("Analyzing with Claude...")
        analysis = analyze_with_claude(frames_result['frames'], content_type)
        print(f"Analysis complete: {analysis.get('title', 'Unknown')}")

        # Format as markdown
        markdown = format_markdown(analysis, content_type, url)

        # Save to Obsidian
        saved_path = None
        if OBSIDIAN_API_KEY:
            saved_path = save_to_obsidian(markdown, analysis, content_type, topic)
            if saved_path:
                print(f"Saved to Obsidian: {saved_path}")

        return jsonify({
            "success": True,
            "data": analysis,
            "markdown": markdown,
            "obsidian_path": saved_path
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("Video to Steps Server")
    print("=" * 40)
    print(f"Anthropic API: {'✓' if ANTHROPIC_API_KEY else '✗ Set ANTHROPIC_API_KEY'}")
    print(f"Obsidian API:  {'✓' if OBSIDIAN_API_KEY else '✗ Optional - Set OBSIDIAN_API_KEY'}")
    print()
    print("POST /extract - Extract from Instagram URL")
    print("GET  /health  - Health check")
    print()
    app.run(host='0.0.0.0', port=5555, debug=True)
