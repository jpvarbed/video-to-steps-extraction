// Background script for Video to Steps Extractor
// Handles Claude API calls for vision analysis

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeFrames') {
    analyzeWithClaude(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }

  if (request.action === 'transcribeAudio') {
    transcribeWithWhisper(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function analyzeWithClaude(data) {
  const { frames, metadata, contentType, anthropicKey } = data;

  // Build the prompt based on content type
  const systemPrompt = getSystemPrompt(contentType);
  const userPrompt = getUserPrompt(contentType, metadata);

  // Build content array with images
  const content = [];

  // Add text instruction
  content.push({
    type: 'text',
    text: userPrompt
  });

  // Add frame images
  frames.forEach((frame, index) => {
    // Extract base64 data from data URL
    const base64Data = frame.data.split(',')[1];

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64Data
      }
    });

    content.push({
      type: 'text',
      text: `[Frame ${index + 1} at ${frame.timestamp.toFixed(1)}s]`
    });
  });

  // Call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: content
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const result = await response.json();

  // Extract text content
  const textContent = result.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  // Try to parse as JSON
  try {
    // Look for JSON in the response
    const jsonMatch = textContent.match(/```json\n?([\s\S]*?)\n?```/) ||
                      textContent.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
  } catch (e) {
    // Return as plain text if not valid JSON
  }

  return textContent;
}

function getSystemPrompt(contentType) {
  if (contentType === 'exercise') {
    return `You are an expert fitness coach analyzing workout videos.
Your job is to extract exercise routines from video frames and on-screen text.

Output a JSON object with this structure:
{
  "title": "Workout name if visible",
  "exercises": [
    {
      "name": "Exercise name",
      "sets": "Number of sets if shown",
      "reps": "Reps or rep range",
      "duration": "Time if applicable",
      "rest": "Rest period if shown",
      "notes": "Form cues or tips if visible"
    }
  ],
  "notes": "Any additional workout notes"
}

Focus on:
- Reading on-screen text overlays carefully
- Identifying each distinct exercise
- Noting sets, reps, duration shown
- Capturing any form tips or modifications`;
  }

  if (contentType === 'recipe') {
    return `You are an expert chef analyzing cooking videos.
Your job is to extract recipes from video frames and on-screen text.

Output a JSON object with this structure:
{
  "title": "Recipe name if visible",
  "servings": "Serving size if shown",
  "prepTime": "Prep time if shown",
  "cookTime": "Cook time if shown",
  "ingredients": [
    "Ingredient with quantity"
  ],
  "steps": [
    "Step instruction"
  ],
  "notes": "Any tips or variations"
}

Focus on:
- Reading on-screen text overlays for ingredients and quantities
- Following the cooking steps shown
- Noting temperatures, times, and techniques
- Capturing any tips shown on screen`;
  }

  return 'Analyze the video frames and extract structured information.';
}

function getUserPrompt(contentType, metadata) {
  let prompt = `Analyze these video frames from an Instagram post.\n\n`;

  if (metadata.caption) {
    prompt += `Post caption: "${metadata.caption}"\n\n`;
  }

  if (contentType === 'exercise') {
    prompt += `This is a workout/exercise video. Extract the complete exercise routine including:
- All exercises shown
- Sets, reps, and duration for each
- Rest periods
- Any form tips or modifications

Read all on-screen text carefully as it often contains the exercise details.
Return the result as JSON.`;
  } else if (contentType === 'recipe') {
    prompt += `This is a cooking/recipe video. Extract the complete recipe including:
- All ingredients with quantities
- Step-by-step instructions
- Cooking times and temperatures
- Any tips or variations

Read all on-screen text carefully as it often shows ingredients and steps.
Return the result as JSON.`;
  }

  return prompt;
}

async function transcribeWithWhisper(data) {
  const { audioBlob, openaiKey } = data;

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
  }

  const result = await response.json();
  return result.text;
}

console.log('Video to Steps Extractor: Background script loaded');
