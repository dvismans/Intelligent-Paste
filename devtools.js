// Create a panel in Chrome DevTools
let panel = null;
let panelWindow = null;
let backgroundPageConnection = null;

chrome.devtools.panels.create(
    "Intelligent Paste",
    null,
    "panel.html",
    (createdPanel) => {
        panel = createdPanel;
        console.log("DevTools panel created");
        
        // Create connection when panel is shown
        panel.onShown.addListener((window) => {
            console.log("Panel shown");
            panelWindow = window;
            ensureConnection();
        });

        // Handle panel hide
        panel.onHidden.addListener(() => {
            console.log("Panel hidden");
            panelWindow = null;
        });
    }
);

function ensureConnection() {
    if (backgroundPageConnection) {
        try {
            backgroundPageConnection.disconnect();
        } catch (e) {
            console.log('Error disconnecting:', e);
        }
        backgroundPageConnection = null;
    }

    try {
        // Create a connection to the background page
        backgroundPageConnection = chrome.runtime.connect({
            name: "devtools-page"
        });

        console.log('Created new connection to background page');

        // Listen for messages from the background page
        backgroundPageConnection.onMessage.addListener((message) => {
            if (panelWindow && message.type === 'log') {
                // Forward the log to the panel window
                panelWindow.addLogEntry(message.data);
            }
        });

        // Handle disconnection
        backgroundPageConnection.onDisconnect.addListener(() => {
            console.log('Connection to background page lost');
            backgroundPageConnection = null;
            // Try to reconnect after a short delay
            setTimeout(ensureConnection, 1000);
        });

        // Send initial connection message with tab ID
        backgroundPageConnection.postMessage({
            name: 'init',
            tabId: chrome.devtools.inspectedWindow.tabId
        });

        // Clear logs in panel when creating new connection
        if (panelWindow && panelWindow.clearLogs) {
            panelWindow.clearLogs();
        }

    } catch (error) {
        console.error('Error creating connection:', error);
        backgroundPageConnection = null;
        // Try to reconnect after a short delay
        setTimeout(ensureConnection, 1000);
    }
}

// Listen for inspected window reload
chrome.devtools.network.onNavigated.addListener(() => {
    console.log('Page reloaded');
    if (panelWindow && panelWindow.clearLogs) {
        panelWindow.clearLogs();
    }
    ensureConnection();
});
  
  