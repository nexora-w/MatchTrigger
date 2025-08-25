console.log("Content script loaded");

// Function to inject iframe-monitor.js into iframes
function injectIframeMonitor() {
  // Get all iframe elements on the page
  const iframes = document.querySelectorAll("iframe");

  iframes.forEach((iframe, index) => {
    console.log(`Processing iframe ${index + 1}:`, iframe.src);
    
    // Check if this is a cross-origin iframe first
    const isCrossOrigin = iframe.src && !iframe.src.startsWith(window.location.origin);
    
    if (isCrossOrigin) {
      console.log(`Iframe ${index + 1} is cross-origin, using background script injection`);
      // Immediately send to background script for cross-origin iframes
      chrome.runtime.sendMessage({
        action: "injectIntoIframe",
        iframeIndex: index,
        iframeSrc: iframe.src,
      });
    } else {
      // Try direct injection for same-origin iframes
      iframe.addEventListener("load", () => {
        try {
          // Check if iframe is accessible (same-origin)
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

          // Create script element
          const script = iframeDoc.createElement("script");

          // Get the extension URL for iframe-monitor.js
          const scriptUrl = chrome.runtime.getURL("js/iframe-monitor.js");
          script.src = scriptUrl;
          script.type = "text/javascript";

          // Add script to iframe's head or body
          const target = iframeDoc.head || iframeDoc.body || iframeDoc.documentElement;
          if (target) {
            target.appendChild(script);
            console.log(`Injected iframe-monitor.js into same-origin iframe ${index + 1}`);
          }
        } catch (error) {
          console.warn(`Fallback to background injection for iframe ${index + 1}:`, error);
          // Fallback to background script
          chrome.runtime.sendMessage({
            action: "injectIntoIframe",
            iframeIndex: index,
            iframeSrc: iframe.src,
          });
        }
      });

      // If iframe is already loaded
      if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
        iframe.dispatchEvent(new Event("load"));
      }
    }
  });
}

// Function to monitor for new iframes added dynamically
function observeNewIframes() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the added node is an iframe
          if (node.tagName === "IFRAME") {
            console.log("New iframe detected:", node.src);
            injectIntoSingleIframe(node);
          }
          // Check if the added node contains iframes
          const newIframes =
            node.querySelectorAll && node.querySelectorAll("iframe");
          if (newIframes && newIframes.length > 0) {
            console.log(
              `${newIframes.length} new iframes found in added content`
            );
            newIframes.forEach((iframe) => injectIntoSingleIframe(iframe));
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}

// Helper function to inject into a single iframe
function injectIntoSingleIframe(iframe) {
  const isCrossOrigin = iframe.src && !iframe.src.startsWith(window.location.origin);
  
  if (isCrossOrigin) {
    console.log("New cross-origin iframe detected, using background script injection");
    chrome.runtime.sendMessage({
      action: "injectIntoIframe",
      iframeSrc: iframe.src,
    });
  } else {
    iframe.addEventListener("load", () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const script = iframeDoc.createElement("script");
        const scriptUrl = chrome.runtime.getURL("js/iframe-monitor.js");
        script.src = scriptUrl;
        script.type = "text/javascript";

        const target = iframeDoc.head || iframeDoc.body || iframeDoc.documentElement;
        if (target) {
          target.appendChild(script);
          console.log("Injected iframe-monitor.js into new same-origin iframe");
        }
      } catch (error) {
        console.warn("Fallback to background injection for new iframe:", error);
        chrome.runtime.sendMessage({
          action: "injectIntoIframe",
          iframeSrc: iframe.src,
        });
      }
    });

    if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
      iframe.dispatchEvent(new Event("load"));
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectIframeMonitor();
    observeNewIframes();
  });
} else {
  injectIframeMonitor();
  observeNewIframes();
}
