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

async function handleIntelligentPaste(clipboardText, formFields, imageBase64 = null) {
    debugLog('=== Starting Intelligent Paste Request ===');
    debugLog('Processing clipboard text:', clipboardText);
    debugLog('Form fields:', formFields);
    debugLog('Image included:', !!imageBase64);

    try {
        const messages = [{
            role: "system",
            content: "You are a form-filling assistant. Your task is to analyze clipboard content and map it to form fields. Return only a valid JSON object where keys are field IDs/names and values are the extracted content."
        }];

        // If we have an image, use GPT-4 Vision
        if (imageBase64) {
            debugLog('Using GPT-4 Turbo with Vision');
            messages.push({
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Analyze this image and extract information to fill a form. Only extract information that is clearly visible in the image.

For each form field below:
1. Only fill fields where you are highly confident about the information
2. Maintain the exact format of data as shown in the image
3. Do not make assumptions or guess information
4. Leave fields empty (do not include in JSON) if you're not certain

Available form fields:
${JSON.stringify(formFields, null, 2)}

Return ONLY a JSON object with field IDs as keys and extracted values as values.
Do not include any explanations or markdown formatting.
Example format:
{
    "first_name": "John",
    "email": "john@example.com"
}`
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${imageBase64}`
                        }
                    }
                ]
            });

            const requestBody = {
                model: "gpt-4-1106-vision-preview",
                messages: messages,
                max_tokens: 1000,
                temperature: 0.3
            };

            debugLog('Sending request to GPT-4 Vision');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify(requestBody)
            });

            debugLog('Processing response...');
            const responseText = await response.text();
            debugLog('Raw Vision Response:', responseText);

            if (!response.ok) {
                throw new Error(`OpenAI API error (${response.status}): ${responseText}`);
            }

            const data = JSON.parse(responseText);
            debugLog('Parsed Vision Response:', data);

            let mappingsText = data.choices[0].message.content;
            if (mappingsText.includes('```json')) {
                mappingsText = mappingsText.split('```json\n')[1].split('```')[0];
            } else if (mappingsText.includes('```')) {
                mappingsText = mappingsText.split('```\n')[1].split('```')[0];
            }

            const mappings = JSON.parse(mappingsText.trim());
            debugLog('Vision Mappings:', mappings);
            return mappings;
        } else {
            // Handle text-only case
            debugLog('Using GPT-4 for text analysis');
            messages.push({
                role: "user",
                content: `Extract information from the following text to fill a form. Only extract information that is explicitly present in the text.

For each form field below:
1. Only fill fields where you are highly confident about the information
2. Maintain the exact format of data as shown in the text
3. Do not make assumptions or guess information
4. Leave fields empty (do not include in JSON) if you're not certain

Clipboard text:
${clipboardText}

Available form fields:
${JSON.stringify(formFields, null, 2)}

Return ONLY a JSON object with field IDs as keys and extracted values as values.
Do not include any explanations or markdown formatting.
Example format:
{
    "first_name": "John",
    "email": "john@example.com"
}`
            });

            const requestBody = {
                model: "gpt-4-turbo-preview",
                messages: messages,
                max_tokens: 1000,
                temperature: 0.3
            };

            debugLog('Sending request to GPT-4');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify(requestBody)
            });

            const responseText = await response.text();
            debugLog('Raw Text Response:', responseText);

            if (!response.ok) {
                throw new Error(`OpenAI API error (${response.status}): ${responseText}`);
            }

            const data = JSON.parse(responseText);
            debugLog('Parsed Text Response:', data);

            let mappingsText = data.choices[0].message.content;
            if (mappingsText.includes('```json')) {
                mappingsText = mappingsText.split('```json\n')[1].split('```')[0];
            } else if (mappingsText.includes('```')) {
                mappingsText = mappingsText.split('```\n')[1].split('```')[0];
            }

            const mappings = JSON.parse(mappingsText.trim());
            debugLog('Text Mappings:', mappings);
            return mappings;
        }
    } catch (error) {
        debugLog('Error in OpenAI call:', error);
        throw error;
    }
} 