let OPENAI_API_KEY = null;
let devToolsConnection = null;

// Add devtools connection handling
chrome.runtime.onConnect.addListener((port) => {
	if (port.name === 'devtools-page') {
		console.log('DevTools connected');
		devToolsConnection = port;

		// Send initial log to confirm connection
		debugLog('DevTools connected');

		port.onMessage.addListener((msg) => {
			if (msg.name === 'init') {
				console.log('DevTools initialized with tab:', msg.tabId);
			}
		});

		// Remove the connection reference when devtools is closed
		port.onDisconnect.addListener(() => {
			console.log('DevTools disconnected');
			devToolsConnection = null;
		});
	}
});

// Update the debug logging function
function debugLog(message, data = null) {
	const timestamp = new Date().toISOString();
	const logMessage = data
		? `${timestamp} - ${message} ${JSON.stringify(data)}`
		: `${timestamp} - ${message}`;
	console.log(logMessage);

	// Send to devtools if connected
	if (devToolsConnection) {
		try {
			devToolsConnection.postMessage({
				type: 'log',
				data: logMessage,
			});
		} catch (error) {
			console.error('Error sending log to DevTools:', error);
			devToolsConnection = null; // Reset connection if sending fails
		}
	}
}

// Add message listener at the top level
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'intelligentPaste') {
		handleIntelligentPaste(
			request.clipboardText,
			request.formFields,
			request.imageBase64
		)
			.then((response) => sendResponse(response))
			.catch((error) => sendResponse({ error: error.message }));
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

// Update the commands listener in background.js
chrome.commands.onCommand.addListener(async (command) => {
	debugLog('Command received:', command);
	if (command === 'intelligent-paste') {
		// Get the active tab
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (tab) {
			debugLog('Sending intelligent-paste command to tab:', tab.id);
			chrome.tabs
				.sendMessage(tab.id, {
					action: 'intelligent-paste',
				})
				.catch((error) => {
					debugLog('Error sending command to tab:', error);
				});
		}
	}
});

async function handleIntelligentPaste(
	clipboardText,
	formFields,
	imageBase64 = null
) {
	const startTime = Date.now();
	debugLog('=== Starting Intelligent Paste Request ===');

	try {
		// Check for API key first
		if (!OPENAI_API_KEY) {
			const result = await chrome.storage.sync.get(['openaiApiKey']);
			OPENAI_API_KEY = result.openaiApiKey;
		}

		if (!OPENAI_API_KEY) {
			debugLog('No API key found');
			throw new Error(
				'Please set your OpenAI API key in the extension settings (click the extension icon)'
			);
		}

		// Basic validation for OpenAI API key format
		if (!OPENAI_API_KEY.startsWith('sk-') || OPENAI_API_KEY.length < 20) {
			debugLog('Invalid API key format');
			throw new Error(
				'Invalid API key format. Please check your API key in the extension settings'
			);
		}

		debugLog('Processing clipboard text:', clipboardText);
		debugLog('Form fields:', formFields);
		debugLog('Image included:', !!imageBase64);

		if (!formFields || formFields.length === 0) {
			debugLog('No form fields provided');
			throw new Error('No form fields found on this page');
		}

		if (!imageBase64 && !clipboardText) {
			debugLog('No content to process');
			throw new Error(
				'No content found in clipboard. Please copy some text or an image first'
			);
		}

		const messages = [
			{
				role: 'system',
				content:
					"You are a form-filling assistant that ONLY responds with valid JSON. Your response must be a valid JSON object with 'mappings' and 'unmappedData' properties. Do not include any explanations, markdown formatting, or code blocks. Respond with raw JSON only.",
			},
		];

		// Add content message based on what we have
		if (imageBase64) {
			debugLog('Using GPT-4 Vision');
			const availableFields = formFields
				.map((f) => f.id || f.name)
				.filter(Boolean);
			debugLog('Available fields:', availableFields);

			messages.push({
				role: 'user',
				content: [
					{
						type: 'text',
						text: `Extract information from this image and respond with ONLY a raw JSON object in this exact format:
{
    "mappings": {
        // Use ONLY these field IDs: ${availableFields.join(', ')}
    },
    "unmappedData": {
        // Include any other information found
    }
}

Available form fields:
${JSON.stringify(formFields, null, 2)}

Remember: Return ONLY the JSON object, no markdown, no code blocks, no explanations.`,
					},
					{
						type: 'image_url',
						image_url: {
							url: `data:image/png;base64,${imageBase64}`,
						},
					},
				],
			});
		} else if (clipboardText) {
			// Handle text content
			debugLog('Using text content');
			const availableFields = formFields
				.map((f) => f.id || f.name)
				.filter(Boolean);
			debugLog('Available fields:', availableFields);

			messages.push({
				role: 'user',
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
}`,
			});
		}

		const requestBody = {
			model: 'gpt-4-1106-vision-preview',
			messages: messages,
			max_tokens: 1000,
			temperature: 0.0,
			seed: 123,
		};

		debugLog('=== OpenAI Request ===');
		debugLog('Request URL: https://api.openai.com/v1/chat/completions');
		debugLog('Request Method: POST');
		debugLog('Request Headers:', {
			'Content-Type': 'application/json',
			Authorization: 'Bearer sk-....' + OPENAI_API_KEY.slice(-4),
		});

		debugLog('System Prompt:', messages[0].content);

		if (messages[1]) {
			if (Array.isArray(messages[1].content)) {
				debugLog(
					'User Prompt Text:',
					messages[1].content.find((c) => c.type === 'text')?.text
				);
				debugLog(
					'User Prompt Includes Image:',
					messages[1].content.some((c) => c.type === 'image_url')
				);
			} else {
				debugLog('User Prompt:', messages[1].content);
			}
		}

		debugLog('Full Request:', {
			model: requestBody.model,
			messages: messages.map((m) => ({
				role: m.role,
				content: Array.isArray(m.content)
					? m.content.map((c) =>
							c.type === 'image_url'
								? { ...c, image_url: { url: '[BASE64_IMAGE_DATA]' } }
								: c
					  )
					: m.content,
			})),
			max_tokens: requestBody.max_tokens,
			temperature: requestBody.temperature,
		});

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENAI_API_KEY}`,
			},
			body: JSON.stringify(requestBody),
		});

		debugLog('=== OpenAI Response ===');
		debugLog('Response Status:', response.status);
		debugLog(
			'Response Headers:',
			Object.fromEntries(response.headers.entries())
		);

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
		debugLog(
			'Cost Estimate:',
			`$${((data.usage.total_tokens / 1000) * 0.01).toFixed(4)}`
		);
		debugLog('Processing Time:', `${Date.now() - startTime}ms`);

		return {
			mappings: mappings.mappings || mappings,
			unmappedData: mappings.unmappedData || {},
			cost: {
				total: (data.usage.total_tokens / 1000) * 0.01,
				inputTokens: data.usage.prompt_tokens,
				outputTokens: data.usage.completion_tokens,
				imageCount: imageBase64 ? 1 : 0,
			},
		};
	} catch (error) {
		debugLog('Error in handleIntelligentPaste:', {
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
		throw error;
	}
}
