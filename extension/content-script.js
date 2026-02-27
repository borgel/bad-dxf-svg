// Content script: injects sidebar iframe, handles show/hide, bridges messages
// Uses selector registry from glowforge-bridge.js (inlined here since content
// scripts can't use ES module imports).
(function() {
  'use strict';

  // === Glowforge selector registry (from glowforge-bridge.js) ===
  const GF_SELECTORS = {
    fileInput: [
      'input[type="file"][accept*="svg"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ],
    uploadButton: [
      'button[class*="upload"]',
      'button[class*="Upload"]',
      'button[class*="import"]',
      'button[class*="Import"]',
      '[data-testid*="upload"]',
      '[data-testid*="import"]',
      'button[aria-label*="upload"]',
      'button[aria-label*="Upload"]',
    ],
    workspace: [
      '.workspace',
      '[class*="workspace"]',
      '[class*="Workspace"]',
      '#workspace',
      '[class*="canvas"]',
      '[class*="Canvas"]',
      '[class*="design-space"]',
      'main',
    ],
    addDesignButton: [
      'button[class*="add"]',
      'button[class*="Add"]',
      '[data-testid*="add"]',
      'button[aria-label*="Add"]',
      'button[aria-label*="add"]',
    ],
  };

  function findGfElement(category) {
    const selectors = GF_SELECTORS[category];
    if (!selectors) return null;
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function findAllGfElements(category) {
    const selectors = GF_SELECTORS[category];
    if (!selectors) return [];
    const results = [];
    for (const selector of selectors) {
      results.push(...document.querySelectorAll(selector));
    }
    return [...new Set(results)];
  }

  // === Sidebar iframe management ===

  let sidebarFrame = null;
  let sidebarVisible = false;
  const SIDEBAR_WIDTH = 420;

  // Check if Glowforge page is in a usable state
  function isGfReady() {
    // Page must have a body and not be a login/error page
    if (!document.body) return false;
    // Check for common login indicators
    const loginForm = document.querySelector('form[action*="login"], [class*="login"], [class*="Login"]');
    if (loginForm) return false;
    return true;
  }

  function createSidebar() {
    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'dxf-glowforge-sidebar';
    sidebarFrame.src = chrome.runtime.getURL('sidebar/sidebar.html');
    sidebarFrame.allow = 'clipboard-read; clipboard-write';
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

    // Notify sidebar of GF readiness state
    setTimeout(() => {
      if (sidebarFrame && sidebarFrame.contentWindow) {
        sidebarFrame.contentWindow.postMessage({
          source: 'dxf-glowforge-content',
          action: 'gf-status',
          ready: isGfReady(),
          url: window.location.href
        }, '*');
      }
    }, 500);
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

  // === Message handling ===

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle-sidebar') {
      toggleSidebar();
      sendResponse({ visible: sidebarVisible });
    }
  });

  // Listen for messages from sidebar iframe
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'dxf-glowforge-sidebar') return;

    if (event.data.action === 'upload-svg') {
      handleSvgUpload(event.data.svgString, event.data.filename);
    }
  });

  // === Upload injection ===

  function handleSvgUpload(svgString, filename) {
    const result = injectFile(svgString, filename);
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

    // Strategy 1: Find file input via selector registry and set via DataTransfer
    const fileInputs = findAllGfElements('fileInput');
    for (const input of fileInputs) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true, message: 'SVG uploaded to Glowforge!' };
      } catch (e) {
        console.warn('[DXF-GF] File input injection failed:', e);
      }
    }

    // Strategy 2: Simulate drag-and-drop onto workspace
    const workspace = findGfElement('workspace');
    if (workspace) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);

        // Simulate full drag sequence
        workspace.dispatchEvent(new DragEvent('dragenter', {
          bubbles: true, cancelable: true, dataTransfer: dt
        }));
        workspace.dispatchEvent(new DragEvent('dragover', {
          bubbles: true, cancelable: true, dataTransfer: dt
        }));
        workspace.dispatchEvent(new DragEvent('drop', {
          bubbles: true, cancelable: true, dataTransfer: dt
        }));

        return { success: true, message: 'SVG dropped into Glowforge workspace!' };
      } catch (e) {
        console.warn('[DXF-GF] Drag-drop injection failed:', e);
      }
    }

    // Strategy 3: Try clicking the "add design" button to trigger native file dialog
    // (but we can't auto-select the file this way, so this is informational)
    const addBtn = findGfElement('addDesignButton');
    if (addBtn) {
      return {
        success: false,
        message: 'Could not auto-upload. Click the "+" button in Glowforge, then use Download SVG.'
      };
    }

    // Strategy 4: Last resort
    return {
      success: false,
      message: 'Could not find Glowforge upload element. Use Download SVG instead.'
    };
  }
})();
