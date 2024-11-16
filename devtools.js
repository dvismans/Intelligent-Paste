// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
    "Intelligent Paste",
    null,
    "panel.html",
    function(panel) {
        console.log("DevTools panel created");
    }
);

// Create a connection to the background page
const backgroundPageConnection = chrome.runtime.connect({
    name: "devtools-page"
}); 