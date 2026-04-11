// Tab Brain - Service Worker
// Background script for managing tab grouping and knowledge tracking

import { groupTabs } from './lib/grouper.js';
import { initTracker } from './lib/tracker.js';
import { getEntry, updateEntry, saveEntry } from './lib/knowledge.js';

// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  initTracker();
  console.log('Tab Brain installed');
});

// Also initialize tracker when service worker activates (e.g., after restart)
chrome.runtime.onStartup.addListener(() => {
  initTracker();
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

  if (message.action === 'getStaleTabs') {
    handleGetStaleTabs().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.action === 'archiveTab') {
    handleArchiveTab(message.tabId, message.url, message.title, message.domain, message.favIconUrl)
      .then(sendResponse)
      .catch(err => {
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.action === 'archiveAllStaleTabs') {
    handleArchiveAllStaleTabs().then(sendResponse).catch(err => {
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

const STALE_THRESHOLD_DAYS = 3;

/**
 * Handle 'getStaleTabs' action: find tabs not focused in 3+ days.
 * Compares tab's lastSeen in IndexedDB with Date.now().
 * Tabs without an IndexedDB entry are treated as non-stale.
 */
async function handleGetStaleTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const cutoff = Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const staleTabs = [];

    for (const tab of tabs) {
      if (tab.pinned || !tab.url) continue;
      try {
        const entry = await getEntry(tab.url);
        if (entry && entry.lastSeen && entry.lastSeen < cutoff) {
          const daysSince = Math.floor((Date.now() - entry.lastSeen) / (24 * 60 * 60 * 1000));
          staleTabs.push({
            tabId: tab.id,
            title: tab.title || tab.url || 'Untitled',
            url: tab.url,
            domain: new URL(tab.url).hostname || tab.url,
            favIconUrl: tab.favIconUrl || '',
            daysSinceLastFocused: daysSince,
            windowId: tab.windowId
          });
        }
      } catch {
        // Skip tabs whose URL can't be looked up
      }
    }

    staleTabs.sort((a, b) => b.daysSinceLastFocused - a.daysSinceLastFocused);
    return { staleTabs };
  } catch (err) {
    console.warn('getStaleTabs failed:', err.message);
    return { error: err.message };
  }
}

/**
 * Handle 'archiveTab' action: save/update entry as archived, then close the tab.
 */
async function handleArchiveTab(tabId, url, title, domain, favIconUrl) {
  try {
    const existing = await getEntry(url);
    if (existing) {
      await updateEntry(url, { archived: true });
    } else {
      await saveEntry({
        url,
        title: title || '',
        domain: domain || '',
        favIconUrl: favIconUrl || '',
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalFocusTime: 0,
        category: '',
        archived: true
      });
    }
    await chrome.tabs.remove(tabId);
    return { success: true };
  } catch (err) {
    console.warn('archiveTab failed:', err.message);
    return { error: err.message };
  }
}

/**
 * Handle 'archiveAllStaleTabs' action: archive and close all stale tabs.
 */
async function handleArchiveAllStaleTabs() {
  try {
    const result = await handleGetStaleTabs();
    if (result.error) return result;
    const staleTabs = result.staleTabs || [];
    let archived = 0;
    for (const tab of staleTabs) {
      const res = await handleArchiveTab(tab.tabId, tab.url, tab.title, tab.domain, tab.favIconUrl);
      if (res.success) archived++;
    }
    return { success: true, archivedCount: archived };
  } catch (err) {
    console.warn('archiveAllStaleTabs failed:', err.message);
    return { error: err.message };
  }
}
