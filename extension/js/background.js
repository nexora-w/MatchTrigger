// Background script for handling cross-origin iframe injection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'injectIntoIframe') {
        const tabId = sender.tab.id;
        const iframeSrc = message.iframeSrc;
        

        
        // Use chrome.scripting API to inject into cross-origin iframe
        if (iframeSrc && iframeSrc.includes('sports.whcdn.net')) {
            // For sports.whcdn.net iframes, we can inject using our web_accessible_resources
            chrome.scripting.executeScript({
                target: { 
                    tabId: tabId,
                    allFrames: true // This will inject into all frames including cross-origin ones
                },
                files: ['js/iframe-monitor.js']
            }).then(() => {

                sendResponse({success: true});
            }).catch((error) => {
                console.error('Failed to inject into cross-origin iframe:', error);
                sendResponse({success: false, reason: error.message});
            });
        } else {
            sendResponse({success: false, reason: 'Iframe not in allowed domains'});
        }
    }
    
    // Handle messages from iframe-monitor.js
    if (message.type === 'iframe-change' || message.type === 'iframe-loaded') {

        // Forward to popup or store in storage if needed
        chrome.storage.local.set({
            latestIframeData: message
        });
    }
    
    return true; // Keep the message channel open for async response
});


