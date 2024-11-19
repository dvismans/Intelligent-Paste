document.addEventListener('DOMContentLoaded', function() {
    console.log('Settings page loaded');
    
    // Load saved settings when the page opens
    chrome.storage.sync.get(['openaiApiKey', 'additionalPrompt'], function(result) {
        console.log('Loaded settings:', result);
        
        if (result.openaiApiKey) {
            document.getElementById('api-key').value = result.openaiApiKey;
        }
        if (result.additionalPrompt) {
            document.getElementById('additional-instructions').value = result.additionalPrompt;
        }
    });

    // Save settings when the save button is clicked
    document.getElementById('save-settings').addEventListener('click', function() {
        const apiKey = document.getElementById('api-key').value.trim();
        const additionalPrompt = document.getElementById('additional-instructions').value.trim();
        
        console.log('Saving settings:', {
            apiKey: apiKey ? '***' : 'none',
            additionalPrompt: additionalPrompt
        });

        chrome.storage.sync.set({
            openaiApiKey: apiKey,
            additionalPrompt: additionalPrompt
        }, function() {
            console.log('Settings saved to storage');
            
            // Show save confirmation
            const saveStatus = document.getElementById('save-status');
            saveStatus.style.display = 'block';
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 2000);

            // Verify the save by reading back
            chrome.storage.sync.get(['additionalPrompt'], function(result) {
                console.log('Verified saved prompt:', result.additionalPrompt);
            });

            // Notify background script of settings update
            chrome.runtime.sendMessage({
                action: 'settingsUpdated',
                apiKey: apiKey,
                additionalInstructions: additionalPrompt
            }, function(response) {
                console.log('Background script update response:', response);
            });
        });
    });
}); 