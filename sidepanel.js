// Tab Brain - Side Panel

const groupNowBtn = document.getElementById('groupNowBtn');
const statusEl = document.getElementById('status');
const tabCountEl = document.getElementById('tabCount');
const groupsListEl = document.getElementById('groupsList');

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

// Initialize on load
refreshTabCount();
refreshGroups();
