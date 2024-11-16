document.addEventListener('DOMContentLoaded', () => {
    const checkbox = document.getElementById('enableIntelligentPaste');
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveApiKey');
    const statusMessage = document.getElementById('statusMessage');
    
    // Load saved state
    chrome.storage.sync.get(['intelligentPasteEnabled', 'openaiApiKey'], (result) => {
        checkbox.checked = result.intelligentPasteEnabled !== false;
        if (result.openaiApiKey) {
            apiKeyInput.value = result.openaiApiKey;
        }
    });
    
    // Save enabled state when changed
    checkbox.addEventListener('change', (e) => {
        chrome.storage.sync.set({
            intelligentPasteEnabled: e.target.checked
        });
    });

    // Save API key
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('Please enter an API key', 'error');
            return;
        }

        chrome.storage.sync.set({ openaiApiKey: apiKey }, () => {
            showStatus('API key saved successfully!', 'success');
            // Notify background script of API key change
            chrome.runtime.sendMessage({ action: 'apiKeyUpdated', apiKey });
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