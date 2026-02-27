// Content script: injects sidebar iframe, handles show/hide, bridges messages
(function() {
  'use strict';

  let sidebarFrame = null;
  let sidebarVisible = false;
  const SIDEBAR_WIDTH = 420;

  function createSidebar() {
    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'dxf-glowforge-sidebar';
    sidebarFrame.src = chrome.runtime.getURL('sidebar/sidebar.html');
    Object.assign(sidebarFrame.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: SIDEBAR_WIDTH + 'px',
      height: '100vh',
      border: 'none',
      zIndex: '2147483647',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.3)',
      transition: 'transform 0.2s ease',
      transform: 'translateX(100%)',
      background: '#fff'
    });
    document.body.appendChild(sidebarFrame);
  }

  function showSidebar() {
    if (!sidebarFrame) createSidebar();
    sidebarFrame.style.transform = 'translateX(0)';
    sidebarVisible = true;
  }

  function hideSidebar() {
    if (sidebarFrame) {
      sidebarFrame.style.transform = 'translateX(100%)';
    }
    sidebarVisible = false;
  }

  function toggleSidebar() {
    if (sidebarVisible) {
      hideSidebar();
    } else {
      showSidebar();
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle-sidebar') {
      toggleSidebar();
      sendResponse({ visible: sidebarVisible });
    }
  });

  // Listen for messages from sidebar iframe
  window.addEventListener('message', (event) => {
    // Only accept messages from our extension iframe
    if (!event.data || event.data.source !== 'dxf-glowforge-sidebar') return;

    if (event.data.action === 'upload-svg') {
      handleSvgUpload(event.data.svgString, event.data.filename);
    }
  });

  function handleSvgUpload(svgString, filename) {
    // Try to inject into Glowforge's file input
    const result = injectFile(svgString, filename);
    // Send result back to sidebar
    if (sidebarFrame && sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage({
        source: 'dxf-glowforge-content',
        action: 'upload-result',
        success: result.success,
        message: result.message
      }, '*');
    }
  }

  function injectFile(svgString, filename) {
    const file = new File([svgString], filename || 'design.svg', { type: 'image/svg+xml' });

    // Strategy 1: Find file input and set via DataTransfer
    const fileInputs = document.querySelectorAll('input[type="file"]');
    for (const input of fileInputs) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, message: 'SVG uploaded to Glowforge' };
      } catch (e) {
        // Continue to next strategy
      }
    }

    // Strategy 2: Simulate drag-and-drop
    try {
      const workspace = document.querySelector('.workspace, [class*="workspace"], [class*="Workspace"], #workspace');
      if (workspace) {
        const dt = new DataTransfer();
        dt.items.add(file);
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        workspace.dispatchEvent(dropEvent);
        return { success: true, message: 'SVG dropped into Glowforge workspace' };
      }
    } catch (e) {
      // Continue to fallback
    }

    // Strategy 3: Fallback - offer download
    return { success: false, message: 'Could not find Glowforge upload element. Use Download SVG instead.' };
  }
})();
