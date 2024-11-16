// Custom logging function
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = data ? 
        `${message}: ${JSON.stringify(data, null, 2)}` : 
        message;

    // Log to background console
    console.log(logMessage);

    // Broadcast to all connections
    connections.forEach(port => {
        port.postMessage({
            type: 'log',
            data: `${timestamp} - ${logMessage}`
        });
    });
}

// Store connections from DevTools
const connections = new Set();

// Listen for connections from DevTools
chrome.runtime.onConnect.addListener(port => {
    if (port.name === "devtools-page") {
        // Add the connection
        connections.add(port);
        debugLog('DevTools connected');

        // Remove the connection when DevTools is closed
        port.onDisconnect.addListener(() => {
            connections.delete(port);
            debugLog('DevTools disconnected');
        });
    }
});

// Remove the hardcoded API key
let OPENAI_API_KEY = '';

// Load API key when background script starts
chrome.storage.sync.get(['openaiApiKey'], (result) => {
    if (result.openaiApiKey) {
        OPENAI_API_KEY = result.openaiApiKey;
        debugLog('Loaded API key from storage');
    }
});

// Listen for API key updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'apiKeyUpdated') {
        debugLog('Updating API key...');
        OPENAI_API_KEY = request.apiKey;
        validateApiKey(request.apiKey)
            .then(result => {
                debugLog('API key validation result:', result);
                if (result.isValid) {
                    sendResponse({ success: true });
                } else {
                    sendResponse({ error: result.error });
                }
            });
        return true;
    }

    if (request.action === 'intelligentPaste') {
        if (!OPENAI_API_KEY) {
            sendResponse({ error: 'Please set your OpenAI API key in the extension popup' });
            return true;
        }

        debugLog('Received intelligent paste request:', {
            hasText: !!request.clipboardText,
            hasImage: !!request.imageBase64,
            formFields: request.formFields
        });
        
        handleIntelligentPaste(request.clipboardText, request.formFields, request.imageBase64)
            .then(mappings => {
                debugLog('Successfully processed mappings:', mappings);
                sendResponse({ mappings });
            })
            .catch(error => {
                debugLog('Error in handleIntelligentPaste:', error);
                sendResponse({ error: error.message });
            });
        
        return true;
    }

    if (request.action === 'debugLog') {
        debugLog(request.message);
        return;
    }

    if (request.action === 'captureVisibleTab') {
        debugLog('Attempting to capture screenshot');
        try {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (!tabs[0]) {
                    debugLog('No active tab found');
                    sendResponse({ error: 'No active tab' });
                    return;
                }
                
                chrome.tabs.captureVisibleTab(
                    tabs[0].windowId,
                    { format: 'png' },
                    (dataUrl) => {
                        if (chrome.runtime.lastError) {
                            debugLog('Screenshot capture error:', chrome.runtime.lastError);
                            sendResponse({ error: chrome.runtime.lastError.message });
                            return;
                        }
                        
                        if (!dataUrl) {
                            debugLog('No screenshot data received');
                            sendResponse({ error: 'Failed to capture screenshot' });
                            return;
                        }

                        // Remove the data:image/png;base64, prefix
                        const imageData = dataUrl.split(',')[1];
                        debugLog('Screenshot captured successfully');
                        sendResponse({ imageData });
                    }
                );
            });
        } catch (error) {
            debugLog('Error in screenshot capture:', error);
            sendResponse({ error: error.message });
        }
        return true;
    }
});

async function validateApiKey(apiKey) {
    debugLog('Validating API key...');
    if (!apiKey || !apiKey.startsWith('sk-')) {
        return { isValid: false, error: 'Invalid API key format' };
    }

    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();
        debugLog('API validation response:', data);

        if (!response.ok) {
            debugLog('API Key validation failed:', data);
            return { 
                isValid: false, 
                error: data.error?.message || 'API key validation failed'
            };
        }

        return { isValid: true };
    } catch (error) {
        debugLog('API Key validation error:', error);
        return { 
            isValid: false, 
            error: 'Network error during API key validation' 
        };
    }
}

// Add pricing constants at the top
const PRICING = {
    'gpt-4-1106-vision-preview': {
        input: 0.01,    // $0.01 per 1K input tokens
        output: 0.03,   // $0.03 per 1K output tokens
        image: 0.00765  // $0.00765 per image
    }
};

// Modify handleIntelligentPaste to calculate and show costs
async function handleIntelligentPaste(clipboardText, formFields, imageBase64 = null, screenshotBase64 = null, pageHtml = '', hasProperForm = false) {
    debugLog('=== Starting Intelligent Paste Request ===');
    
    try {
        const messages = [{
            role: "system",
            content: "You are a form-filling assistant. Analyze the form structure and content, then map the clipboard content to the appropriate form fields. Return ONLY a JSON object with field IDs as keys and values to fill in."
        }];

        const formAnalysisMessage = {
            role: "user",
            content: [
                {
                    type: "text",
                    text: `Here's the task:

1. This is the form structure with available fields:
${JSON.stringify(formFields, null, 2)}

${!hasProperForm ? `2. Here's the form HTML for context:
${pageHtml.substring(0, 1000)}...` : ''}

${imageBase64 ? 'Analyze this image and extract information to fill the form fields.' : 'Analyze this text and extract information to fill the form fields.'}

Return ONLY a JSON object where:
- Keys must be the exact field IDs from the form fields list
- Values should be the content to fill in each field

Example response:
{
    "first_name": "John",
    "email": "john@example.com"
}`
                }
            ]
        };

        // Add clipboard content (image or text)
        if (imageBase64) {
            formAnalysisMessage.content.push({
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${imageBase64}`
                }
            });
        } else if (clipboardText) {
            formAnalysisMessage.content.push({
                type: "text",
                text: `Content to fill the form with:\n${clipboardText}`
            });
        }

        // Only add screenshot if we don't have a proper form
        if (!hasProperForm && screenshotBase64) {
            formAnalysisMessage.content.push({
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${screenshotBase64}`
                }
            });
        }

        messages.push(formAnalysisMessage);

        const requestBody = {
            model: "gpt-4-1106-vision-preview",
            messages: messages,
            max_tokens: 1000,
            temperature: 0.3
        };

        debugLog('Sending request to GPT-4 Vision');
        debugLog('Request messages:', messages);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();
        debugLog('Raw Response:', responseText);

        if (!response.ok) {
            throw new Error(`OpenAI API error (${response.status}): ${responseText}`);
        }

        const data = JSON.parse(responseText);
        debugLog('Parsed Response:', data);

        // Calculate costs
        const inputTokens = data.usage.prompt_tokens;
        const outputTokens = data.usage.completion_tokens;
        const imageCount = (imageBase64 ? 1 : 0) + (screenshotBase64 ? 1 : 0);
        
        const cost = calculateCost(inputTokens, outputTokens, imageCount);
        debugLog('Usage Statistics:', {
            inputTokens,
            outputTokens,
            imageCount,
            cost: `$${cost.toFixed(4)}`,
            breakdown: {
                inputCost: `$${((inputTokens / 1000) * PRICING['gpt-4-1106-vision-preview'].input).toFixed(4)}`,
                outputCost: `$${((outputTokens / 1000) * PRICING['gpt-4-1106-vision-preview'].output).toFixed(4)}`,
                imageCost: `$${(imageCount * PRICING['gpt-4-1106-vision-preview'].image).toFixed(4)}`
            }
        });

        // Extract JSON from response and return with cost info
        let content = data.choices[0].message.content;
        if (content.includes('```json')) {
            content = content.split('```json')[1].split('```')[0].trim();
        } else if (content.includes('```')) {
            content = content.split('```')[1].split('```')[0].trim();
        }
        
        const jsonMatch = content.match(/\{[^]*\}/);
        if (jsonMatch) {
            content = jsonMatch[0];
        }

        const mappings = JSON.parse(content);
        debugLog('Final Mappings:', mappings);
        
        return { 
            mappings,
            cost: {
                total: cost,
                inputTokens,
                outputTokens,
                imageCount,
                breakdown: {
                    inputCost: (inputTokens / 1000) * PRICING['gpt-4-1106-vision-preview'].input,
                    outputCost: (outputTokens / 1000) * PRICING['gpt-4-1106-vision-preview'].output,
                    imageCost: imageCount * PRICING['gpt-4-1106-vision-preview'].image
                }
            }
        };
    } catch (error) {
        debugLog('Error in OpenAI call:', error);
        throw error;
    }
}

// Add helper function to calculate cost
function calculateCost(inputTokens, outputTokens, imageCount) {
    const pricing = PRICING['gpt-4-1106-vision-preview'];
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const imageCost = imageCount * pricing.image;
    return inputCost + outputCost + imageCost;
} 