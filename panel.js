const logsDiv = document.getElementById('logs');

// Create a connection to the background script
const port = chrome.runtime.connect({ name: 'devtools-page' });

// Listen for messages from the background script
port.onMessage.addListener(message => {
    if (message.type === 'log') {
        const logEntry = document.createElement('div');
        logEntry.textContent = message.data;
        logsDiv.appendChild(logEntry);
        
        // Auto-scroll to bottom
        logsDiv.scrollTop = logsDiv.scrollHeight;
    }
}); 