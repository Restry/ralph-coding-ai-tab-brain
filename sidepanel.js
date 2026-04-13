// Tab Brain - Side Panel

const groupNowBtn = document.getElementById('groupNowBtn');
const statusEl = document.getElementById('status');
const tabCountEl = document.getElementById('tabCount');
const groupsListEl = document.getElementById('groupsList');
const staleListEl = document.getElementById('staleList');
const staleCountEl = document.getElementById('staleCount');
const archiveAllBtn = document.getElementById('archiveAllBtn');
const recommendBtn = document.getElementById('recommendBtn');
const kbStatsEl = document.getElementById('kbStats');
const kbSearchInput = document.getElementById('kbSearchInput');
const kbResultsEl = document.getElementById('kbResults');

/** Map Chrome tab group color names to CSS colors. */
const GROUP_COLORS = {
  grey: '#808080',
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc05',
  green: '#34a853',
  pink: '#ff69b4',
  purple: '#a142f4',
  cyan: '#24c1e0',
  orange: '#fa903e'
};

/** Update the tab count display in the header. */
async function refreshTabCount() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabStats' });
    if (response && !response.error) {
      tabCountEl.textContent = `${response.tabCount} tab${response.tabCount !== 1 ? 's' : ''}`;
    }
  } catch (err) {
    console.warn('Failed to get tab stats:', err.message);
  }
}

/** Show a status message with a given type (success, error, loading). */
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
}

/** Clear the status message. */
function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = 'status';
}

/** Handle Group Now button click. */
async function handleGroupNow() {
  groupNowBtn.disabled = true;
  groupNowBtn.textContent = 'Grouping...';
  showStatus('Analyzing tabs...', 'loading');

  try {
    const result = await chrome.runtime.sendMessage({ action: 'groupNow' });

    if (result && result.error) {
      showStatus(`Error: ${result.error}. Try domain-based grouping in Options.`, 'error');
      return;
    }

    if (result && result.groups) {
      const groupNames = result.groups.map(g => g.name).join(', ');
      showStatus(
        `Created ${result.groups.length} group${result.groups.length !== 1 ? 's' : ''} ` +
        `(${result.totalGrouped} tabs): ${groupNames}`,
        'success'
      );
    } else {
      showStatus('Grouping completed.', 'success');
    }

    await refreshTabCount();
    await refreshGroups();
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    groupNowBtn.disabled = false;
    groupNowBtn.textContent = 'Group Now';
  }
}

/** Fetch and render current tab groups in the side panel. */
async function refreshGroups() {
  try {
    const groups = await chrome.tabGroups.query({});
    const allTabs = await chrome.tabs.query({});

    const groupData = [];
    for (const group of groups) {
      const tabs = allTabs.filter(t => t.groupId === group.id);
      groupData.push({
        title: group.title || 'Untitled',
        color: group.color,
        tabs: tabs.map(t => ({
          id: t.id,
          title: t.title || t.url || 'Untitled',
          url: t.url,
          windowId: t.windowId
        }))
      });
    }

    const ungroupedTabs = allTabs
      .filter(t => t.groupId === -1 && !t.pinned)
      .map(t => ({
        id: t.id,
        title: t.title || t.url || 'Untitled',
        url: t.url,
        windowId: t.windowId
      }));

    groupsListEl.innerHTML = '';

    if (groupData.length === 0 && ungroupedTabs.length === 0) {
      groupsListEl.innerHTML = '<p class="empty-state">No tab groups yet. Click "Group Now" to organize your tabs.</p>';
      return;
    }

    for (const group of groupData) {
      groupsListEl.appendChild(renderGroup(group.title, group.color, group.tabs));
    }

    if (ungroupedTabs.length > 0) {
      groupsListEl.appendChild(renderGroup('Ungrouped', 'grey', ungroupedTabs));
    }
  } catch (err) {
    console.warn('Failed to refresh groups:', err.message);
    groupsListEl.innerHTML = '<p class="empty-state">Unable to load tab groups.</p>';
  }
}

/** Render a single group with expandable tab list. */
function renderGroup(title, color, tabs) {
  const groupEl = document.createElement('div');
  groupEl.className = 'group-item';

  const headerEl = document.createElement('div');
  headerEl.className = 'group-header';

  const colorDot = document.createElement('span');
  colorDot.className = 'group-color';
  colorDot.style.background = GROUP_COLORS[color] || GROUP_COLORS.grey;

  const nameEl = document.createElement('span');
  nameEl.className = 'group-name';
  nameEl.textContent = title;

  const countEl = document.createElement('span');
  countEl.className = 'group-tab-count';
  countEl.textContent = tabs.length;

  const chevronEl = document.createElement('span');
  chevronEl.className = 'group-chevron';
  chevronEl.textContent = '\u25B6';

  headerEl.appendChild(colorDot);
  headerEl.appendChild(nameEl);
  headerEl.appendChild(countEl);
  headerEl.appendChild(chevronEl);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'group-tabs collapsed';

  for (const tab of tabs) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab-item';
    tabEl.textContent = tab.title;
    tabEl.title = tab.url;
    tabEl.addEventListener('click', () => activateTab(tab.id, tab.windowId));
    tabsEl.appendChild(tabEl);
  }

  headerEl.addEventListener('click', () => {
    tabsEl.classList.toggle('collapsed');
    chevronEl.textContent = tabsEl.classList.contains('collapsed') ? '\u25B6' : '\u25BC';
  });

  groupEl.appendChild(headerEl);
  groupEl.appendChild(tabsEl);
  return groupEl;
}

/** Activate a tab and focus its window. */
async function activateTab(tabId, windowId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
  } catch (err) {
    console.warn('Failed to activate tab:', err.message);
  }
}

// Event listeners
groupNowBtn.addEventListener('click', handleGroupNow);
archiveAllBtn.addEventListener('click', handleArchiveAll);
recommendBtn.addEventListener('click', handleRecommend);

/** Debounce timer for search input. */
let searchDebounceTimer = null;

/** Handle search input with 300ms debounce. */
kbSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const query = kbSearchInput.value.trim();
    if (query.length === 0) {
      kbResultsEl.innerHTML = '';
      return;
    }
    handleSearch(query);
  }, 300);
});

/** Search the knowledge base and display results. */
async function handleSearch(query) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'searchKnowledge', query });
    if (response && response.error) {
      kbResultsEl.innerHTML = '<p class="empty-state">Search failed.</p>';
      return;
    }

    const results = (response && response.results) || [];
    kbResultsEl.innerHTML = '';

    if (results.length === 0) {
      kbResultsEl.innerHTML = '<p class="empty-state">No results found.</p>';
      return;
    }

    for (const entry of results) {
      kbResultsEl.appendChild(renderSearchResult(entry));
    }
  } catch (err) {
    console.warn('Search failed:', err.message);
    kbResultsEl.innerHTML = '<p class="empty-state">Search failed.</p>';
  }
}

/** Format total focus time in seconds to a human-readable string. */
function formatFocusTime(seconds) {
  if (!seconds || seconds < 60) return '<1m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format a timestamp to a readable date string. */
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

/** Render a single knowledge base search result. */
function renderSearchResult(entry) {
  const itemEl = document.createElement('div');
  itemEl.className = 'kb-result-item';
  itemEl.title = entry.url;
  itemEl.addEventListener('click', () => {
    chrome.tabs.create({ url: entry.url });
  });

  const titleEl = document.createElement('div');
  titleEl.className = 'kb-result-title';
  titleEl.textContent = entry.title || entry.url || 'Untitled';

  const metaEl = document.createElement('div');
  metaEl.className = 'kb-result-meta';

  let metaText = entry.domain || '';
  metaText += ` \u00B7 ${formatDate(entry.lastSeen)}`;
  metaText += ` \u00B7 ${formatFocusTime(entry.totalFocusTime)}`;
  metaEl.textContent = metaText;

  if (entry.archived) {
    const badge = document.createElement('span');
    badge.className = 'kb-archived-badge';
    badge.textContent = 'Archived';
    metaEl.appendChild(badge);
  }

  itemEl.appendChild(titleEl);
  itemEl.appendChild(metaEl);
  return itemEl;
}

/** Fetch and display knowledge base statistics. */
async function refreshKBStats() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getKBStats' });
    if (response && !response.error) {
      kbStatsEl.textContent = `${response.todayCount} tracked today \u00B7 ${response.weekCount} this week`;
    } else {
      kbStatsEl.textContent = '';
    }
  } catch (err) {
    console.warn('Failed to get KB stats:', err.message);
    kbStatsEl.textContent = '';
  }
}

/** Handle Recommend button click: ask AI which tabs to close. */
async function handleRecommend() {
  recommendBtn.disabled = true;
  recommendBtn.textContent = 'Analyzing...';
  staleListEl.innerHTML = '<p class="empty-state">AI is analyzing your tabs...</p>';

  try {
    const result = await chrome.runtime.sendMessage({ action: 'recommendCloseTabs' });

    if (result && result.error) {
      staleListEl.innerHTML = `<p class="empty-state">Error: ${result.error}</p>`;
      return;
    }

    const recommendations = (result && result.recommendations) || [];
    staleListEl.innerHTML = '';

    if (recommendations.length === 0) {
      staleCountEl.textContent = '';
      archiveAllBtn.style.display = 'none';
      staleListEl.innerHTML = '<p class="empty-state">All tabs look useful. Nothing to close!</p>';
      return;
    }

    staleCountEl.textContent = recommendations.length;
    archiveAllBtn.style.display = '';

    for (const rec of recommendations) {
      staleListEl.appendChild(renderRecommendation(rec));
    }
  } catch (err) {
    staleListEl.innerHTML = `<p class="empty-state">Failed: ${err.message}</p>`;
  } finally {
    recommendBtn.disabled = false;
    recommendBtn.textContent = 'Recommend Tabs to Close';
  }
}

/** Render a single recommended tab. */
function renderRecommendation(rec) {
  const itemEl = document.createElement('div');
  itemEl.className = 'stale-item';

  const infoEl = document.createElement('div');
  infoEl.className = 'stale-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'stale-title';
  titleEl.textContent = rec.title;
  titleEl.title = rec.url;

  const metaEl = document.createElement('div');
  metaEl.className = 'stale-meta';
  metaEl.textContent = rec.reason || rec.domain;

  infoEl.appendChild(titleEl);
  infoEl.appendChild(metaEl);

  const archiveBtn = document.createElement('button');
  archiveBtn.className = 'btn-archive';
  archiveBtn.textContent = 'Archive & Close';
  archiveBtn.addEventListener('click', async () => {
    archiveBtn.disabled = true;
    archiveBtn.textContent = 'Closing...';
    try {
      await chrome.runtime.sendMessage({
        action: 'archiveTab',
        tabId: rec.tabId,
        url: rec.url,
        title: rec.title,
        domain: rec.domain,
        favIconUrl: rec.favIconUrl || ''
      });
      itemEl.remove();
      // Update count
      const remaining = staleListEl.querySelectorAll('.stale-item').length;
      staleCountEl.textContent = remaining || '';
      if (remaining === 0) {
        archiveAllBtn.style.display = 'none';
        staleListEl.innerHTML = '<p class="empty-state">All recommended tabs closed!</p>';
      }
      await refreshTabCount();
    } catch (err) {
      archiveBtn.disabled = false;
      archiveBtn.textContent = 'Archive & Close';
    }
  });

  itemEl.appendChild(infoEl);
  itemEl.appendChild(archiveBtn);
  return itemEl;
}

/** Handle Archive & Close All button click. */
async function handleArchiveAll() {
  archiveAllBtn.disabled = true;
  archiveAllBtn.textContent = 'Closing...';
  try {
    const items = staleListEl.querySelectorAll('.stale-item .btn-archive');
    for (const btn of items) {
      btn.click();
    }
  } catch (err) {
    console.warn('Failed to archive all:', err.message);
  } finally {
    archiveAllBtn.disabled = false;
    archiveAllBtn.textContent = 'Archive & Close All';
  }
}

// Initialize on load
refreshTabCount();
refreshGroups();
refreshKBStats();
