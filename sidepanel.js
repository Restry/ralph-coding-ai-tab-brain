// Tab Brain - Side Panel

const groupNowBtn = document.getElementById('groupNowBtn');
const statusEl = document.getElementById('status');
const tabCountEl = document.getElementById('tabCount');
const groupsListEl = document.getElementById('groupsList');
const staleListEl = document.getElementById('staleList');
const staleCountEl = document.getElementById('staleCount');
const archiveAllBtn = document.getElementById('archiveAllBtn');

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
    await refreshStaleTabs();
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

/** Fetch and render stale tabs. */
async function refreshStaleTabs() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getStaleTabs' });
    if (result && result.error) {
      staleListEl.innerHTML = '<p class="empty-state">Unable to load stale tabs.</p>';
      return;
    }

    const staleTabs = (result && result.staleTabs) || [];
    staleListEl.innerHTML = '';

    if (staleTabs.length === 0) {
      staleCountEl.textContent = '';
      archiveAllBtn.style.display = 'none';
      staleListEl.innerHTML = '<p class="empty-state">No stale tabs found. All tabs are active!</p>';
      return;
    }

    staleCountEl.textContent = staleTabs.length;
    archiveAllBtn.style.display = '';

    for (const tab of staleTabs) {
      staleListEl.appendChild(renderStaleTab(tab));
    }
  } catch (err) {
    console.warn('Failed to refresh stale tabs:', err.message);
    staleListEl.innerHTML = '<p class="empty-state">Unable to load stale tabs.</p>';
  }
}

/** Render a single stale tab item. */
function renderStaleTab(tab) {
  const itemEl = document.createElement('div');
  itemEl.className = 'stale-item';

  const infoEl = document.createElement('div');
  infoEl.className = 'stale-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'stale-title';
  titleEl.textContent = tab.title;
  titleEl.title = tab.url;

  const metaEl = document.createElement('div');
  metaEl.className = 'stale-meta';
  metaEl.textContent = `${tab.domain} \u00B7 ${tab.daysSinceLastFocused} day${tab.daysSinceLastFocused !== 1 ? 's' : ''} ago`;

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
        tabId: tab.tabId,
        url: tab.url,
        title: tab.title,
        domain: tab.domain,
        favIconUrl: tab.favIconUrl
      });
      await refreshStaleTabs();
      await refreshTabCount();
    } catch (err) {
      console.warn('Failed to archive tab:', err.message);
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
    await chrome.runtime.sendMessage({ action: 'archiveAllStaleTabs' });
    await refreshStaleTabs();
    await refreshTabCount();
  } catch (err) {
    console.warn('Failed to archive all stale tabs:', err.message);
  } finally {
    archiveAllBtn.disabled = false;
    archiveAllBtn.textContent = 'Archive & Close All';
  }
}

// Initialize on load
refreshTabCount();
refreshGroups();
refreshStaleTabs();
