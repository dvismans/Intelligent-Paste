const logsDiv = document.getElementById('logs');
let port = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Function to format JSON content with syntax highlighting
function formatJSON(text) {
    try {
        // First try to extract JSON from markdown code blocks
        const markdownMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (markdownMatch) {
            try {
                const jsonContent = JSON.parse(markdownMatch[1]);
                return text.replace(
                    /```(?:json)?\n[\s\S]*?\n```/,
                    '\nExtracted JSON:\n' + formatJSONString(jsonContent)
                );
            } catch (jsonError) {
                console.error('Error parsing extracted JSON:', jsonError);
                return text;
            }
        }

        // If no markdown block, try to find regular JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const jsonContent = JSON.parse(jsonMatch[0]);
                const timestamp = text.split(' - ')[0];
                const message = text.split(' - ')[1].split('{')[0];
                return `${timestamp} - ${message}\n${formatJSONString(jsonContent)}`;
            } catch (jsonError) {
                console.error('Error parsing JSON:', jsonError);
                return text;
            }
        }
        return text;
    } catch (e) {
        console.error('Error in formatJSON:', e);
        return text;
    }
}

// Helper function to format JSON string with proper indentation and colors
function formatJSONString(obj, level = 0) {
    const indent = '  '.repeat(level);
    const entries = Object.entries(obj);
    let result = '{\n';

    entries.forEach(([key, value], index) => {
        result += `${indent}  "${key}": `;
        
        if (value === null) {
            result += 'null';
        } else if (typeof value === 'object' && !Array.isArray(value)) {
            result += formatJSONString(value, level + 1);
        } else if (Array.isArray(value)) {
            if (value.length === 0) {
                result += '[]';
            } else {
                result += '[\n';
                value.forEach((item, i) => {
                    if (typeof item === 'object') {
                        result += `${indent}    ${formatJSONString(item, level + 2)}`;
                    } else {
                        result += `${indent}    ${JSON.stringify(item)}`;
                    }
                    if (i < value.length - 1) result += ',';
                    result += '\n';
                });
                result += `${indent}  ]`;
            }
        } else {
            result += JSON.stringify(value);
        }
        
        if (index < entries.length - 1) {
            result += ',';
        }
        result += '\n';
    });

    result += `${indent}}`;
    return result;
}

// Function to add log entry
function addLogEntry(message) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    // Format the log message if it contains JSON
    const formattedMessage = formatJSON(message);
    logEntry.textContent = formattedMessage;
    
    logsDiv.appendChild(logEntry);
    
    // Auto-scroll to bottom
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

// Function to clear logs
function clearLogs() {
    logsDiv.innerHTML = '';
}

// Function to connect to background script
function connectToBackground() {
    if (port) {
        port.disconnect();
    }

    try {
        port = chrome.runtime.connect({ name: 'devtools-page' });
        console.log('Connected to background script');
        reconnectAttempts = 0;

        // Listen for messages from the background script
        port.onMessage.addListener(message => {
            if (message.type === 'log') {
                // Clear logs if this is the first message after a page load
                if (message.data.includes('DevTools connected')) {
                    clearLogs();
                }
                addLogEntry(message.data);
            }
        });

        // Handle disconnection
        port.onDisconnect.addListener(() => {
            console.log('Disconnected from background script');
            port = null;

            // Try to reconnect with exponential backoff
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                reconnectAttempts++;
                console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts})`);
                setTimeout(connectToBackground, delay);
            }
        });

        // Send initial connection message
        port.postMessage({ type: 'init' });
    } catch (error) {
        console.error('Error connecting to background script:', error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(connectToBackground, 1000);
        }
    }
}

// Initial connection
connectToBackground();

// Add window focus handler to reconnect if needed
window.addEventListener('focus', () => {
    if (!port) {
        reconnectAttempts = 0;
        connectToBackground();
    }
});

// Add window visibility handler
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !port) {
        reconnectAttempts = 0;
        connectToBackground();
    }
});

// Add clear button
const clearButton = document.createElement('button');
clearButton.textContent = 'Clear Logs';
clearButton.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 5px 10px;
    background: #333;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
`;
clearButton.onclick = clearLogs;
document.body.appendChild(clearButton); 