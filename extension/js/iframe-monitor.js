// WebSocket connection for real-time updates
let socket = null;
let previousTopCommentary = ""; // Track top commentary text
let isMonitoringActive = false;
let observer = null;

// Listen for messages from popup/extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    'start-monitoring': () => startMonitoringFromPopup(message.target),
    'stop-monitoring': stopMonitoringFromPopup,
    'find-box-commentaries': () => sendResponse(findBoxCommentaries()),
  };

  if (actions[message.type]) {
    actions[message.type]();
    sendResponse({ success: true });
  } else {
    sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true;
});

// Start Monitoring
function startMonitoringFromPopup(target) {
  if (isMonitoringActive) return;

  isMonitoringActive = true;
  connectToSocket();
  observer = startIframeMonitoring();

  const findResult = findBoxCommentaries();
  if (findResult.found) sendMessageToPopup(findResult);
}

// Stop Monitoring
function stopMonitoringFromPopup() {
  isMonitoringActive = false;
  if (observer) observer.disconnect();
  if (socket) socket.close();
}

// Send message to popup
function sendMessageToPopup(findResult) {
  try {
    chrome.runtime.sendMessage({
      type: 'box-commentaries-found',
      element: findResult.element,
      content: findResult.content,
    });
  } catch (error) {
    console.warn("Could not send found message to popup:", error);
  }
}

// Find Box Commentaries
function findBoxCommentaries() {
  const commentariesUl = document.getElementById("box_commentaries");
  if (commentariesUl) {
    const firstLi = commentariesUl.querySelector("li:first-child");
    return {
      found: true,
      element: "ul#box_commentaries",
      content: firstLi ? firstLi.innerText.trim() : null,
    };
  }
  return runCommentaryDiagnostic();
}

// Run Diagnostic
function runCommentaryDiagnostic() {
  const selectors = ['#box_commentaries', '[class*="comment"]', '[id*="commentary"]'];
  let foundElements = [];

  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      foundElements.push({ selector, textContent: el.textContent.slice(0, 100) });
    });
  });

  return { found: false, diagnostic: foundElements };
}

// Connect to WebSocket
function connectToSocket() {
  if (socket) return;
  socket = new WebSocket('ws://localhost:8765');
  socket.onopen = () => console.log('WebSocket connected');
  socket.onmessage = (event) => console.log('Message from server:', event.data);
  socket.onerror = (error) => console.warn('WebSocket error:', error);
  socket.onclose = () => setTimeout(connectToSocket, 5000);
}

// Monitor DOM changes
function startIframeMonitoring() {
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.target.matches('#box_commentaries'))) {
      checkTopCommentaryChange();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

// Check for top commentary changes
function checkTopCommentaryChange() {
  const topCommentary = extractTopCommentary();
  if (topCommentary !== previousTopCommentary) {
    previousTopCommentary = topCommentary;
    sendCommentaryUpdate(topCommentary);
  }
}

// Extract Top Commentary
function extractTopCommentary() {
  const commentariesUl = document.getElementById("box_commentaries");
  if (commentariesUl) {
    const firstLi = commentariesUl.querySelector("li:first-child");
    return firstLi ? firstLi.innerText.trim() : null;
  }
  return null;
}

// Send Commentary Update
function sendCommentaryUpdate(text) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "commentary_update", text }));
  }
}

// Initialize the Extension
async function initializeExtension() {
  const findResult = findBoxCommentaries();
  if (!findResult.found) {
    const element = await waitForElement('#box_commentaries');
    if (element) {
      sendMessageToPopup({ found: true, element: '#box_commentaries' });
    }
  } else {
    sendMessageToPopup(findResult);
  }
}

// Wait for an element to appear in DOM
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initializeExtension);
