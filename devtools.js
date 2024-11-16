// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
    "Intelligent Paste",
    null,
    "panel.html",
    (panel) => {
        console.log("DevTools panel created");
    }
);

// Create a connection to the background page
const backgroundPageConnection = chrome.runtime.connect({
    name: "devtools-page"
});

// Relay messages from the panel to the background script
backgroundPageConnection.onMessage.addListener((message) => {
    console.log('DevTools received message:', message);
}); 