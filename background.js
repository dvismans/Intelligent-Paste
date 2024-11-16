let OPENAI_API_KEY = null;
let devToolsConnection = null;

// Add devtools connection handling
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'devtools-page') {
        devToolsConnection = port;
        
        // Remove the connection reference when devtools is closed
        port.onDisconnect.addListener(() => {
            devToolsConnection = null;
        });
    }
});

// Update the debug logging function
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = data ? `${timestamp} - ${message} ${JSON.stringify(data)}` : `${timestamp} - ${message}`;
    console.log(logMessage);

    // Send to devtools if connected
    if (devToolsConnection) {
        devToolsConnection.postMessage({
            type: 'log',
            data: logMessage
        });
    }
}

// Add message listener at the top level
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'intelligentPaste') {
        handleIntelligentPaste(request.clipboardText, request.formFields, request.imageBase64)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Will respond asynchronously
    }
    
    if (request.action === 'apiKeyUpdated') {
        OPENAI_API_KEY = request.apiKey;
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'debugLog') {
        console.log(request.message);
        return false;
    }
});

// Load API key when background script starts
chrome.storage.sync.get(['openaiApiKey'], (result) => {
    OPENAI_API_KEY = result.openaiApiKey;
});

async function handleIntelligentPaste(clipboardText, formFields, imageBase64 = null) {
    const startTime = Date.now();
    debugLog('=== Starting Intelligent Paste Request ===');
    debugLog('Processing clipboard text:', clipboardText);
    debugLog('Form fields:', formFields);
    debugLog('Image included:', !!imageBase64);

    try {
        if (!OPENAI_API_KEY) {
            const result = await chrome.storage.sync.get(['openaiApiKey']);
            OPENAI_API_KEY = result.openaiApiKey;
        }

        if (!OPENAI_API_KEY) {
            debugLog('API key not found');
            throw new Error('OpenAI API key not set. Please set your API key in the extension options.');
        }

        if (!formFields || formFields.length === 0) {
            debugLog('No form fields provided');
            throw new Error('No form fields to fill');
        }

        if (!imageBase64 && !clipboardText) {
            debugLog('No content to process');
            throw new Error('No content to process');
        }

        const messages = [{
            role: "system",
            content: "You are a form-filling assistant. Your task is to analyze clipboard content and map it to form fields. Return only a valid JSON object where keys are field IDs/names and values are the extracted content."
        }];

        // Add content message based on what we have
        if (imageBase64) {
            debugLog('Using GPT-4 Vision');
            const availableFields = formFields.map(f => f.id || f.name).filter(Boolean);
            debugLog('Available fields:', availableFields);

            messages.push({
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Analyze this image and extract ALL information, then return:
1. Mapped fields: Information that matches the available form fields
2. Additional data: Any other information found that doesn't map to available fields

Available form fields:
${JSON.stringify(formFields, null, 2)}

Return a JSON object with two sections:
{
    "mappings": {
        // Use ONLY these field IDs: ${availableFields.join(', ')}
        "${availableFields[0] || 'example'}": "extracted value"
    },
    "unmappedData": {
        // Include ANY other information found, with descriptive keys
        "description": "value",
        "amount": "value",
        "date": "value"
        // etc...
    }
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
        } else if (clipboardText) {
            // Handle text content
            debugLog('Using text content');
            const availableFields = formFields.map(f => f.id || f.name).filter(Boolean);
            debugLog('Available fields:', availableFields);

            messages.push({
                role: "user",
                content: `Analyze this text content and extract ALL information:

Text content to analyze:
${clipboardText}

Available form fields:
${JSON.stringify(formFields, null, 2)}

Return a JSON object with two sections:
{
    "mappings": {
        // Use ONLY these field IDs: ${availableFields.join(', ')}
        "${availableFields[0] || 'example'}": "extracted value"
    },
    "unmappedData": {
        // Include ANY other information found, with descriptive keys
        "description": "value",
        "amount": "value",
        "date": "value"
        // etc...
    }
}`
            });
        }

        const requestBody = {
            model: "gpt-4-1106-vision-preview",
            messages: messages,
            max_tokens: 1000,
            temperature: 0.3
        };

        debugLog('=== OpenAI Request ===');
        debugLog('Request URL: https://api.openai.com/v1/chat/completions');
        debugLog('Request Method: POST');
        debugLog('Request Headers:', {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-....' + OPENAI_API_KEY.slice(-4)
        });
        debugLog('Request Body:', {
            ...requestBody,
            messages: messages.map(m => ({
                ...m,
                content: m.content.map ? m.content.map(c => 
                    c.type === 'image_url' ? { ...c, image_url: { url: 'data:image/png;base64,...' } } : c
                ) : m.content
            }))
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        debugLog('=== OpenAI Response ===');
        debugLog('Response Status:', response.status);
        debugLog('Response Headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            debugLog('OpenAI Error Response:', errorText);
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        debugLog('OpenAI Response Body:', data);

        if (!data.choices?.[0]?.message?.content) {
            debugLog('Invalid response format from OpenAI');
            throw new Error('Invalid response from OpenAI');
        }

        const content = data.choices[0].message.content;
        debugLog('Raw content from OpenAI:', content);

        let mappings;
        try {
            mappings = JSON.parse(content);
            debugLog('Successfully parsed mappings:', mappings);
        } catch (error) {
            debugLog('Error parsing content as JSON:', error);
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                mappings = JSON.parse(jsonMatch[0]);
                debugLog('Successfully extracted and parsed mappings:', mappings);
            } else {
                debugLog('Failed to parse response as JSON');
                throw new Error('Failed to parse OpenAI response as JSON');
            }
        }

        if (!mappings || (!mappings.mappings && !mappings.unmappedData)) {
            debugLog('No valid data found in response');
            throw new Error('No valid data found in OpenAI response');
        }

        debugLog('=== Request Summary ===');
        debugLog('Total Tokens Used:', data.usage.total_tokens);
        debugLog('Cost Estimate:', `$${((data.usage.total_tokens / 1000) * 0.01).toFixed(4)}`);
        debugLog('Processing Time:', `${(Date.now() - startTime)}ms`);

        return {
            mappings: mappings.mappings || mappings,
            unmappedData: mappings.unmappedData || {},
            cost: {
                total: ((data.usage.total_tokens / 1000) * 0.01),
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
                imageCount: imageBase64 ? 1 : 0
            }
        };
    } catch (error) {
        debugLog('Error in handleIntelligentPaste:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
} 