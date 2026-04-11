// Tab Brain - Service Worker
// Background script for managing tab grouping and knowledge tracking

import { groupTabs } from './lib/grouper.js';

// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('Tab Brain installed');
});

// Handle messages from side panel and other contexts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'groupNow') {
    handleGroupNow().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'getTabStats') {
    handleGetTabStats().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

/**
 * Handle 'groupNow' action: run tab grouping and return result.
 * @returns {Promise<{groups: Array, totalGrouped: number, skipped: number}>}
 */
async function handleGroupNow() {
  try {
    return await groupTabs();
  } catch (err) {
    console.warn('groupNow failed:', err.message);
    return { error: err.message };
  }
}

/**
 * Handle 'getTabStats' action: return current tab and group counts.
 * @returns {Promise<{tabCount: number, groupCount: number}>}
 */
async function handleGetTabStats() {
  try {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    return { tabCount: tabs.length, groupCount: groups.length };
  } catch (err) {
    console.warn('getTabStats failed:', err.message);
    return { error: err.message };
  }
}
