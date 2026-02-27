// Service worker: toggle sidebar on icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'toggle-sidebar' });
});
