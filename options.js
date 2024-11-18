document.addEventListener('DOMContentLoaded', () => {
	const apiKeyInput = document.getElementById('apiKey');
	const saveButton = document.getElementById('saveSettings');
	const status = document.getElementById('status');
	const toggleBtn = document.querySelector('.toggle-password');

	// Load saved API key
	chrome.storage.sync.get(['openaiApiKey'], (result) => {
		if (result.openaiApiKey) {
			apiKeyInput.value = result.openaiApiKey;
		}
	});

	// Save API key
	saveButton.addEventListener('click', () => {
		const apiKey = apiKeyInput.value.trim();

		if (!apiKey) {
			showStatus('Please enter an API key', 'error');
			return;
		}

		// Basic validation for OpenAI API key format
		if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
			showStatus('Invalid API key format. It should start with "sk-"', 'error');
			return;
		}

		chrome.storage.sync.set(
			{
				openaiApiKey: apiKey,
			},
			() => {
				showStatus('API key saved successfully!', 'success');
				// Notify background script of API key change
				chrome.runtime.sendMessage({ action: 'apiKeyUpdated', apiKey });
			}
		);
	});

	function showStatus(message, type) {
		status.textContent = message;
		status.className = `status ${type}`;
		status.style.display = 'block';

		setTimeout(() => {
			status.style.display = 'none';
		}, 3000);
	}
});

// Add password toggle function
function togglePassword() {
	const apiKeyInput = document.getElementById('apiKey');
	const toggleBtn = document.querySelector('.toggle-password');

	if (apiKeyInput.type === 'password') {
		apiKeyInput.type = 'text';
		toggleBtn.textContent = 'Hide';
	} else {
		apiKeyInput.type = 'password';
		toggleBtn.textContent = 'Show';
	}
}
