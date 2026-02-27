// Service worker: toggle sidebar on icon click
// If the content script isn't already injected (e.g. page was loaded before
// extension was installed), inject it on-demand then send the toggle message.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle-sidebar' });
  } catch (e) {
    // Content script not loaded yet — inject it, then toggle
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-script.js']
      });
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle-sidebar' });
    } catch (e2) {
      console.warn('[DXF-GF] Could not inject content script:', e2);
    }
  }
});
