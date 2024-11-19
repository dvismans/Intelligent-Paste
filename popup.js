document.addEventListener('DOMContentLoaded', () => {
	const checkbox = document.getElementById('enableIntelligentPaste');
	const apiKeyInput = document.getElementById('apiKey');
	const saveButton = document.getElementById('saveApiKey');
	const statusMessage = document.getElementById('statusMessage');
	const systemPrompt = document.getElementById('systemPrompt');
	const resetPrompt = document.getElementById('resetPrompt');

	const DEFAULT_PROMPT = `You are a form-filling assistant that ONLY responds with valid JSON. Your response must be a valid JSON object with 'mappings' and 'unmappedData' properties. Do not include any explanations, markdown formatting, or code blocks. Respond with raw JSON only.`;

	// Load saved state
	chrome.storage.sync.get(
		['intelligentPasteEnabled', 'openaiApiKey', 'systemPrompt'],
		(result) => {
			checkbox.checked = result.intelligentPasteEnabled !== false;
			if (result.openaiApiKey) {
				apiKeyInput.value = result.openaiApiKey;
			}
			systemPrompt.value = result.systemPrompt || DEFAULT_PROMPT;
		}
	);

	// Save enabled state when changed
	checkbox.addEventListener('change', (e) => {
		chrome.storage.sync.set({
			intelligentPasteEnabled: e.target.checked
		});
	});

	// Save API key and prompt
	saveButton.addEventListener('click', () => {
		const apiKey = apiKeyInput.value.trim();
		const prompt = systemPrompt.value.trim();

		if (!apiKey) {
			showStatus('Please enter an API key', 'error');
			return;
		}

		if (!prompt) {
			showStatus('Please enter a system prompt', 'error');
			return;
		}

		chrome.storage.sync.set({ 
			openaiApiKey: apiKey,
			systemPrompt: prompt 
		}, () => {
			showStatus('Settings saved successfully!', 'success');
			// Notify background script of changes
			chrome.runtime.sendMessage({ 
				action: 'settingsUpdated',
				apiKey,
				systemPrompt: prompt
			});
		});
	});

	// Reset prompt to default
	resetPrompt.addEventListener('click', () => {
		systemPrompt.value = DEFAULT_PROMPT;
		// Don't save automatically, let user click Save
		showStatus('Prompt reset to default. Click Save to apply.', 'success');
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
