// Tab Brain - Tab Metadata Collection Module

/**
 * Extract domain (hostname) from a URL string.
 * Handles edge cases: chrome:// URLs, data: URLs, empty/invalid URLs.
 * @param {string} url
 * @returns {string} hostname or empty string
 */
function extractDomain(url) {
  if (!url) return '';
  try {
    // data: URLs have no host
    if (url.startsWith('data:')) return '';
    const parsed = new URL(url);
    return parsed.hostname || '';
  } catch {
    return '';
  }
}

/**
 * Get all open tabs across all windows with metadata.
 * @returns {Promise<Array<{index: number, tabId: number, title: string, url: string, domain: string, favIconUrl: string, pinned: boolean, windowId: number}>>}
 */
export async function getAllTabs() {
  const tabs = await chrome.tabs.query({});

  return tabs.map((tab, i) => ({
    index: i,
    tabId: tab.id,
    title: tab.title || '',
    url: tab.url || '',
    domain: extractDomain(tab.url),
    favIconUrl: tab.favIconUrl || '',
    pinned: tab.pinned || false,
    windowId: tab.windowId
  }));
}
