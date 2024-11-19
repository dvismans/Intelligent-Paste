let OPENAI_API_KEY = null;
let SYSTEM_PROMPT = null;

// Simple debug logging function
function debugLog(message, data = null) {
	// Always log to background console
	if (data) {
		console.group(message);
		console.log(data);
		console.groupEnd();
	} else {
		console.log(message);
	}

	// Format for any other listeners
	const timestamp = new Date().toISOString();
	const logMessage = data 
		? `${timestamp} - ${message}\n${JSON.stringify(data, null, 2)}`
		: `${timestamp} - ${message}`;

	return logMessage;
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

	if (request.action === 'settingsUpdated') {
		OPENAI_API_KEY = request.apiKey;
		SYSTEM_PROMPT = request.systemPrompt;
		sendResponse({ success: true });
		return false;
	}
});

// Load API key when background script starts
chrome.storage.sync.get(['openaiApiKey'], (result) => {
	OPENAI_API_KEY = result.openaiApiKey;
});

// Add at the top of background.js, right after the variable declarations
chrome.commands.onCommand.addListener(async (command) => {
	debugLog('Command received:', command);
	if (command === 'run-intelligent-paste') {
		// Get the active tab
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (tab) {
			debugLog('Sending command to tab:', tab.id);
			chrome.tabs
				.sendMessage(tab.id, {
					action: 'run-intelligent-paste',
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
	console.group('=== Intelligent Paste Request ===');
	console.log('Request Details:', {
		hasClipboardText: !!clipboardText,
		clipboardTextLength: clipboardText?.length,
		formFieldsCount: formFields?.length,
		hasImage: !!imageBase64,
		imageSize: imageBase64?.length
	});

	try {
		if (!OPENAI_API_KEY) {
			const result = await chrome.storage.sync.get(['openaiApiKey']);
			OPENAI_API_KEY = result.openaiApiKey;
		}

		if (!OPENAI_API_KEY) {
			console.error('API key not found');
			throw new Error(
				'OpenAI API key not set. Please set your API key in the extension options.'
			);
		}

		if (!formFields || formFields.length === 0) {
			console.error('No form fields provided');
			throw new Error('No form fields to fill');
		}

		if (!imageBase64 && !clipboardText) {
			console.error('No content to process');
			throw new Error('No content to process');
		}

		// Load settings if not already loaded
		if (!SYSTEM_PROMPT) {
			const result = await chrome.storage.sync.get(['systemPrompt']);
			SYSTEM_PROMPT = result.systemPrompt;
		}

		const messages = [
			{
				role: 'system',
				content: SYSTEM_PROMPT || "You are a form-filling assistant that ONLY responds with valid JSON. Your response must be a valid JSON object with 'mappings' and 'unmappedData' properties. Do not include any explanations, markdown formatting, or code blocks. Respond with raw JSON only.",
			},
		];

		// Add content message based on what we have
		if (imageBase64) {
			console.log('Using GPT-4 Vision API');
			const availableFields = formFields
				.map((f) => f.id || f.name)
				.filter(Boolean);
			console.log('Available fields:', availableFields);

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
			console.log('Using text content');
			const availableFields = formFields
				.map((f) => f.id || f.name)
				.filter(Boolean);
			console.log('Available fields:', availableFields);

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

		console.group('OpenAI Request');
		console.log('URL:', 'https://api.openai.com/v1/chat/completions');
		console.log('Method: POST');
		console.log('Headers:', {
			'Content-Type': 'application/json',
			'Authorization': 'Bearer sk-....' + OPENAI_API_KEY.slice(-4)
		});
		console.log('Request Body:', JSON.stringify(requestBody, null, 2));
		console.groupEnd();

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${OPENAI_API_KEY}`,
			},
			body: JSON.stringify(requestBody),
		});

		console.group('OpenAI Response');
		console.log('Status:', response.status);
		console.log('Headers:', Object.fromEntries(response.headers.entries()));

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Error Response:', errorText);
			throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
		}

		const data = await response.json();
		console.log('Response Body:', JSON.stringify(data, null, 2));
		console.groupEnd();

		if (!data.choices?.[0]?.message?.content) {
			console.error('Invalid response format from OpenAI');
			throw new Error('Invalid response from OpenAI');
		}

		const content = data.choices[0].message.content;
		console.log('Raw content from OpenAI:', content);

		let mappings;
		try {
			mappings = JSON.parse(content);
			console.log('Successfully parsed mappings:', mappings);
		} catch (error) {
			console.error('Error parsing content as JSON:', error);
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				mappings = JSON.parse(jsonMatch[0]);
				console.log('Successfully extracted and parsed mappings:', mappings);
			} else {
				console.error('Failed to parse response as JSON');
				throw new Error('Failed to parse OpenAI response as JSON');
			}
		}

		if (!mappings || (!mappings.mappings && !mappings.unmappedData)) {
			console.error('No valid data found in response');
			throw new Error('No valid data found in OpenAI response');
		}

		console.group('Request Summary');
		console.log('Total Tokens Used:', data.usage.total_tokens);
		console.log('Cost Estimate:', `$${((data.usage.total_tokens / 1000) * 0.01).toFixed(4)}`);
		console.log('Processing Time:', `${Date.now() - startTime}ms`);
		console.groupEnd();

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
		console.error('Error in handleIntelligentPaste:', error);
		throw error;
	} finally {
		console.groupEnd(); // Close main group
	}
}

// Add context menu creation
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'openSettings',
		title: 'Settings',
		contexts: ['action'],
	});
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === 'openSettings') {
		chrome.runtime.openOptionsPage();
	}
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
	try {
		// Check if we have an API key first
		const result = await chrome.storage.sync.get(['openaiApiKey']);
		if (!result.openaiApiKey) {
			// Only open options page if no API key is set
			chrome.runtime.openOptionsPage();
			return;
		}

		// Check if we can access the tab's URL
		if (
			tab.url.startsWith('chrome://') ||
			tab.url.startsWith('chrome-extension://')
		) {
			showNotification(
				'Intelligent Paste cannot be used on Chrome system pages'
			);
			return;
		}

		// Focus the tab first
		await chrome.windows.update(tab.windowId, { focused: true });
		await chrome.tabs.update(tab.id, { active: true });

		// Execute the paste action directly in the page context
		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['content.js'],
		});

		// Wait a moment for the content script to initialize
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Send message to trigger paste
		await chrome.tabs.sendMessage(tab.id, {
			action: 'intelligent-paste',
		});
	} catch (error) {
		console.error('Error handling action click:', error);
		if (error.message.includes('cannot access a chrome://')) {
			showNotification(
				'Intelligent Paste cannot be used on Chrome system pages'
			);
		} else if (error.message.includes('API key')) {
			chrome.runtime.openOptionsPage();
		}
	}
});
