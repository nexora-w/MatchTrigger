console.log("iframe-monitor.js loaded in iframe:", window.location.href);

// WebSocket connection for real-time updates
let socket = null;
let previousTopCommentary = ""; // Track the top (first) commentary text to detect changes

// Function to connect to WebSocket server
function connectToSocket() {
  try {
    socket = new WebSocket('ws://localhost:8765');
    
    socket.onopen = function(event) {
      console.log('Connected to commentary server');
    };
    
    socket.onmessage = function(event) {
      const data = JSON.parse(event.data);
      console.log('Received from server:', data);
    };
    
    socket.onerror = function(error) {
      console.warn('WebSocket error:', error);
    };
    
    socket.onclose = function(event) {
      console.log('WebSocket connection closed, attempting to reconnect...');
      // Attempt to reconnect after 5 seconds
      setTimeout(connectToSocket, 5000);
    };
  } catch (error) {
    console.warn('Failed to connect to WebSocket server:', error);
    // Retry connection after 5 seconds
    setTimeout(connectToSocket, 5000);
  }
}

// Function to send commentary update to server
function sendCommentaryUpdate(text) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const message = {
      type: "commentary_update",
      text: text,
      url: window.location.href
    };
    
    socket.send(JSON.stringify(message));
    console.log("=== SENT TO SERVER ===");
    console.log("New commentary:", text);
    console.log("====================");
  } else {
    console.warn("WebSocket not connected, cannot send commentary update");
  }
}

// Polling interval for fallback monitoring
let pollingInterval = null;

// Function to check for top commentary changes (used by both observer and polling)
function checkTopCommentaryChange() {
  const topCommentary = extractTopCommentary();
  
  // Check if the top commentary has changed
  if (topCommentary && topCommentary !== previousTopCommentary) {
    console.log("=== TOP COMMENTARY CHANGED ===");
    console.log("Previous:", previousTopCommentary);
    console.log("New:", topCommentary);
    console.log("=============================");
    
    // Update our tracking variable
    previousTopCommentary = topCommentary;
    
    // Send the new top commentary to socket server
    sendCommentaryUpdate(topCommentary);
    
    // Send data to parent window or extension
    const changeData = {
      type: "iframe-change",
      timestamp: Date.now(),
      url: window.location.href,
      changeType: "top-commentary-update",
      newCommentary: topCommentary,
    };

    // Try to communicate with parent window
    try {
      window.parent.postMessage(changeData, "*");
    } catch (error) {
      console.warn("Could not send message to parent:", error);
    }

    // Try to communicate with extension
    try {
      if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage(changeData);
      }
    } catch (error) {
      console.warn("Could not send message to extension:", error);
    }
    
    return true;
  }
  
  return false;
}

// Function to start polling as fallback
function startPollingFallback() {
  // Clear existing interval if any
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  // Poll every 2 seconds as fallback
  pollingInterval = setInterval(() => {
    const commentariesUl = document.getElementById("box_commentaries");
    
    // Check if ul is visible and monitor for changes
    if (commentariesUl && commentariesUl.offsetParent !== null) {
      // Normal polling for top commentary changes
      checkTopCommentaryChange();
    } else {
      console.log("ul#box_commentaries is not visible - waiting for manual reveal");
    }
  }, 1000);
  
  console.log("Started polling fallback (every 2 seconds) - no auto-reveal");
}

// Function to monitor changes in the iframe
function startIframeMonitoring() {
  // Monitor for DOM changes with enhanced detection
  const observer = new MutationObserver((mutations) => {
    let commentariesChanged = false;
    let debugInfo = [];
    
    mutations.forEach((mutation) => {
      // Enhanced detection for box_commentaries changes
      const isCommentaryRelated = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        
        return element.id === "box_commentaries" ||
               element.matches && element.matches("#box_commentaries, #box_commentaries *, [id*='comment'], [class*='comment']") ||
               element.closest && element.closest("#box_commentaries") ||
               element.querySelector && element.querySelector("#box_commentaries");
      };
      
      // Check target element
      if (isCommentaryRelated(mutation.target)) {
        commentariesChanged = true;
        debugInfo.push(`Target: ${mutation.target.tagName}#${mutation.target.id || 'no-id'}`);
      }
      
      // Check added nodes
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (isCommentaryRelated(node)) {
            commentariesChanged = true;
            debugInfo.push(`Added: ${node.tagName}#${node.id || 'no-id'}`);
          }
        });
      }
      
      // Check removed nodes
      if (mutation.removedNodes.length > 0) {
        mutation.removedNodes.forEach(node => {
          if (isCommentaryRelated(node)) {
            commentariesChanged = true;
            debugInfo.push(`Removed: ${node.tagName}#${node.id || 'no-id'}`);
          }
        });
      }
      
      // Special check for text changes in li elements
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        const liParent = mutation.target.closest && mutation.target.closest('li');
        if (liParent && liParent.closest('#box_commentaries')) {
          commentariesChanged = true;
          debugInfo.push(`Text change in li element`);
        }
      }
    });

    // If commentaries changed, check the top commentary
    if (commentariesChanged) {
      console.log("MutationObserver detected changes:", debugInfo);
      checkTopCommentaryChange();
    }
  });

  // Enhanced observer configuration
  const observerConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true
  };

  // Try to observe the specific ul element if it exists
  const commentariesUl = document.getElementById("box_commentaries");
  if (commentariesUl) {
    observer.observe(commentariesUl, observerConfig);
    console.log("Started observing ul#box_commentaries directly");
  }
  
  // Also observe the entire document as fallback
  observer.observe(document.body || document.documentElement, observerConfig);
  
  // Start polling as additional fallback
  startPollingFallback();

  console.log("Started enhanced iframe monitoring with polling fallback");
  return observer;
}

// Function to extract only the top (first) commentary from ul#box_commentaries
function extractTopCommentary() {
  const commentariesUl = document.getElementById("box_commentaries");
  
  if (commentariesUl) {
    const firstLi = commentariesUl.querySelector("li:first-child");
    if (firstLi) {
      const text = firstLi.innerText.trim();
      return text || null;
    }
  }
  
  return null;
}

// Legacy function for compatibility (if needed elsewhere)
function extractCommentaries() {
  const topCommentary = extractTopCommentary();
  return topCommentary ? [{ index: 0, text: topCommentary }] : [];
}

// Function to collect iframe data
function collectIframeData() {
  return {
    url: window.location.href,
    title: document.title,
    timestamp: Date.now(),
    bodyContent: document.body
      ? document.body.innerText.slice(0, 1000)
      : "",
    elementCount: document.querySelectorAll("*").length,
  };
}

// Function to find element using XPath (for reference only - no auto-click)
function findElementByXPath(xpath) {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const element = result.singleNodeValue;
    
    if (element) {
      console.log("Found element at xpath:", xpath);
      return element;
    } else {
      console.warn("Element not found at xpath:", xpath);
      return null;
    }
  } catch (error) {
    console.error("Error finding element:", error);
    return null;
  }
}

// Function to debug available elements for manual clicking guidance
function debugAvailableElements() {
  console.log("=== MANUAL CLICK GUIDANCE ===");
  console.log("Please manually click on the commentaries tab. Looking for possible targets:");
  
  // Check for the specific xpath element mentioned by user
  const xpathElement = findElementByXPath("/html/body/div[1]/section/aside/div[4]/div/div[2]/nav/ul/li[3]");
  if (xpathElement) {
    console.log("✅ Target element found at /html/body/div[1]/section/aside/div[4]/div/div[2]/nav/ul/li[3]");
    console.log("   This is the element you should click manually");
  }
  
  // Check for nav elements
  const navElements = document.querySelectorAll("nav");
  console.log(`Found ${navElements.length} nav elements`);
  
  // Check for aside elements  
  const asideElements = document.querySelectorAll("aside");
  console.log(`Found ${asideElements.length} aside elements`);
  
  // Check for ul elements in nav/aside
  const navUlElements = document.querySelectorAll("nav ul, aside nav ul");
  console.log(`Found ${navUlElements.length} nav ul elements`);
  
  // Check for li elements with data attributes
  const liDataElements = document.querySelectorAll("li[data-action], li[data-active]");
  console.log(`Found ${liDataElements.length} li elements with data attributes`);
  
  // Check for commentary-related links
  const commentaryLinks = document.querySelectorAll("a[class*='comment'], a[title*='ment'], a[data-translate-title*='comment']");
  console.log(`Found ${commentaryLinks.length} commentary-related links`);
  
  // Log first few elements for inspection
  if (navUlElements.length > 0) {
    console.log("First nav ul structure (potential click targets):");
    const firstUl = navUlElements[0];
    const lis = firstUl.querySelectorAll("li");
    lis.forEach((li, index) => {
      const anchor = li.querySelector("a");
      console.log(`  Li ${index + 1}:`, {
        dataAction: li.getAttribute("data-action"),
        dataActive: li.getAttribute("data-active"),
        className: li.className,
        anchorClass: anchor ? anchor.className : "no anchor",
        anchorTitle: anchor ? anchor.getAttribute("title") : "no title"
      });
    });
  }
  
  console.log("=============================");
}

// Function to wait for ul element to appear (passive monitoring)
function waitForCommentariesUl(callback, maxAttempts = 10, attempt = 1) {
  const commentariesUl = document.getElementById("box_commentaries");
  
  if (commentariesUl && commentariesUl.offsetParent !== null) {
    // Element exists and is visible
    console.log("ul#box_commentaries is now visible");
    callback(true);
    return;
  }
  
  if (attempt >= maxAttempts) {
    console.warn("Max attempts reached waiting for ul#box_commentaries - please manually click the commentaries tab");
    callback(false);
    return;
  }
  
  console.log(`Waiting for ul#box_commentaries... (attempt ${attempt}/${maxAttempts}) - please manually click if needed`);
  setTimeout(() => {
    waitForCommentariesUl(callback, maxAttempts, attempt + 1);
  }, 500);
}

// Function to check if commentaries ul is visible (no auto-click)
function checkCommentariesVisibility(callback) {
  // Check if ul is already visible
  const commentariesUl = document.getElementById("box_commentaries");
  if (commentariesUl && commentariesUl.offsetParent !== null) {
    console.log("ul#box_commentaries is already visible");
    callback(true);
    return;
  }
  
  console.log("ul#box_commentaries is not visible - please manually click the commentaries tab");
  callback(false);
}

// Function to initialize and extract initial commentaries
function initializeCommentariesMonitoring() {
  // Connect to WebSocket server
  connectToSocket();
  
  // Start the mutation observer
  startIframeMonitoring();
  
  // Check if commentaries are visible without auto-clicking
  checkCommentariesVisibility((isVisible) => {
    if (isVisible) {
      console.log("Commentaries ul is already visible");
    } else {
      console.log("Commentaries ul is not visible - waiting for manual click");
    }
    
    // Wait a bit for content to load, then extract top commentary
    setTimeout(() => {
      const initialTopCommentary = extractTopCommentary();
      
      if (initialTopCommentary) {
        console.log("=== INITIAL TOP COMMENTARY ===");
        console.log("Top commentary found:", initialTopCommentary);
        
        // Set initial tracking value
        previousTopCommentary = initialTopCommentary;
        
        console.log("==============================");
        
        // Send initial commentary data
        const initialData = {
          type: "iframe-loaded",
          ...collectIframeData(),
          topCommentary: initialTopCommentary,
        };

        try {
          window.parent.postMessage(initialData, "*");
          if (chrome && chrome.runtime) {
            chrome.runtime.sendMessage(initialData);
          }
        } catch (error) {
          console.warn("Could not send initial data:", error);
        }
      } else {
        console.log("No initial top commentary found, waiting for updates...");
        
        // Send basic initial data
        const initialData = {
          type: "iframe-loaded",
          ...collectIframeData(),
        };

        try {
          window.parent.postMessage(initialData, "*");
          if (chrome && chrome.runtime) {
            chrome.runtime.sendMessage(initialData);
          }
        } catch (error) {
          console.warn("Could not send initial data:", error);
        }
      }
    }, 1500); // Wait 1.5 seconds for content to load
  });
}

// Initialize monitoring when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCommentariesMonitoring);
} else {
  initializeCommentariesMonitoring();
}

