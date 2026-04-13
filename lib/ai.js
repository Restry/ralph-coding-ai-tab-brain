// Tab Brain - AI Client Module

const DEFAULTS = {
  apiEndpoint: 'http://127.0.0.1:4819',
  model: 'claude-sonnet-4.6'
};

const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 10000;

/**
 * Send a message to the Claude API.
 * @param {string} systemPrompt - System prompt for the conversation
 * @param {string} userMessage - User message content
 * @returns {Promise<string>} - Parsed response content text
 */
export async function sendMessage(systemPrompt, userMessage) {
  const data = await chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'model']);

  const apiKey = data.apiKey;
  if (!apiKey) {
    throw new Error('API key is not configured. Please set your API key in the extension options.');
  }

  const endpoint = (data.apiEndpoint || DEFAULTS.apiEndpoint).replace(/\/+$/, '');
  const model = data.model || DEFAULTS.model;
  const url = `${endpoint}/v1/messages`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`API request timed out after ${TIMEOUT_MS / 1000} seconds.`);
    }
    throw new Error(`API request failed: ${err.message}`);
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      // ignore body read failure
    }
    throw new Error(`API returned status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  const content = result.content;
  if (!content || !content.length || !content[0].text) {
    throw new Error('API returned an unexpected response format.');
  }

  return content[0].text;
}
