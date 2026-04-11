// Tab Brain - Tab Activity Tracker
// Tracks tab focus events and records activity to IndexedDB

import { getEntry, saveEntry, updateEntry, pruneOldEntries } from './knowledge.js';

const AUTO_PRUNE_MAX_AGE_DAYS = 90;

// Track the currently focused tab so we can compute focus duration on switch
let currentFocus = null; // { tabId, timestamp }

/**
 * Extract domain from a URL string.
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
  try {
    if (!url || url.startsWith('data:')) return '';
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Handle a tab becoming active: record focus duration on the previous tab,
 * then upsert the newly focused tab.
 * @param {Object} activeInfo - {tabId, windowId}
 */
async function onTabActivated(activeInfo) {
  const now = Date.now();

  // Finalize focus time for the previously focused tab
  if (currentFocus) {
    const durationMs = now - currentFocus.timestamp;
    const durationSec = Math.round(durationMs / 1000);

    if (durationSec > 0) {
      try {
        const tab = await chrome.tabs.get(currentFocus.tabId);
        if (tab && tab.url) {
          const existing = await getEntry(tab.url);
          if (existing) {
            await updateEntry(tab.url, {
              lastSeen: now,
              totalFocusTime: (existing.totalFocusTime || 0) + durationSec,
              title: tab.title || existing.title,
              favIconUrl: tab.favIconUrl || existing.favIconUrl
            });
          }
          // If no existing entry, we'll create one below when this tab gets focused
        }
      } catch {
        // Tab may have been closed; ignore
      }
    }
  }

  // Upsert entry for the newly focused tab
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      const url = tab.url;
      const existing = await getEntry(url);

      if (existing) {
        await updateEntry(url, {
          lastSeen: now,
          title: tab.title || existing.title,
          favIconUrl: tab.favIconUrl || existing.favIconUrl
        });
      } else {
        await saveEntry({
          url,
          title: tab.title || '',
          domain: extractDomain(url),
          favIconUrl: tab.favIconUrl || '',
          firstSeen: now,
          lastSeen: now,
          totalFocusTime: 0,
          category: '',
          archived: false
        });
      }
    }
  } catch {
    // Tab may not exist; ignore
  }

  // Update current focus tracking
  currentFocus = { tabId: activeInfo.tabId, timestamp: now };
}

/**
 * Initialize the tracker: prune old entries and set up the onActivated listener.
 */
export async function initTracker() {
  // Auto-prune entries older than 90 days
  try {
    const pruned = await pruneOldEntries(AUTO_PRUNE_MAX_AGE_DAYS);
    if (pruned > 0) {
      console.log(`Tab Brain: pruned ${pruned} entries older than ${AUTO_PRUNE_MAX_AGE_DAYS} days`);
    }
  } catch (err) {
    console.warn('Tab Brain: auto-prune failed:', err.message);
  }

  // Listen for tab focus changes
  chrome.tabs.onActivated.addListener(onTabActivated);

  console.log('Tab Brain: activity tracker initialized');
}
