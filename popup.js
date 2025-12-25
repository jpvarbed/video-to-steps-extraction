// Popup script for Video to Steps Extractor

let selectedType = 'exercise';
let hasVideo = false;
let lastExtractedData = null; // Store raw data for Obsidian save

// DOM elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const errorPanel = document.getElementById('errorPanel');
const extractBtn = document.getElementById('extractBtn');
const resultPanel = document.getElementById('resultPanel');
const resultContent = document.getElementById('resultContent');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const copyBtn = document.getElementById('copyBtn');
const saveObsidianBtn = document.getElementById('saveObsidianBtn');
const saveStatus = document.getElementById('saveStatus');
const topicInput = document.getElementById('topicInput');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  const settings = await chrome.storage.local.get([
    'anthropicKey', 'openaiKey', 'numFrames',
    'obsidianUrl', 'obsidianKey', 'obsidianFolder'
  ]);

  if (settings.anthropicKey) document.getElementById('anthropicKey').value = settings.anthropicKey;
  if (settings.openaiKey) document.getElementById('openaiKey').value = settings.openaiKey;
  if (settings.numFrames) document.getElementById('numFrames').value = settings.numFrames;
  if (settings.obsidianUrl) document.getElementById('obsidianUrl').value = settings.obsidianUrl;
  if (settings.obsidianKey) document.getElementById('obsidianKey').value = settings.obsidianKey;
  if (settings.obsidianFolder) document.getElementById('obsidianFolder').value = settings.obsidianFolder;

  // Check for video on current tab
  checkForVideo();
});

// Type selection buttons
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedType = btn.dataset.type;
  });
});

// Settings toggle
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

// Save settings on change
['anthropicKey', 'openaiKey', 'numFrames', 'obsidianUrl', 'obsidianKey', 'obsidianFolder'].forEach(id => {
  document.getElementById(id).addEventListener('change', saveSettings);
});

async function saveSettings() {
  await chrome.storage.local.set({
    anthropicKey: document.getElementById('anthropicKey').value,
    openaiKey: document.getElementById('openaiKey').value,
    numFrames: parseInt(document.getElementById('numFrames').value) || 8,
    obsidianUrl: document.getElementById('obsidianUrl').value,
    obsidianKey: document.getElementById('obsidianKey').value,
    obsidianFolder: document.getElementById('obsidianFolder').value
  });
}

// Check if current tab has a video
async function checkForVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('instagram.com')) {
      setStatus('no-video', 'Not on Instagram');
      return;
    }

    // Inject content script if needed and check for video
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkForVideo' });

    if (response && response.hasVideo) {
      hasVideo = true;
      const duration = response.duration ? ` (${Math.round(response.duration)}s)` : '';
      setStatus('ready', `Video found${duration}`);
      extractBtn.disabled = false;
    } else {
      setStatus('no-video', 'No video found on this post');
    }
  } catch (error) {
    // Content script might not be loaded yet
    setStatus('no-video', 'Navigate to an Instagram video post');
  }
}

function setStatus(type, text) {
  statusDot.className = 'status-dot ' + type;
  statusText.textContent = text;
}

function showError(message) {
  errorPanel.textContent = message;
  errorPanel.style.display = 'block';
}

function hideError() {
  errorPanel.style.display = 'none';
}

// Extract button handler
extractBtn.addEventListener('click', async () => {
  hideError();
  saveStatus.textContent = '';

  const anthropicKey = document.getElementById('anthropicKey').value;
  if (!anthropicKey) {
    showError('Please enter your Anthropic API key in Settings');
    settingsPanel.classList.add('open');
    return;
  }

  const numFrames = parseInt(document.getElementById('numFrames').value) || 8;

  try {
    extractBtn.disabled = true;
    extractBtn.textContent = 'Extracting...';
    setStatus('processing', 'Extracting frames...');

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Request extraction from content script
    const extractResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractVideo',
      options: { numFrames }
    });

    if (!extractResult.success) {
      throw new Error(extractResult.error || 'Extraction failed');
    }

    setStatus('processing', 'Analyzing with Claude...');

    // Send to background script for API processing
    const analysisResult = await chrome.runtime.sendMessage({
      action: 'analyzeFrames',
      data: {
        frames: extractResult.data.frames,
        metadata: extractResult.data.metadata,
        contentType: selectedType,
        anthropicKey
      }
    });

    if (!analysisResult.success) {
      throw new Error(analysisResult.error || 'Analysis failed');
    }

    // Store raw data for Obsidian save
    lastExtractedData = {
      data: analysisResult.data,
      type: selectedType,
      metadata: extractResult.data.metadata,
      extractedAt: new Date().toISOString()
    };

    // Show results
    setStatus('ready', 'Extraction complete!');
    resultContent.textContent = formatResult(analysisResult.data, selectedType);
    resultPanel.classList.add('show');

  } catch (error) {
    showError(error.message);
    setStatus('no-video', 'Extraction failed');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Steps';
  }
});

// Format result for display (plain text)
function formatResult(data, type) {
  if (typeof data === 'string') {
    return data;
  }

  if (type === 'exercise' && data.exercises) {
    let output = `${data.title || 'Workout'}\n`;
    output += '='.repeat(40) + '\n\n';

    data.exercises.forEach((ex, i) => {
      output += `${i + 1}. ${ex.name}\n`;
      if (ex.sets) output += `   Sets: ${ex.sets}\n`;
      if (ex.reps) output += `   Reps: ${ex.reps}\n`;
      if (ex.duration) output += `   Duration: ${ex.duration}\n`;
      if (ex.rest) output += `   Rest: ${ex.rest}\n`;
      if (ex.notes) output += `   Notes: ${ex.notes}\n`;
      output += '\n';
    });

    if (data.notes) {
      output += `Notes: ${data.notes}\n`;
    }

    return output;
  }

  if (type === 'recipe' && data.ingredients) {
    let output = `${data.title || 'Recipe'}\n`;
    output += '='.repeat(40) + '\n\n';

    output += 'INGREDIENTS:\n';
    data.ingredients.forEach(ing => {
      output += `• ${ing}\n`;
    });
    output += '\n';

    output += 'STEPS:\n';
    data.steps.forEach((step, i) => {
      output += `${i + 1}. ${step}\n`;
    });

    if (data.notes) {
      output += `\nNotes: ${data.notes}\n`;
    }

    return output;
  }

  return JSON.stringify(data, null, 2);
}

// Format for Obsidian markdown
function formatMarkdown(extractedData) {
  const { data, type, metadata, extractedAt } = extractedData;
  const date = new Date(extractedAt).toLocaleDateString();

  let md = '';

  // Frontmatter
  md += '---\n';
  md += `type: ${type}\n`;
  md += `source: instagram\n`;
  md += `extracted: ${extractedAt}\n`;
  if (metadata.url) md += `source_url: ${metadata.url}\n`;
  if (metadata.username) md += `creator: ${metadata.username}\n`;
  md += '---\n\n';

  if (type === 'exercise' && data.exercises) {
    // Exercise format
    md += `# ${data.title || 'Workout'}\n\n`;

    if (metadata.username) {
      md += `> Source: @${metadata.username} on Instagram\n\n`;
    }

    md += '## Exercises\n\n';

    data.exercises.forEach((ex, i) => {
      md += `### ${i + 1}. ${ex.name}\n\n`;

      // Create a details table
      let details = [];
      if (ex.sets) details.push(`**Sets:** ${ex.sets}`);
      if (ex.reps) details.push(`**Reps:** ${ex.reps}`);
      if (ex.duration) details.push(`**Duration:** ${ex.duration}`);
      if (ex.rest) details.push(`**Rest:** ${ex.rest}`);

      if (details.length > 0) {
        md += details.join(' | ') + '\n\n';
      }

      if (ex.notes) {
        md += `> ${ex.notes}\n\n`;
      }
    });

    if (data.notes) {
      md += '## Notes\n\n';
      md += `${data.notes}\n`;
    }
  } else if (type === 'recipe' && data.ingredients) {
    // Recipe format
    md += `# ${data.title || 'Recipe'}\n\n`;

    if (metadata.username) {
      md += `> Source: @${metadata.username} on Instagram\n\n`;
    }

    // Meta info
    let meta = [];
    if (data.servings) meta.push(`**Servings:** ${data.servings}`);
    if (data.prepTime) meta.push(`**Prep:** ${data.prepTime}`);
    if (data.cookTime) meta.push(`**Cook:** ${data.cookTime}`);
    if (meta.length > 0) {
      md += meta.join(' | ') + '\n\n';
    }

    md += '## Ingredients\n\n';
    data.ingredients.forEach(ing => {
      md += `- ${ing}\n`;
    });
    md += '\n';

    md += '## Instructions\n\n';
    data.steps.forEach((step, i) => {
      md += `${i + 1}. ${step}\n`;
    });
    md += '\n';

    if (data.notes) {
      md += '## Notes\n\n';
      md += `${data.notes}\n`;
    }
  } else {
    // Fallback for unknown format
    md += `# Extracted Content\n\n`;
    md += '```json\n';
    md += JSON.stringify(data, null, 2);
    md += '\n```\n';
  }

  return md;
}

// Generate filename from title
function generateFilename(data, type) {
  let title = '';

  if (type === 'exercise' && data.title) {
    title = data.title;
  } else if (type === 'recipe' && data.title) {
    title = data.title;
  } else {
    title = `${type}-${Date.now()}`;
  }

  // Sanitize filename
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

// Save to Obsidian via Local REST API
saveObsidianBtn.addEventListener('click', async () => {
  if (!lastExtractedData) {
    showError('No extracted data to save');
    return;
  }

  const obsidianUrl = document.getElementById('obsidianUrl').value || 'https://127.0.0.1:27124';
  const obsidianKey = document.getElementById('obsidianKey').value;
  const baseFolder = document.getElementById('obsidianFolder').value || 'ai-extractions';
  const topic = topicInput.value.trim();

  if (!obsidianKey) {
    showError('Please enter your Obsidian API key in Settings');
    settingsPanel.classList.add('open');
    return;
  }

  try {
    saveObsidianBtn.disabled = true;
    saveObsidianBtn.textContent = 'Saving...';
    saveStatus.textContent = '';

    // Build the path
    const typeFolder = lastExtractedData.type === 'exercise' ? 'exercises' : 'recipes';
    const filename = generateFilename(lastExtractedData.data, lastExtractedData.type);

    let path = baseFolder;
    if (topic) {
      path += `/${typeFolder}/${topic}`;
    } else {
      path += `/${typeFolder}`;
    }
    path += `/${filename}.md`;

    // Generate markdown content
    const content = formatMarkdown(lastExtractedData);

    // Call Obsidian Local REST API
    const response = await fetch(`${obsidianUrl}/vault/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${obsidianKey}`,
        'Content-Type': 'text/markdown'
      },
      body: content
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Obsidian API error: ${response.status} - ${errorText}`);
    }

    saveStatus.textContent = `Saved to ${path}`;
    saveStatus.style.color = '#4ade80';

  } catch (error) {
    saveStatus.textContent = `Error: ${error.message}`;
    saveStatus.style.color = '#f87171';
  } finally {
    saveObsidianBtn.disabled = false;
    saveObsidianBtn.textContent = 'Save to Obsidian';
  }
});

// Copy button
copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(resultContent.textContent);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => {
    copyBtn.textContent = 'Copy';
  }, 2000);
});
