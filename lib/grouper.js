// Tab Brain - Tab Grouping Module

import { sendMessage } from './ai.js';
import { getAllTabs } from './tabs.js';

const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
const DOMAIN_COLORS = ['blue', 'green', 'cyan', 'orange', 'purple', 'pink', 'red', 'yellow'];

// Known second-level domains that form part of the TLD (e.g., co.uk, com.au)
const KNOWN_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);

const SYSTEM_PROMPT = `You are a tab organizer. You receive a list of browser tabs and must group them by semantic topic.

Rules:
- Return ONLY valid JSON, no markdown fences, no explanation
- Group tabs by meaningful semantic topic (e.g., "Social Media", "Development", "Shopping")
- Skip pinned tabs (do not include them in any group)
- Maximum 8 groups
- If there are fewer than 8 non-pinned tabs, use at most ceil(tabCount / 2) groups
- Each group needs: name (short, 1-3 words), color (one of: grey, blue, red, yellow, green, pink, purple, cyan, orange), tabIndices (array of tab index numbers)
- Every non-pinned tab must be assigned to exactly one group

Response format:
{"groups":[{"name":"Group Name","color":"blue","tabIndices":[0,1,2]}]}`;

/**
 * Build the user message for the AI prompt with tab data.
 * @param {Array} tabs - Tab metadata from getAllTabs()
 * @returns {string}
 */
function buildUserMessage(tabs) {
  const tabList = tabs.map(t => ({
    index: t.index,
    title: t.title,
    url: t.url,
    pinned: t.pinned
  }));
  return `Group these tabs:\n${JSON.stringify(tabList)}`;
}

/**
 * Parse and validate the AI response JSON.
 * @param {string} responseText - Raw AI response text
 * @returns {Array<{name: string, color: string, tabIndices: number[]}>}
 */
function parseAIResponse(responseText) {
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${responseText.substring(0, 200)}`);
  }

  if (!parsed.groups || !Array.isArray(parsed.groups)) {
    throw new Error('AI response missing "groups" array.');
  }

  // Validate and sanitize each group
  return parsed.groups.map(g => ({
    name: String(g.name || 'Unnamed'),
    color: VALID_COLORS.includes(g.color) ? g.color : 'grey',
    tabIndices: Array.isArray(g.tabIndices) ? g.tabIndices.map(Number) : []
  }));
}

/**
 * Group tabs using AI analysis via Claude API.
 * @param {Array} tabs - Tab metadata from getAllTabs()
 * @returns {Promise<{groups: Array<{name: string, color: string, tabCount: number}>, totalGrouped: number, skipped: number}>}
 */
export async function groupTabsWithAI(tabs) {
  // Send to AI
  const userMessage = buildUserMessage(tabs);
  const responseText = await sendMessage(SYSTEM_PROMPT, userMessage);
  const aiGroups = parseAIResponse(responseText);

  // Build a map from original index → tabId
  const indexToTabId = new Map();
  for (const tab of tabs) {
    indexToTabId.set(tab.index, tab.tabId);
  }

  // Re-query current tabs to handle tabs that closed/opened during AI call
  const currentTabs = await chrome.tabs.query({});
  const currentTabIds = new Set(currentTabs.map(t => t.id));

  // Track which current tabs get assigned by AI
  const assignedTabIds = new Set();
  let totalGrouped = 0;
  let skipped = 0;
  const summary = [];

  // Apply AI-determined groups
  for (const group of aiGroups) {
    const tabIdsForGroup = [];

    for (const idx of group.tabIndices) {
      const tabId = indexToTabId.get(idx);
      if (tabId == null || !currentTabIds.has(tabId)) {
        skipped++;
        continue;
      }
      tabIdsForGroup.push(tabId);
      assignedTabIds.add(tabId);
    }

    if (tabIdsForGroup.length === 0) continue;

    const groupId = await chrome.tabs.group({ tabIds: tabIdsForGroup });
    await chrome.tabGroups.update(groupId, {
      title: group.name,
      color: group.color
    });

    totalGrouped += tabIdsForGroup.length;
    summary.push({
      name: group.name,
      color: group.color,
      tabCount: tabIdsForGroup.length
    });
  }

  // Assign new (untracked) non-pinned tabs to 'Misc' group
  const unassignedTabIds = currentTabs
    .filter(t => !t.pinned && !assignedTabIds.has(t.id))
    .map(t => t.id);

  if (unassignedTabIds.length > 0) {
    const miscGroupId = await chrome.tabs.group({ tabIds: unassignedTabIds });
    await chrome.tabGroups.update(miscGroupId, {
      title: 'Misc',
      color: 'grey'
    });

    totalGrouped += unassignedTabIds.length;
    summary.push({
      name: 'Misc',
      color: 'grey',
      tabCount: unassignedTabIds.length
    });
  }

  return { groups: summary, totalGrouped, skipped };
}

/**
 * Extract eTLD+1 from a hostname.
 * Handles common multi-part TLDs like co.uk, com.au, etc.
 * @param {string} domain - hostname string
 * @returns {string}
 */
function getETLDPlusOne(domain) {
  if (!domain) return '';
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  // Check for known two-part TLDs (e.g., co.uk, com.au)
  if (parts.length >= 3 && KNOWN_SLDS.has(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Group tabs by eTLD+1 domain (offline fallback).
 * Domains with only 1 tab go into a 'Misc' group.
 * Skips pinned tabs.
 * @param {Array} tabs - Tab metadata from getAllTabs()
 * @returns {Promise<{groups: Array<{name: string, color: string, tabCount: number}>, totalGrouped: number, skipped: number}>}
 */
export async function groupTabsByDomain(tabs) {
  const nonPinned = tabs.filter(t => !t.pinned);
  const pinnedCount = tabs.length - nonPinned.length;

  // Group by eTLD+1 domain
  const domainMap = new Map();
  for (const tab of nonPinned) {
    const etld = getETLDPlusOne(tab.domain) || 'other';
    if (!domainMap.has(etld)) {
      domainMap.set(etld, []);
    }
    domainMap.get(etld).push(tab);
  }

  // Separate multi-tab domains from single-tab domains
  const multiTabDomains = [];
  const singleTabIds = [];

  for (const [domain, domainTabs] of domainMap) {
    if (domainTabs.length > 1) {
      multiTabDomains.push({ domain, tabs: domainTabs });
    } else {
      singleTabIds.push(domainTabs[0].tabId);
    }
  }

  let totalGrouped = 0;
  const summary = [];
  let colorIndex = 0;

  // Apply groups for multi-tab domains
  for (const { domain, tabs: domainTabs } of multiTabDomains) {
    const tabIds = domainTabs.map(t => t.tabId);
    const color = DOMAIN_COLORS[colorIndex % DOMAIN_COLORS.length];
    colorIndex++;

    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, {
      title: domain,
      color: color
    });

    totalGrouped += tabIds.length;
    summary.push({ name: domain, color: color, tabCount: tabIds.length });
  }

  // Single-tab domains go to 'Misc' group (grey)
  if (singleTabIds.length > 0) {
    const miscGroupId = await chrome.tabs.group({ tabIds: singleTabIds });
    await chrome.tabGroups.update(miscGroupId, {
      title: 'Misc',
      color: 'grey'
    });

    totalGrouped += singleTabIds.length;
    summary.push({ name: 'Misc', color: 'grey', tabCount: singleTabIds.length });
  }

  return { groups: summary, totalGrouped, skipped: pinnedCount };
}

/**
 * Main grouping function. Tries AI grouping first, falls back to domain grouping on any error.
 * @returns {Promise<{groups: Array<{name: string, color: string, tabCount: number}>, totalGrouped: number, skipped: number}>}
 */
export async function groupTabs() {
  const tabs = await getAllTabs();

  try {
    return await groupTabsWithAI(tabs);
  } catch (err) {
    console.warn('AI grouping failed, falling back to domain grouping:', err.message);
    return await groupTabsByDomain(tabs);
  }
}
