// Popup script for Match Trigger Extension


let isMonitoring = false;
let currentTab = null;

// DOM elements
let startBtn, stopBtn, statusText, statusDot, lastUpdateText;

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {

    
    // Get DOM elements
    startBtn = document.getElementById('start-btn');
    stopBtn = document.getElementById('stop-btn');
    statusText = document.getElementById('status-text');
    statusDot = document.getElementById('status-dot');
    lastUpdateText = document.getElementById('last-update');
    
    // Add event listeners
    startBtn.addEventListener('click', startMonitoring);
    stopBtn.addEventListener('click', stopMonitoring);
    
    // Get current tab info and load saved state
    getCurrentTab().then(tab => {
        currentTab = tab;
        loadMonitoringState();
    });
    
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener(handleMessage);
});

// Get current active tab
async function getCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    } catch (error) {
        console.error("Error getting current tab:", error);
        return null;
    }
}

// Load monitoring state from storage
async function loadMonitoringState() {
    try {
        const result = await chrome.storage.local.get(['monitoringState', 'lastUpdate']);
        
        if (result.monitoringState && currentTab) {
            const state = result.monitoringState[currentTab.id];
            if (state && state.isActive) {
                isMonitoring = true;
                updateUI('running');
            }
        }
        
        if (result.lastUpdate) {
            updateLastUpdate(result.lastUpdate);
        }
        

    } catch (error) {
        console.error("Error loading state:", error);
    }
}

// Save monitoring state to storage
async function saveMonitoringState() {
    if (!currentTab) return;
    
    try {
        const result = await chrome.storage.local.get(['monitoringState']);
        const monitoringState = result.monitoringState || {};
        
        monitoringState[currentTab.id] = {
            isActive: isMonitoring,
            tabUrl: currentTab.url,
            timestamp: Date.now()
        };
        
        await chrome.storage.local.set({ monitoringState });

    } catch (error) {
        console.error("Error saving state:", error);
    }
}

// Start monitoring function
async function startMonitoring() {

    
    if (!currentTab) {
        showError("No active tab found");
        return;
    }
    
    try {
        // Update UI to searching state
        updateUI('searching');
        
        // Send message to content script to start monitoring
        const response = await chrome.tabs.sendMessage(currentTab.id, {
            type: 'start-monitoring',
            target: 'box_commentaries'
        });
        
        if (response && response.success) {
            isMonitoring = true;
            updateUI('running');
            await saveMonitoringState();
            
            // Try to find box_commentaries immediately
            const findResponse = await chrome.tabs.sendMessage(currentTab.id, {
                type: 'find-box-commentaries'
            });
            
            if (findResponse && findResponse.found) {

                updateLastUpdate("Element found");
            } else {

                updateLastUpdate("Searching...");
            }
        } else {
            showError("Failed to start monitoring");
            updateUI('stopped');
        }
    } catch (error) {
        console.error("Error starting monitoring:", error);
        showError("Content script not found - please reload the page");
        updateUI('stopped');
    }
}

// Stop monitoring function
async function stopMonitoring() {

    
    if (!currentTab) return;
    
    try {
        // Send message to content script to stop monitoring
        await chrome.tabs.sendMessage(currentTab.id, {
            type: 'stop-monitoring'
        });
        
        isMonitoring = false;
        updateUI('stopped');
        await saveMonitoringState();
        updateLastUpdate("Stopped");
        
    } catch (error) {
        console.error("Error stopping monitoring:", error);
        isMonitoring = false;
        updateUI('stopped');
        await saveMonitoringState();
    }
}

// Update UI based on monitoring state
function updateUI(state) {
    switch (state) {
        case 'stopped':
            statusText.textContent = 'Stopped';
            statusDot.className = 'status-dot stopped';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            startBtn.innerHTML = '<span class="btn-icon">▶</span>Start Monitoring';
            break;
            
        case 'searching':
            statusText.textContent = 'Searching...';
            statusDot.className = 'status-dot searching';
            startBtn.disabled = true;
            stopBtn.disabled = false;
            startBtn.innerHTML = '<span class="btn-icon searching-animation">🔄</span>Searching...';
            break;
            
        case 'running':
            statusText.textContent = 'Running';
            statusDot.className = 'status-dot running';
            startBtn.disabled = true;
            stopBtn.disabled = false;
            startBtn.innerHTML = '<span class="btn-icon">▶</span>Start Monitoring';
            break;
    }
}

// Handle messages from content scripts
function handleMessage(message, sender, sendResponse) {

    
    switch (message.type) {
        case 'iframe-change':
            if (message.changeType === 'top-commentary-update') {
                updateLastUpdate(`New: ${message.newCommentary.substring(0, 30)}...`);
            }
            break;
            
        case 'iframe-loaded':
            updateLastUpdate("Page loaded");
            break;
            
        case 'box-commentaries-found':
            updateLastUpdate("Element found");
            if (isMonitoring) {
                updateUI('running');
            }
            break;
            
        case 'monitoring-error':
            showError(message.error);
            if (isMonitoring) {
                updateUI('running'); // Keep running but show error
            }
            break;
    }
}

// Update last update time
function updateLastUpdate(text) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    lastUpdateText.textContent = `${text} (${timeStr})`;
}

// Show error message (simple implementation)
function showError(message) {
    console.error("Popup error:", message);
    // You could implement a toast notification here
    updateLastUpdate(`Error: ${message}`);
}
