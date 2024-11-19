document.addEventListener('DOMContentLoaded', () => {
	const apiKeyInput = document.getElementById('apiKey');
	const additionalPrompt = document.getElementById('additionalPrompt');
	const saveSettings = document.getElementById('saveSettings');
	const statusMessage = document.getElementById('statusMessage');
	const basePromptArea = document.querySelector('.base-prompt');

	const BASE_PROMPT = `You are a form-filling assistant that ONLY responds with valid JSON. Your response must be a valid JSON object with 'mappings' and 'unmappedData' properties. Do not include any explanations, markdown formatting, or code blocks. Respond with raw JSON only.

The 'mappings' object should contain field IDs as keys and extracted values as values.
The 'unmappedData' object should contain any additional information found that doesn't map to available fields.`;

	// Set the base prompt
	basePromptArea.value = BASE_PROMPT;

	// Load saved settings
	chrome.storage.sync.get(['openaiApiKey', 'additionalPrompt'], (result) => {
		if (result.openaiApiKey) {
			apiKeyInput.value = result.openaiApiKey;
		}
		if (result.additionalPrompt) {
			additionalPrompt.value = result.additionalPrompt;
		}
	});

	// Save settings
	saveSettings.addEventListener('click', () => {
		const apiKey = apiKeyInput.value.trim();
		const additionalInstructions = additionalPrompt.value.trim();

		if (!apiKey) {
			showStatus('Please enter an API key', 'error');
			return;
		}

		// Combine base prompt with additional instructions
		const fullPrompt = additionalInstructions 
			? `${BASE_PROMPT}\n\nAdditional Instructions:\n${additionalInstructions}`
			: BASE_PROMPT;

		chrome.storage.sync.set({ 
			openaiApiKey: apiKey,
			additionalPrompt: additionalInstructions,
			systemPrompt: fullPrompt
		}, () => {
			showStatus('Settings saved successfully!', 'success');
			// Notify background script of changes
			chrome.runtime.sendMessage({ 
				action: 'settingsUpdated',
				apiKey,
				systemPrompt: fullPrompt
			});
		});
	});

	function showStatus(message, type) {
		statusMessage.textContent = message;
		statusMessage.className = `status-message ${type}`;
		statusMessage.style.display = 'block';

		setTimeout(() => {
			statusMessage.style.display = 'none';
		}, 3000);
	}
});
