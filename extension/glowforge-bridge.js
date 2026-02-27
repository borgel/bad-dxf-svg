// Glowforge DOM selector registry
// Centralized location for all GF DOM selectors.
// When Glowforge updates their UI, only this file needs to change.

export const GF_SELECTORS = {
    // File input elements (primary upload method)
    fileInput: [
        'input[type="file"][accept*="svg"]',
        'input[type="file"][accept*="image"]',
        'input[type="file"]',
    ],

    // Upload/import buttons that may trigger file input
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

    // Workspace area for drag-and-drop fallback
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

    // The "+" or "Add" button that opens the upload dialog
    addDesignButton: [
        'button[class*="add"]',
        'button[class*="Add"]',
        '[data-testid*="add"]',
        'button[aria-label*="Add"]',
        'button[aria-label*="add"]',
    ],
};

/**
 * Find the first matching element for a given selector category.
 * Tries each selector in order until one matches.
 */
export function findGfElement(category) {
    const selectors = GF_SELECTORS[category];
    if (!selectors) return null;

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) return el;
    }
    return null;
}

/**
 * Find all matching elements for a given selector category.
 */
export function findAllGfElements(category) {
    const selectors = GF_SELECTORS[category];
    if (!selectors) return [];

    const results = [];
    for (const selector of selectors) {
        results.push(...document.querySelectorAll(selector));
    }
    return [...new Set(results)];
}
