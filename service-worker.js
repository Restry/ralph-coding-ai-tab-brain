// Tab Brain - Service Worker
// Background script for managing tab grouping and knowledge tracking

import { groupTabs } from './lib/grouper.js';
import { initTracker } from './lib/tracker.js';
import { getEntry, updateEntry, saveEntry, getAllEntries, searchEntries } from './lib/knowledge.js';
import { sendMessage } from './lib/ai.js';
import { getAllTabs } from './lib/tabs.js';

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

  if (message.action === 'getKBStats') {
    handleGetKBStats().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.action === 'searchKnowledge') {
    handleSearchKnowledge(message.query).then(sendResponse).catch(err => {
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

  if (message.action === 'recommendCloseTabs') {
    handleRecommendCloseTabs().then(sendResponse).catch(err => {
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
 * Handle 'getKBStats' action: return knowledge base statistics.
 * Counts entries tracked today and this week.
 */
async function handleGetKBStats() {
  try {
    const entries = await getAllEntries();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayCutoff = startOfToday.getTime();

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekCutoff = startOfWeek.getTime();

    let todayCount = 0;
    let weekCount = 0;
    for (const entry of entries) {
      if (entry.lastSeen && entry.lastSeen >= todayCutoff) todayCount++;
      if (entry.lastSeen && entry.lastSeen >= weekCutoff) weekCount++;
    }

    return { todayCount, weekCount, totalCount: entries.length };
  } catch (err) {
    console.warn('getKBStats failed:', err.message);
    return { error: err.message };
  }
}

/**
 * Handle 'searchKnowledge' action: search IndexedDB entries by query.
 * Returns up to 20 results sorted by most recent first.
 */
async function handleSearchKnowledge(query) {
  try {
    const results = await searchEntries(query);
    return { results: results.slice(0, 20) };
  } catch (err) {
    console.warn('searchKnowledge failed:', err.message);
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

/**
 * Handle 'recommendCloseTabs' action: use AI to analyze all tabs and recommend which to close.
 */
async function handleRecommendCloseTabs() {
  try {
    const tabs = await getAllTabs();
    const nonPinnedTabs = tabs.filter(t => !t.pinned);

    if (nonPinnedTabs.length === 0) {
      return { recommendations: [] };
    }

    const tabListForAI = nonPinnedTabs.map(t => ({
      index: t.index,
      title: t.title,
      url: t.url,
      domain: t.domain
    }));

    const systemPrompt = `You are a browser tab advisor. The user has many open tabs and wants your help deciding which ones to close. Analyze the tab list and recommend tabs that are likely no longer needed.

Recommend closing tabs that are:
- Duplicate or near-duplicate content (same topic from different sources)
- Generic/temporary pages (search results, login pages, error pages, blank tabs)
- Tabs that seem tangential or unrelated to the user's main work clusters
- Old documentation that's likely been read already

Do NOT recommend closing:
- Tabs that seem like active work (GitHub PRs, Jira, active docs)
- Unique reference material the user may need
- Pinned tabs (already filtered out)

For each recommended tab, provide a short reason (under 10 words) explaining why.

Respond as JSON only:
{
  "recommendations": [
    {"index": 0, "reason": "Duplicate React docs"},
    {"index": 5, "reason": "Google search results page"}
  ]
}

If all tabs look useful, return: {"recommendations": []}`;

    const userMessage = `Here are my ${nonPinnedTabs.length} open tabs:\n${JSON.stringify(tabListForAI, null, 2)}`;

    const responseText = await sendMessage(systemPrompt, userMessage);

    // Parse AI response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { recommendations: [], note: 'AI returned no recommendations.' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const aiRecs = parsed.recommendations || [];

    // Map AI indices back to actual tab data
    const recommendations = [];
    for (const rec of aiRecs) {
      const tab = nonPinnedTabs.find(t => t.index === rec.index);
      if (tab) {
        recommendations.push({
          tabId: tab.tabId,
          title: tab.title,
          url: tab.url,
          domain: tab.domain,
          favIconUrl: tab.favIconUrl,
          reason: rec.reason || ''
        });
      }
    }

    return { recommendations };
  } catch (err) {
    console.warn('recommendCloseTabs failed:', err.message);
    return { error: err.message };
  }
}
