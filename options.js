document.addEventListener('DOMContentLoaded', () => {
	const apiKeyInput = document.getElementById('apiKey');
	const additionalPrompt = document.getElementById('additionalPrompt');
	const saveSettings = document.getElementById('saveSettings');
	const statusMessage = document.getElementById('statusMessage');
	const basePromptArea = document.querySelector('.base-prompt');
	const enableToggle = document.getElementById('enableIntelligentPasteToggle');

	// Load saved settings
	chrome.storage.sync.get(
		['openaiApiKey', 'userProvidedInstructions', 'intelligentPasteEnabled'], // Changed 'additionalPrompt' to 'userProvidedInstructions'
		(result) => {
			if (result.openaiApiKey) {
				apiKeyInput.value = result.openaiApiKey;
			}
			if (result.userProvidedInstructions) { // Changed to 'userProvidedInstructions'
				additionalPrompt.value = result.userProvidedInstructions; // Populate textarea
			}
			enableToggle.checked = result.intelligentPasteEnabled !== false;
		}
	);

	// Save toggle state
	enableToggle.addEventListener('change', (event) => { // Added event listener
		const isEnabled = event.target.checked;
		chrome.storage.sync.set({ intelligentPasteEnabled: isEnabled }, () => {
			showStatus('Enable/disable state saved.', 'success');
			// Notify background script of toggle change
			chrome.runtime.sendMessage({ 
				action: 'toggleStateChanged', 
				enabled: isEnabled 
			});
		});
	});

	// Save settings
	saveSettings.addEventListener('click', () => {
		const apiKey = apiKeyInput.value.trim();
		const additionalInstructions = additionalPrompt.value.trim();

		if (!apiKey) {
			showStatus('Please enter an API key', 'error');
			return;
		}

		// BASE_PROMPT and fullPrompt combination removed

		chrome.storage.sync.set({ 
			openaiApiKey: apiKey,
			userProvidedInstructions: additionalInstructions // Changed key and value
		}, () => {
			showStatus('Settings saved successfully!', 'success');
			// Notify background script of changes
			chrome.runtime.sendMessage({ 
				action: 'settingsUpdated',
				apiKey,
				userProvidedInstructions: additionalInstructions // Changed key and value
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
