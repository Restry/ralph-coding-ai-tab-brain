// Tab Brain - Side Panel

const groupNowBtn = document.getElementById('groupNowBtn');
const statusEl = document.getElementById('status');
const tabCountEl = document.getElementById('tabCount');

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
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    groupNowBtn.disabled = false;
    groupNowBtn.textContent = 'Group Now';
  }
}

// Event listeners
groupNowBtn.addEventListener('click', handleGroupNow);

// Initialize on load
refreshTabCount();
