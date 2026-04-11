// Tab Brain - Options Page

const DEFAULTS = {
  apiEndpoint: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-20250514'
};

const apiKeyInput = document.getElementById('api-key');
const apiEndpointInput = document.getElementById('api-endpoint');
const modelInput = document.getElementById('model');
const form = document.getElementById('options-form');
const statusEl = document.getElementById('status');

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + (isError ? 'error' : 'success');
  statusEl.hidden = false;
  setTimeout(() => { statusEl.hidden = true; }, 3000);
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'model']);
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  apiEndpointInput.value = data.apiEndpoint || DEFAULTS.apiEndpoint;
  modelInput.value = data.model || DEFAULTS.model;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const apiEndpoint = (apiEndpointInput.value.trim() || DEFAULTS.apiEndpoint).replace(/\/+$/, '');
  const model = modelInput.value.trim() || DEFAULTS.model;

  if (!apiKey) {
    showStatus('API Key is required.', true);
    apiKeyInput.focus();
    return;
  }

  if (!isValidUrl(apiEndpoint)) {
    showStatus('Please enter a valid URL for the API endpoint.', true);
    apiEndpointInput.focus();
    return;
  }

  try {
    await chrome.storage.sync.set({ apiKey, apiEndpoint, model });
    showStatus('Settings saved successfully!', false);
  } catch (err) {
    showStatus('Failed to save settings: ' + err.message, true);
  }
});

loadSettings();
