console.log('Content script loaded!');

// Listen for paste events on the document
document.addEventListener('paste', handlePaste, true);

// Add this new function to test clipboard access
async function testClipboardAccess(e) {
    debugLog('=== Clipboard Debug Info ===');
    debugLog('Event type:', e.type);
    debugLog('Target element:', e.target.tagName);
    debugLog('Active element:', document.activeElement.tagName);
    
    try {
        // Try using the Clipboard API
        const clipboardItems = await navigator.clipboard.read();
        debugLog('Clipboard items:', clipboardItems.length);
        
        for (const item of clipboardItems) {
            debugLog('Clipboard item types:', item.types);
            for (const type of item.types) {
                const blob = await item.getType(type);
                const text = await blob.text();
                debugLog(`Content for ${type}:`, text);
            }
        }
    } catch (error) {
        debugLog('Clipboard API error:', error.message);
        
        // Fallback to clipboardData
        if (e.clipboardData) {
            const types = Array.from(e.clipboardData.types || []);
            debugLog('Fallback clipboard types:', types);
            
            types.forEach(type => {
                const data = e.clipboardData.getData(type);
                debugLog(`Fallback data for ${type}:`, data);
            });
        }
    }
}

// Add debug logging function that communicates with background script
function debugLog(message, data = null) {
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    console.log(logMessage);
    
    // Send to background script for DevTools panel
    chrome.runtime.sendMessage({
        action: 'debugLog',
        message: logMessage
    }).catch(() => {}); // Ignore errors if background script is not ready
}

// Add this at the top of the file
let isProcessingPaste = false;

// Add this function to create a step tracker
function createStepTracker() {
    const tracker = document.createElement('div');
    tracker.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #2196F3;
        border-radius: 5px;
        padding: 15px;
        z-index: 10000;
        width: 300px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
        font-weight: bold;
        margin-bottom: 10px;
    `;
    title.textContent = 'Intelligent Paste';

    const status = document.createElement('div');
    status.style.cssText = `
        margin-bottom: 10px;
        font-size: 14px;
        color: #666;
    `;

    // Only show progress bar for image upload
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
        display: none;
        margin-top: 8px;
    `;

    const progressLabel = document.createElement('div');
    progressLabel.style.cssText = `
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
    `;
    progressLabel.textContent = 'Upload Progress';

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        width: 100%;
        height: 4px;
        background: #eee;
        border-radius: 2px;
        overflow: hidden;
    `;

    const progress = document.createElement('div');
    progress.style.cssText = `
        width: 0%;
        height: 100%;
        background: #2196F3;
        transition: width 0.3s ease;
    `;

    progressBar.appendChild(progress);
    progressContainer.appendChild(progressLabel);
    progressContainer.appendChild(progressBar);

    tracker.appendChild(title);
    tracker.appendChild(status);
    tracker.appendChild(progressContainer);
    document.body.appendChild(tracker);

    return {
        element: tracker,
        updateStep: (message) => {
            status.textContent = message;
        },
        showProgress: (show) => {
            progressContainer.style.display = show ? 'block' : 'none';
        },
        updateProgress: (percent) => {
            progress.style.width = `${percent}%`;
            progressLabel.textContent = `Upload Progress: ${Math.round(percent)}%`;
        },
        remove: () => tracker.remove()
    };
}

// Modify the handlePaste function to use the step tracker
async function handlePaste(e) {
    // Prevent recursive paste handling
    if (isProcessingPaste) {
        debugLog('Already processing a paste event, skipping');
        return;
    }

    let stepTracker;
    try {
        debugLog('Paste event captured!');
        isProcessingPaste = true;

        // First check if intelligent paste is enabled
        let result;
        try {
            result = await chrome.storage.sync.get(['intelligentPasteEnabled']);
        } catch (error) {
            debugLog('Storage access failed:', error);
            isProcessingPaste = false;
            return;
        }
        
        if (result.intelligentPasteEnabled === false) {
            debugLog('Intelligent paste is disabled');
            isProcessingPaste = false;
            return;
        }

        let clipboardText = '';
        let imageBase64 = null;

        // Create a temporary element to handle clipboard data
        const tempElem = document.createElement('div');
        tempElem.contentEditable = true;
        tempElem.style.position = 'fixed';
        tempElem.style.left = '-9999px';
        document.body.appendChild(tempElem);
        
        try {
            // Get text directly from clipboardData first
            if (e.clipboardData) {
                clipboardText = e.clipboardData.getData('text/plain');
                debugLog('Got text directly from clipboardData:', clipboardText);

                // Check for images in clipboardData
                if (e.clipboardData.items) {
                    for (const item of e.clipboardData.items) {
                        if (item.type.startsWith('image/')) {
                            const blob = item.getAsFile();
                            if (blob) {
                                imageBase64 = await new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(reader.result.split(',')[1]);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                                debugLog('Got image from clipboardData');
                            }
                        }
                    }
                }
            }

            // Only use the temp element if we haven't found content yet
            if (!clipboardText && !imageBase64) {
                tempElem.focus();
                document.execCommand('paste');
                clipboardText = tempElem.innerText;
                
                // Check for images in the pasted content
                const images = tempElem.getElementsByTagName('img');
                if (images.length > 0) {
                    const imgSrc = images[0].src;
                    if (imgSrc.startsWith('data:image')) {
                        imageBase64 = imgSrc.split(',')[1];
                        debugLog('Got image from pasted content');
                    }
                }
            }
        } finally {
            // Clean up
            tempElem.remove();
        }

        debugLog('Final clipboard text:', clipboardText ? 'found' : 'not found');
        debugLog('Final image data:', imageBase64 ? 'found' : 'not found');

        if (!clipboardText && !imageBase64) {
            debugLog('No content found in clipboard data');
            showNotification('No content found in clipboard', 'error');
            isProcessingPaste = false;
            return;
        }

        // Prevent default paste
        e.preventDefault();
        
        // Show confirmation dialog
        if (!confirm('Would you like to use Intelligent Paste to automatically fill this form?')) {
            debugLog('User cancelled intelligent paste');
            isProcessingPaste = false;
            return;
        }

        stepTracker = createStepTracker();
        
        // Get all form fields from the page
        const formFields = getAllFormFields();
        
        if (imageBase64) {
            stepTracker.updateStep('Processing image...');
            stepTracker.showProgress(true);
            
            // Simulate upload progress for the image
            let progress = 0;
            const uploadInterval = setInterval(() => {
                progress += 5;
                if (progress <= 95) {
                    stepTracker.updateProgress(progress);
                }
            }, 100);

            // Send message to background script
            chrome.runtime.sendMessage({
                action: 'intelligentPaste',
                clipboardText,
                imageBase64,
                formFields
            }, response => {
                clearInterval(uploadInterval);
                handleResponse(response, stepTracker);
            });
        } else {
            // Text-only processing
            stepTracker.updateStep('Processing text...');
            stepTracker.showProgress(false);
            
            // Send message to background script
            chrome.runtime.sendMessage({
                action: 'intelligentPaste',
                clipboardText,
                formFields
            }, response => {
                handleResponse(response, stepTracker);
            });
        }
    } catch (error) {
        debugLog('Critical error in paste handler:', error);
        if (stepTracker) {
            stepTracker.updateStep('Error occurred');
            setTimeout(() => stepTracker.remove(), 1000);
        }
        showNotification('Extension error. Please refresh the page.', 'error');
        isProcessingPaste = false;
    }
}

// Add this helper function to handle responses
function handleResponse(response, stepTracker) {
    if (chrome.runtime.lastError) {
        stepTracker.updateStep('Error occurred');
        setTimeout(() => {
            stepTracker.remove();
            showNotification('Extension error. Please refresh the page.', 'error');
        }, 1000);
        isProcessingPaste = false;
        return;
    }
    
    if (response?.error) {
        stepTracker.updateStep('Error occurred');
        setTimeout(() => {
            stepTracker.remove();
            showNotification(`Error: ${response.error}`, 'error');
        }, 1000);
        isProcessingPaste = false;
        return;
    }
    
    if (response?.mappings) {
        stepTracker.updateStep('Filling form fields...');
        fillFormFields(response.mappings);
        stepTracker.updateStep('Complete!');
        setTimeout(() => {
            stepTracker.remove();
            showNotification('Form filled successfully!', 'success');
        }, 1000);
    } else {
        stepTracker.updateStep('Failed to process');
        setTimeout(() => {
            stepTracker.remove();
            showNotification('Failed to process paste', 'error');
        }, 1000);
    }
    isProcessingPaste = false;
}

function getAllFormFields() {
    const formFields = [];
    const forms = document.getElementsByTagName('form');
    
    for (const form of forms) {
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            formFields.push({
                id: input.id,
                name: input.name,
                type: input.type,
                placeholder: input.placeholder,
                label: findLabel(input)
            });
        });
    }
    
    return formFields;
}

// Helper function to show notifications
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        border-radius: 5px;
        z-index: 10000;
        color: white;
        background: ${type === 'success' ? '#4CAF50' : '#f44336'};
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Helper function to find label for an input
function findLabel(input) {
    const id = input.id;
    if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent;
    }
    return '';
}

// Function to fill form fields with AI-suggested mappings
function fillFormFields(mappings) {
    Object.entries(mappings).forEach(([fieldId, value]) => {
        // Handle phone number specially
        if (fieldId === 'phone') {
            // Try to find phone input by name since it might not have an ID
            const phoneInput = document.querySelector('input[name="phone"]');
            if (phoneInput) {
                // Clean the phone number (remove spaces, dashes, etc.)
                const cleanPhone = value.replace(/[^0-9+]/g, '');
                
                // Check if there's a country code selector
                const countrySelect = document.getElementById('country_code') || 
                                    document.querySelector('select[name="country_code"]');
                
                if (countrySelect) {
                    // If phone starts with +31 or 0031, select Netherlands
                    if (cleanPhone.startsWith('+31') || cleanPhone.startsWith('0031')) {
                        countrySelect.value = 'NL';
                        // Remove country code from phone number
                        phoneInput.value = cleanPhone.replace(/^\+31|^0031/, '0');
                    } else if (cleanPhone.startsWith('0')) {
                        // If starts with 0, assume it's a local number
                        countrySelect.value = 'NL'; // or get from browser locale
                        phoneInput.value = cleanPhone;
                    } else {
                        // Just set the phone number as is
                        phoneInput.value = cleanPhone;
                    }
                    
                    // Trigger change event on country select
                    countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    // No country selector, just set the phone number
                    phoneInput.value = cleanPhone;
                }
                
                // Trigger change event on phone input
                phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            // Handle all other fields normally
            const element = document.getElementById(fieldId) || 
                           document.getElementsByName(fieldId)[0];
            if (element) {
                element.value = value;
                // Trigger change event
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
} 