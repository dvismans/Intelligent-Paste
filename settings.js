document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings when the page opens
    chrome.storage.sync.get(['additionalInstructions'], function(result) {
        if (result.additionalInstructions) {
            document.getElementById('additional-instructions').value = result.additionalInstructions;
        }
    });

    // Save settings when the save button is clicked
    document.getElementById('save-settings').addEventListener('click', function() {
        const additionalInstructions = document.getElementById('additional-instructions').value;
        
        chrome.storage.sync.set({
            additionalInstructions: additionalInstructions
        }, function() {
            // Show save confirmation
            const saveStatus = document.getElementById('save-status');
            saveStatus.style.display = 'block';
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 2000);
        });
    });
}); 