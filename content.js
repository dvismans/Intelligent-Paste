console.log('Content script loaded!');

// Add both event listeners at the top of the file
document.addEventListener('paste', handlePaste);
document.addEventListener('keydown', (e) => {
    // Check for Alt/Option + P
    if (e.altKey && e.code === 'KeyP') {
        e.preventDefault(); // Prevent any default behavior
        debugLog('Intelligent paste shortcut detected (Alt/Option + P)');
        
        // Read from clipboard using Clipboard API
        navigator.clipboard.read()
            .then(async clipboardItems => {
                let clipboardText = '';
                let imageBase64 = null;

                for (const item of clipboardItems) {
                    // Handle text
                    if (item.types.includes('text/plain')) {
                        const blob = await item.getType('text/plain');
                        clipboardText = await blob.text();
                    }
                    // Handle image
                    if (item.types.some(type => type.startsWith('image/'))) {
                        const imageType = item.types.find(type => type.startsWith('image/'));
                        if (imageType) {
                            const blob = await item.getType(imageType);
                            imageBase64 = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result.split(',')[1]);
                                reader.readAsDataURL(blob);
                            });
                        }
                    }
                }

                // Create a synthetic paste event
                const syntheticEvent = {
                    preventDefault: () => {},
                    clipboardData: {
                        getData: (type) => type === 'text/plain' ? clipboardText : '',
                        items: clipboardItems
                    }
                };

                // Handle the paste with our existing function
                handlePaste(syntheticEvent);
            })
            .catch(error => {
                debugLog('Error reading clipboard:', error);
                showNotification('Failed to read clipboard content', 'error');
            });
    }
});

// Remove the old paste event listener
// document.addEventListener('paste', handlePaste, true);

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

// Update the debug logging function
function debugLog(message, data = null) {
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    console.log(logMessage);
    
    // Only try to send to background if chrome.runtime is available
    if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
            action: 'debugLog',
            message: logMessage
        }).catch(() => {
            // Ignore errors if background script is not ready or disconnected
            console.log('Failed to send log to background script');
        });
    }
}

// Add this at the top of the file
let isProcessingPaste = false;

// Add this at the top of the file with other global variables
let currentFloatingWindow = null;

// Update the common styles object
const commonStyles = {
    backdrop: `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 9999;
        pointer-events: none;
    `,
    popup: `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
        overflow: hidden;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    `,
    header: `
        background: #f8f9fa;
        padding: 12px 16px;
        border-bottom: 1px solid #ddd;
        font-weight: bold;
        color: #1a1a1a;
        font-size: 14px;
    `,
    content: `
        padding: 16px;
        background: rgba(255, 255, 255, 0.95);
    `,
    message: `
        font-size: 14px;
        color: #444;
        margin-bottom: 10px;
        line-height: 1.4;
    `,
    progressContainer: `
        margin-top: 12px;
    `,
    progressBar: `
        width: 100%;
        height: 4px;
        background: #eee;
        border-radius: 4px;
        overflow: hidden;
    `,
    progressFill: `
        width: 0%;
        height: 100%;
        background: #666;
        transition: width 0.3s ease;
    `,
    filledField: `
        background-color: rgba(33, 150, 243, 0.05) !important;
        border-color: #2196F3 !important;
        box-shadow: 0 0 0 1px rgba(33, 150, 243, 0.2) !important;
        transition: all 0.3s ease !important;
    `,
    filledLabel: `
        color: #2196F3 !important;
        font-weight: bold !important;
    `,
    clipboardPreview: `
        margin-top: 8px;
        padding: 8px;
        background: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 12px;
        max-height: 100px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
    `,
    clipboardImage: `
        max-width: 100%;
        max-height: 100px;
        margin-top: 8px;
        border-radius: 4px;
        border: 1px solid #ddd;
    `,
    successIcon: `
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-right: 8px;
        vertical-align: middle;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234CAF50"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>');
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
    `,
    errorIcon: `
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-right: 8px;
        vertical-align: middle;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f44336"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>');
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
    `,
    floatingWindow: `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        width: 300px;
        max-height: 400px;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: Arial, sans-serif;
    `,
    floatingHeader: `
        padding: 12px;
        background: #f8f9fa;
        border-bottom: 1px solid #ddd;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `,
    closeButton: `
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: #666;
        font-size: 18px;
    `,
    contentSection: `
        padding: 12px;
    `,
    contentItem: `
        margin-bottom: 8px;
        padding: 8px;
        background: #f5f5f5;
        border: 1px solid #eee;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 13px;
        position: relative;
    `,
    copyIndicator: `
        position: absolute;
        top: 4px;
        right: 4px;
        background: #4CAF50;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        opacity: 0;
        transition: opacity 0.2s;
    `
};

// Update createStepTracker to include backdrop
function createStepTracker() {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = commonStyles.backdrop;
    document.body.appendChild(backdrop);

    const tracker = document.createElement('div');
    tracker.style.cssText = commonStyles.popup + 'width: 300px;';

    const header = document.createElement('div');
    header.style.cssText = commonStyles.header;
    header.textContent = 'Intelligent Paste';

    const content = document.createElement('div');
    content.style.cssText = commonStyles.content;

    const status = document.createElement('div');
    status.style.cssText = commonStyles.message;

    const clipboardPreview = document.createElement('div');
    clipboardPreview.style.display = 'none';

    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = commonStyles.progressContainer + 'display: none;';

    const progressBar = document.createElement('div');
    progressBar.style.cssText = commonStyles.progressBar;

    const progress = document.createElement('div');
    progress.style.cssText = commonStyles.progressFill;

    progressBar.appendChild(progress);
    progressContainer.appendChild(progressBar);

    content.appendChild(status);
    content.appendChild(clipboardPreview);
    content.appendChild(progressContainer);
    
    tracker.appendChild(header);
    tracker.appendChild(content);
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
        },
        showClipboardContent: (text, image) => {
            clipboardPreview.style.display = 'block';
            clipboardPreview.innerHTML = '';

            if (text) {
                const textPreview = document.createElement('div');
                textPreview.style.cssText = commonStyles.clipboardPreview;
                textPreview.textContent = text.length > 200 ? 
                    text.substring(0, 200) + '...' : text;
                clipboardPreview.appendChild(textPreview);
            }

            if (image) {
                const img = document.createElement('img');
                img.style.cssText = commonStyles.clipboardImage;
                img.src = `data:image/png;base64,${image}`;
                clipboardPreview.appendChild(img);
            }
        },
        remove: () => {
            tracker.remove();
            backdrop.remove();
        }
    };
}

// Update the captureVisibleTab function
async function captureVisibleTab() {
    try {
        debugLog('Requesting screenshot capture');
        const response = await chrome.runtime.sendMessage({ 
            action: 'captureVisibleTab' 
        });
        
        if (response.error) {
            debugLog('Screenshot capture failed:', response.error);
            return null;
        }
        
        if (!response.imageData) {
            debugLog('No screenshot data received');
            return null;
        }
        
        debugLog('Screenshot captured successfully');
        return response.imageData;
    } catch (error) {
        debugLog('Error capturing screenshot:', error);
        return null;
    }
}

// Update createFloatingClipboardWindow function
function createFloatingClipboardWindow(clipboardText, imageBase64, extractedInfo = null) {
    // Remove existing floating window if it exists
    if (currentFloatingWindow) {
        currentFloatingWindow.remove();
        currentFloatingWindow = null;
    }

    const container = document.createElement('div');
    container.style.cssText = commonStyles.floatingWindow;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = commonStyles.floatingHeader;
    
    const title = document.createElement('div');
    title.textContent = 'Clipboard Content';
    title.style.fontWeight = 'bold';
    
    const closeButton = document.createElement('button');
    closeButton.style.cssText = commonStyles.closeButton;
    closeButton.innerHTML = '×';
    closeButton.onclick = () => {
        container.remove();
        currentFloatingWindow = null;
    };
    
    header.appendChild(title);
    header.appendChild(closeButton);
    container.appendChild(header);

    // Create content section
    const content = document.createElement('div');
    content.style.cssText = commonStyles.contentSection;

    // If we have extracted info, show it first
    if (extractedInfo) {
        const extractedSection = document.createElement('div');
        extractedSection.style.marginBottom = '16px';
        
        // Show unmapped data first
        if (extractedInfo.unmappedData && typeof extractedInfo.unmappedData === 'object') {
            const unmappedTitle = document.createElement('div');
            unmappedTitle.textContent = 'Additional Information';
            unmappedTitle.style.fontWeight = 'bold';
            unmappedTitle.style.marginBottom = '8px';
            extractedSection.appendChild(unmappedTitle);

            // Log the unmapped data object
            debugLog('Rendering unmapped data:', extractedInfo.unmappedData);

            // Iterate through unmapped data
            for (const [key, value] of Object.entries(extractedInfo.unmappedData)) {
                if (!value) continue; // Skip empty values

                const item = document.createElement('div');
                item.style.cssText = commonStyles.contentItem;
                
                const valueText = document.createElement('div');
                valueText.style.display = 'flex';
                valueText.style.justifyContent = 'space-between';
                valueText.style.alignItems = 'center';
                
                const fieldLabel = document.createElement('span');
                fieldLabel.style.color = '#666';
                fieldLabel.textContent = `${key}:`;
                
                const fieldValue = document.createElement('span');
                fieldValue.style.marginLeft = '8px';
                fieldValue.style.wordBreak = 'break-all';
                fieldValue.textContent = typeof value === 'object' ? JSON.stringify(value) : value;
                
                valueText.appendChild(fieldLabel);
                valueText.appendChild(fieldValue);
                item.appendChild(valueText);
                
                const copyIndicator = document.createElement('span');
                copyIndicator.style.cssText = commonStyles.copyIndicator;
                copyIndicator.textContent = 'Copied!';
                item.appendChild(copyIndicator);

                item.onclick = async () => {
                    try {
                        const textToCopy = typeof value === 'object' ? JSON.stringify(value) : value;
                        
                        // Get the currently focused element
                        const activeElement = document.activeElement;
                        const isFormField = activeElement && 
                            (activeElement.tagName === 'INPUT' || 
                             activeElement.tagName === 'TEXTAREA' || 
                             activeElement.tagName === 'SELECT' ||
                             activeElement.isContentEditable);

                        // Copy to clipboard
                        await navigator.clipboard.writeText(textToCopy);

                        // Update the indicator text based on action
                        copyIndicator.textContent = isFormField ? 'Inserted!' : 'Copied!';
                        copyIndicator.style.opacity = '1';
                        setTimeout(() => {
                            copyIndicator.style.opacity = '0';
                        }, 1000);

                        // If a form field is focused, insert the value
                        if (isFormField) {
                            if (activeElement.tagName === 'SELECT') {
                                // For select elements, try to find matching option
                                const options = Array.from(activeElement.options);
                                const matchingOption = options.find(opt => 
                                    opt.text.toLowerCase().includes(textToCopy.toLowerCase()) ||
                                    opt.value.toLowerCase().includes(textToCopy.toLowerCase())
                                );
                                if (matchingOption) {
                                    activeElement.value = matchingOption.value;
                                }
                            } else {
                                // For other input types
                                activeElement.value = textToCopy;
                            }

                            // Trigger change event
                            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                            activeElement.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            // Add visual feedback
                            const originalBackground = activeElement.style.backgroundColor;
                            activeElement.style.backgroundColor = '#e3f2fd';
                            setTimeout(() => {
                                activeElement.style.backgroundColor = originalBackground;
                            }, 500);
                        }
                    } catch (error) {
                        console.error('Failed to copy/insert:', error);
                    }
                };
                
                item.onmouseover = () => {
                    item.style.backgroundColor = '#eee';
                };
                
                item.onmouseout = () => {
                    item.style.backgroundColor = '#f5f5f5';
                };

                extractedSection.appendChild(item);
            }
        }

        // Show mapped fields that have values
        if (extractedInfo.mappings && typeof extractedInfo.mappings === 'object') {
            const mappingsObj = extractedInfo.mappings.mappings || extractedInfo.mappings;
            const nonEmptyMappings = Object.entries(mappingsObj).filter(([_, value]) => value);

            if (nonEmptyMappings.length > 0) {
                const mappedTitle = document.createElement('div');
                mappedTitle.textContent = 'Mapped Fields';
                mappedTitle.style.fontWeight = 'bold';
                mappedTitle.style.marginTop = '16px';
                mappedTitle.style.marginBottom = '8px';
                extractedSection.appendChild(mappedTitle);

                // Iterate through non-empty mappings
                for (const [fieldId, value] of nonEmptyMappings) {
                    const item = document.createElement('div');
                    item.style.cssText = commonStyles.contentItem;
                    
                    const valueText = document.createElement('div');
                    valueText.style.display = 'flex';
                    valueText.style.justifyContent = 'space-between';
                    valueText.style.alignItems = 'center';
                    
                    const fieldLabel = document.createElement('span');
                    fieldLabel.style.color = '#666';
                    fieldLabel.textContent = `${fieldId}:`;
                    
                    const fieldValue = document.createElement('span');
                    fieldValue.style.marginLeft = '8px';
                    fieldValue.style.wordBreak = 'break-all';
                    fieldValue.textContent = typeof value === 'object' ? JSON.stringify(value) : value;
                    
                    valueText.appendChild(fieldLabel);
                    valueText.appendChild(fieldValue);
                    item.appendChild(valueText);
                    
                    const copyIndicator = document.createElement('span');
                    copyIndicator.style.cssText = commonStyles.copyIndicator;
                    copyIndicator.textContent = 'Copied!';
                    item.appendChild(copyIndicator);

                    item.onclick = async () => {
                        try {
                            const textToCopy = typeof value === 'object' ? JSON.stringify(value) : value;
                            
                            // Get the currently focused element
                            const activeElement = document.activeElement;
                            const isFormField = activeElement && 
                                (activeElement.tagName === 'INPUT' || 
                                 activeElement.tagName === 'TEXTAREA' || 
                                 activeElement.tagName === 'SELECT' ||
                                 activeElement.isContentEditable);

                            // Copy to clipboard
                            await navigator.clipboard.writeText(textToCopy);

                            // Update the indicator text based on action
                            copyIndicator.textContent = isFormField ? 'Inserted!' : 'Copied!';
                            copyIndicator.style.opacity = '1';
                            setTimeout(() => {
                                copyIndicator.style.opacity = '0';
                            }, 1000);

                            // If a form field is focused, insert the value
                            if (isFormField) {
                                if (activeElement.tagName === 'SELECT') {
                                    // For select elements, try to find matching option
                                    const options = Array.from(activeElement.options);
                                    const matchingOption = options.find(opt => 
                                        opt.text.toLowerCase().includes(textToCopy.toLowerCase()) ||
                                        opt.value.toLowerCase().includes(textToCopy.toLowerCase())
                                    );
                                    if (matchingOption) {
                                        activeElement.value = matchingOption.value;
                                    }
                                } else {
                                    // For other input types
                                    activeElement.value = textToCopy;
                                }

                                // Trigger change event
                                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                                activeElement.dispatchEvent(new Event('change', { bubbles: true }));
                                
                                // Add visual feedback
                                const originalBackground = activeElement.style.backgroundColor;
                                activeElement.style.backgroundColor = '#e3f2fd';
                                setTimeout(() => {
                                    activeElement.style.backgroundColor = originalBackground;
                                }, 500);
                            }
                        } catch (error) {
                            console.error('Failed to copy/insert:', error);
                        }
                    };
                    
                    item.onmouseover = () => {
                        item.style.backgroundColor = '#eee';
                    };
                    
                    item.onmouseout = () => {
                        item.style.backgroundColor = '#f5f5f5';
                    };

                    extractedSection.appendChild(item);
                }
            }
        }

        content.appendChild(extractedSection);
    }

    // Add original content section
    if (clipboardText || imageBase64) {
        const originalTitle = document.createElement('div');
        originalTitle.textContent = 'Original Content';
        originalTitle.style.fontWeight = 'bold';
        originalTitle.style.marginBottom = '8px';
        content.appendChild(originalTitle);

        // Add text content if available
        if (clipboardText) {
            const chunks = clipboardText.split(/[\n,]+/).filter(chunk => chunk.trim());
            chunks.forEach(chunk => {
                const item = document.createElement('div');
                item.style.cssText = commonStyles.contentItem;
                item.textContent = chunk.trim();
                
                const copyIndicator = document.createElement('span');
                copyIndicator.style.cssText = commonStyles.copyIndicator;
                copyIndicator.textContent = 'Copied!';
                item.appendChild(copyIndicator);

                item.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(chunk.trim());
                        copyIndicator.style.opacity = '1';
                        setTimeout(() => {
                            copyIndicator.style.opacity = '0';
                        }, 1000);
                    } catch (error) {
                        console.error('Failed to copy:', error);
                    }
                };
                
                item.onmouseover = () => {
                    item.style.backgroundColor = '#eee';
                };
                
                item.onmouseout = () => {
                    item.style.backgroundColor = '#f5f5f5';
                };

                content.appendChild(item);
            });
        }

        // Add image preview if available
        if (imageBase64) {
            const imageContainer = document.createElement('div');
            imageContainer.style.cssText = commonStyles.contentItem;
            
            const img = document.createElement('img');
            img.src = `data:image/png;base64,${imageBase64}`;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '4px';
            
            imageContainer.appendChild(img);
            content.appendChild(imageContainer);
        }
    }

    container.appendChild(content);
    document.body.appendChild(container);
    
    // Store reference to current window
    currentFloatingWindow = container;

    // Make the window draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.style.cursor = 'move';
    header.addEventListener('mousedown', dragStart);

    function dragStart(e) {
        initialX = e.clientX - container.offsetLeft;
        initialY = e.clientY - container.offsetTop;
        isDragging = true;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            container.style.left = `${currentX}px`;
            container.style.top = `${currentY}px`;
            container.style.bottom = 'auto';
            container.style.right = 'auto';
        }
    }

    function dragEnd() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
    }

    // Update the return value to include a reference to the window
    return {
        element: container,
        remove: () => {
            container.remove();
            currentFloatingWindow = null;
        }
    };
}

// Update the handlePaste function
async function handlePaste(e) {
    // Prevent recursive paste handling
    if (isProcessingPaste) {
        debugLog('Already processing a paste event, skipping');
        return;
    }

    // If floating window is open, let the default paste behavior happen
    if (currentFloatingWindow) {
        debugLog('Floating window is open, allowing normal paste');
        return;
    }

    let stepTracker = null;
    try {
        debugLog('Paste event captured!');
        isProcessingPaste = true;

        // First check if intelligent paste is enabled
        const result = await chrome.storage.sync.get(['intelligentPasteEnabled']);
        if (result.intelligentPasteEnabled === false) {
            debugLog('Intelligent paste is disabled');
            isProcessingPaste = false;
            return;
        }

        // Create temporary element for paste
        const tempElem = document.createElement('div');
        tempElem.contentEditable = true;
        tempElem.style.position = 'fixed';
        tempElem.style.left = '-9999px';
        document.body.appendChild(tempElem);
        tempElem.focus();

        // Get clipboard data
        let clipboardText = '';
        let imageBase64 = null;

        try {
            // Try to get text directly from clipboardData
            if (e.clipboardData) {
                debugLog('Checking clipboardData...');
                debugLog('Available types:', Array.from(e.clipboardData.types || []));
                
                clipboardText = e.clipboardData.getData('text/plain');
                debugLog('Got text from clipboardData:', clipboardText);

                // Check for images
                if (e.clipboardData.items) {
                    debugLog('Checking clipboard items:', e.clipboardData.items.length);
                    for (const item of e.clipboardData.items) {
                        debugLog('Processing item type:', item.type);
                        if (item.type.indexOf('image') !== -1) {
                            debugLog('Found image item');
                            const blob = item.getAsFile();
                            if (blob) {
                                debugLog('Got image blob');
                                imageBase64 = await new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        debugLog('Successfully read image');
                                        resolve(reader.result.split(',')[1]);
                                    };
                                    reader.onerror = (error) => {
                                        debugLog('Error reading image:', error);
                                        reject(error);
                                    };
                                    reader.readAsDataURL(blob);
                                });
                            }
                        }
                    }
                }
            }

            // If no content found, try pasting into temp element
            if (!clipboardText && !imageBase64) {
                debugLog('No content found in clipboardData, trying paste into temp element');
                document.execCommand('paste');
                clipboardText = tempElem.innerText;
                debugLog('Got text from temp element:', clipboardText);
                
                const images = tempElem.getElementsByTagName('img');
                if (images.length > 0) {
                    debugLog('Found images in temp element:', images.length);
                    const imgSrc = images[0].src;
                    if (imgSrc.startsWith('data:image')) {
                        imageBase64 = imgSrc.split(',')[1];
                        debugLog('Got image from temp element');
                    }
                }
            }
        } finally {
            tempElem.remove();
        }

        debugLog('Final clipboard content:', {
            hasText: !!clipboardText,
            hasImage: !!imageBase64,
            textLength: clipboardText?.length,
            imageSize: imageBase64?.length
        });

        if (!clipboardText && !imageBase64) {
            debugLog('No content found in clipboard data');
            showNotification('No content found in clipboard', 'error');
            isProcessingPaste = false;
            return;
        }

        // Show confirmation dialog
        if (!confirm('Would you like to use Intelligent Paste to automatically fill this form?')) {
            debugLog('User cancelled intelligent paste');
            isProcessingPaste = false;
            return;
        }

        // Prevent default paste behavior after confirmation
        e.preventDefault();

        // Create floating window with clipboard content
        const floatingWindow = createFloatingClipboardWindow(clipboardText, imageBase64);

        // Create step tracker and show progress
        stepTracker = createStepTracker();
        stepTracker.showProgress(true);
        let progress = 0;

        // Start progress animation
        const progressInterval = setInterval(() => {
            progress += 2;
            if (progress <= 90) {
                stepTracker.updateProgress(progress);
            }
        }, 100);

        try {
            // Get all form elements from the page
            const formFields = getAllFormFields();
            debugLog('Form fields captured:', formFields);
            
            if (formFields.length === 0) {
                clearInterval(progressInterval);
                debugLog('No form fields found');
                showNotification('No form fields found on page', 'error');
                stepTracker.remove();
                isProcessingPaste = false;
                return;
            }

            // Get page HTML
            const pageHtml = document.documentElement.outerHTML;
            
            // Send message to background script
            stepTracker.updateStep('Processing with AI...');
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'intelligentPaste',
                    clipboardText,
                    imageBase64,
                    formFields
                }, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(result);
                    }
                });
            });

            // Stop progress animation
            clearInterval(progressInterval);
            
            if (response?.mappings) {
                stepTracker.updateProgress(95);
                stepTracker.updateStep('Filling form fields...');
                fillFormFields(response.mappings);
                stepTracker.updateProgress(100);
                stepTracker.updateStep('Complete!');
                
                // Create new floating window with results
                const extractedWindow = createFloatingClipboardWindow(clipboardText, imageBase64, {
                    mappings: response.mappings,
                    unmappedData: response.unmappedData,
                    cost: response.cost
                });

                // Remove the progress tracker
                setTimeout(() => {
                    stepTracker.remove();
                    showNotification('Form filled successfully!', 'success');
                }, 1000);
            } else {
                throw new Error('No mappings received from AI');
            }
        } catch (error) {
            debugLog('Error processing paste:', error);
            if (stepTracker) {
                stepTracker.updateStep('Error occurred');
                setTimeout(() => stepTracker.remove(), 1000);
            }
            showNotification('Failed to process paste: ' + error.message, 'error');
        } finally {
            isProcessingPaste = false;
        }
    } catch (error) {
        debugLog('Critical error in paste handler:', error.message || error);
        if (stepTracker) {
            stepTracker.updateStep('Error occurred');
            setTimeout(() => stepTracker.remove(), 1000);
        }
        showNotification('Extension error. Please refresh the page.', 'error');
        isProcessingPaste = false;
        // Don't remove the floating window on error
    } finally {
        // Ensure flag is reset even if something unexpected happens
        setTimeout(() => {
            isProcessingPaste = false;
            debugLog('Paste processing flag reset');
        }, 1500); // Give enough time for notifications to show
    }
}

function getAllFormFields() {
    const formFields = [];
    debugLog('=== Form Fields Detection ===');
    
    // First try to find actual form elements
    const forms = document.getElementsByTagName('form');
    debugLog(`Found ${forms.length} form elements`);

    if (forms.length > 0) {
        // If we found forms, only look for fields inside them
        for (const form of forms) {
            debugLog('Processing form:', {
                id: form.id,
                class: form.className,
                action: form.action
            });

            const formInputs = form.querySelectorAll(
                'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
                'textarea, ' +
                'select'
            );

            debugLog(`Found ${formInputs.length} input fields in form`);
            processInputs(formInputs, formFields);
        }
    } else {
        // Only if no forms found, look for inputs anywhere in the document
        debugLog('No form elements found, searching entire document');
        
        // Generic selectors for form fields
        const selectors = [
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
            'textarea',
            'select',
            '[contenteditable="true"]',
            '[role="textbox"]',
            '[role="combobox"]',
            '[role="spinbutton"]',
            '[data-input]',
            '[data-field]',
            'input[type="number"]'
        ];

        debugLog('Searching with selectors:', selectors);
        const allInputs = document.querySelectorAll(selectors.join(','));
        debugLog(`Found ${allInputs.length} potential input fields in document`);
        processInputs(allInputs, formFields);
    }

    debugLog('Total fields detected:', formFields.length);
    debugLog('Form fields collection:', formFields);
    
    return formFields;
}

function processInputs(inputs, formFields) {
    debugLog('=== Processing Form Fields ===');
    inputs.forEach(input => {
        // Check if input is inside a form
        const isInForm = input.closest('form') !== null;
        
        // Get all possible identifiers
        const identifiers = {
            id: input.id,
            name: input.name,
            'data-field': input.getAttribute('data-field'),
            'data-input': input.getAttribute('data-input'),
            'data-test-id': input.getAttribute('data-test-id'),
            'aria-label': input.getAttribute('aria-label'),
            role: input.getAttribute('role'),
            class: input.className,
            tagName: input.tagName.toLowerCase()
        };

        // If in a form, require at least an id or name
        if (isInForm && !input.id && !input.name) {
            debugLog('Skipping form field without id or name:', {
                element: input.tagName,
                type: input.type,
                identifiers
            });
            return;
        }

        // Get all possible labels
        const label = findLabel(input) || 
                     input.getAttribute('aria-label') || 
                     input.getAttribute('placeholder') ||
                     input.getAttribute('title') ||
                     input.getAttribute('data-label');

        // Log detailed field information
        debugLog('Found field:', {
            element: input.tagName,
            type: input.type || input.getAttribute('type') || 'text',
            identifiers,
            label,
            value: input.value,
            isVisible: isElementVisible(input),
            path: getElementPath(input),
            isInForm
        });

        const fieldInfo = {
            id: identifiers.id || input.name, // Use name as fallback for id
            name: input.name,
            type: input.type || input.getAttribute('type') || 'text',
            placeholder: input.placeholder,
            label: label,
            isInForm,
            identifiers: Object.fromEntries(
                Object.entries(identifiers).filter(([_, v]) => v)
            )
        };

        formFields.push(fieldInfo);
    });

    debugLog('Processed form fields:', formFields);
}

// Helper function to check if element is visible
function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0';
}

// Helper function to get element's path
function getElementPath(element) {
    const path = [];
    let currentNode = element;
    
    while (currentNode) {
        let selector = currentNode.tagName.toLowerCase();
        if (currentNode.id) {
            selector += `#${currentNode.id}`;
        } else if (currentNode.className) {
            selector += `.${currentNode.className.split(' ').join('.')}`;
        }
        path.unshift(selector);
        currentNode = currentNode.parentElement;
    }
    
    return path.join(' > ');
}

// Enhanced label finding function
function findLabel(input) {
    // Try multiple methods to find a label
    const methods = [
        // Method 1: Standard label[for] attribute
        () => input.id && document.querySelector(`label[for="${input.id}"]`)?.textContent,
        
        // Method 2: Wrapping label
        () => input.closest('label')?.textContent,
        
        // Method 3: Preceding label or text
        () => {
            const previous = input.previousElementSibling;
            if (previous?.tagName === 'LABEL' || previous?.classList.contains('label')) {
                return previous.textContent;
            }
            return null;
        },
        
        // Method 4: Nearby label in parent container
        () => {
            const container = input.closest('div,span,p');
            return container?.querySelector('label,span.label')?.textContent;
        },
        
        // Method 5: aria-labelledby
        () => {
            const labelledBy = input.getAttribute('aria-labelledby');
            return labelledBy && document.getElementById(labelledBy)?.textContent;
        }
    ];

    // Try each method until we find a label
    for (const method of methods) {
        const label = method();
        if (label) {
            return label.trim();
        }
    }

    return '';
}

// Update showNotification function
function showNotification(message, type) {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = commonStyles.backdrop;
    document.body.appendChild(backdrop);

    const notification = document.createElement('div');
    notification.style.cssText = commonStyles.popup + 'width: 300px;';

    const header = document.createElement('div');
    header.style.cssText = commonStyles.header;
    header.textContent = 'Intelligent Paste';

    const content = document.createElement('div');
    content.style.cssText = commonStyles.content;

    const messageContainer = document.createElement('div');
    messageContainer.style.cssText = commonStyles.message + 'white-space: pre-wrap; display: flex; align-items: flex-start;';

    // Add icon
    const icon = document.createElement('span');
    icon.style.cssText = type === 'success' ? commonStyles.successIcon : commonStyles.errorIcon;
    messageContainer.appendChild(icon);

    const messageText = document.createElement('span');
    messageText.textContent = message;
    messageText.style.color = type === 'success' ? '#333' : '#f44336'; // Normal color for success
    messageContainer.appendChild(messageText);

    content.appendChild(messageContainer);
    notification.appendChild(header);
    notification.appendChild(content);
    document.body.appendChild(notification);
    
    // Remove backdrop immediately after showing notification
    setTimeout(() => {
        backdrop.remove();
    }, 100);

    // Keep the notification visible for longer
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Update fillFormFields function to handle the mappings directly
function fillFormFields(mappings) {
    debugLog('Attempting to fill fields with mappings:', mappings);
    
    // Keep track of filled fields for cleanup
    const filledFields = [];

    // Ensure mappings is not wrapped in another object
    const actualMappings = mappings.mappings || mappings;

    Object.entries(actualMappings).forEach(([fieldId, value]) => {
        debugLog(`Trying to fill field "${fieldId}" with value:`, value);
        
        // Try to find the field using multiple selectors
        const element = 
            document.getElementById(fieldId) || 
            document.getElementsByName(fieldId)[0] ||
            document.querySelector(`[data-field="${fieldId}"]`) ||
            document.querySelector(`[data-test-id="${fieldId}"]`) ||
            document.querySelector(`input[name="${fieldId}"]`) ||
            document.querySelector(`[data-name="${fieldId}"]`) ||
            document.querySelector(`[aria-label="${fieldId}"]`);

        if (element) {
            debugLog(`Found element for "${fieldId}":`, {
                tagName: element.tagName,
                type: element.type,
                currentValue: element.value
            });

            // Special handling for phone fields
            if (fieldId === 'phone' || element.type === 'tel') {
                const cleanPhone = value.replace(/[^0-9+]/g, '');
                element.value = cleanPhone;
            } else {
                element.value = value;
            }

            // Trigger all relevant events
            ['focus', 'input', 'change', 'blur'].forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            // Highlight the field and its label
            highlightField(element);
            
            // Also highlight any associated labels
            const labels = [
                ...Array.from(document.querySelectorAll(`label[for="${element.id}"]`)),
                element.closest('label'),
                element.parentElement?.querySelector('label')
            ].filter(Boolean);

            labels.forEach(label => {
                label.style.cssText += commonStyles.filledLabel;
                filledFields.push(label);
            });

            filledFields.push(element);
            debugLog(`Successfully filled "${fieldId}" with value:`, value);
        } else {
            debugLog(`Could not find element for "${fieldId}". Available fields:`, 
                Array.from(document.querySelectorAll('input, select, textarea')).map(input => ({
                    id: input.id,
                    name: input.name,
                    type: input.type,
                    'data-field': input.getAttribute('data-field'),
                    'aria-label': input.getAttribute('aria-label')
                }))
            );
        }
    });

    debugLog(`Filled ${filledFields.length} fields out of ${Object.keys(actualMappings).length} mappings`);

    // Remove highlights after 3 seconds
    setTimeout(() => {
        filledFields.forEach(element => {
            if (element.tagName === 'LABEL') {
                element.style.cssText = element.dataset.originalStyle || '';
            } else {
                removeHighlight(element);
            }
        });
    }, 3000);
}

// Function to highlight a filled field
function highlightField(element) {
    // Save original styles
    element.dataset.originalStyle = element.style.cssText;
    
    // Add highlight styles to the field
    element.style.cssText += commonStyles.filledField;

    // Find and highlight the label if it exists
    const label = findLabelForElement(element);
    if (label) {
        label.dataset.originalStyle = label.style.cssText;
        label.style.cssText += commonStyles.filledLabel;
    }
}

// Function to remove highlight
function removeHighlight(element) {
    // Restore original styles with smooth transition
    if (element.dataset.originalStyle !== undefined) {
        element.style.cssText = element.dataset.originalStyle;
        delete element.dataset.originalStyle;
    }

    // Remove highlight from label
    const label = findLabelForElement(element);
    if (label && label.dataset.originalStyle !== undefined) {
        label.style.cssText = label.dataset.originalStyle;
        delete label.dataset.originalStyle;
    }
}

// Helper function to find label for an element
function findLabelForElement(element) {
    // Try to find label by for attribute
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return label;
    }

    // Try to find label as parent
    let parent = element.parentElement;
    while (parent) {
        if (parent.tagName === 'LABEL') {
            return parent;
        }
        parent = parent.parentElement;
    }

    // Try to find label as sibling
    const siblings = element.parentElement?.children || [];
    for (const sibling of siblings) {
        if (sibling.tagName === 'LABEL') {
            return sibling;
        }
    }

    return null;
}

// Update the keyboard shortcut handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'intelligent-paste') {
        // Read from clipboard using Clipboard API
        navigator.clipboard.read()
            .then(async clipboardItems => {
                let clipboardText = '';
                let imageBase64 = null;

                for (const item of clipboardItems) {
                    // Handle text
                    if (item.types.includes('text/plain')) {
                        const blob = await item.getType('text/plain');
                        clipboardText = await blob.text();
                    }
                    // Handle image
                    if (item.types.some(type => type.startsWith('image/'))) {
                        const imageType = item.types.find(type => type.startsWith('image/'));
                        if (imageType) {
                            const blob = await item.getType(imageType);
                            imageBase64 = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result.split(',')[1]);
                                reader.readAsDataURL(blob);
                            });
                        }
                    }
                }

                // Create a synthetic paste event
                const syntheticEvent = {
                    preventDefault: () => {},
                    clipboardData: {
                        getData: (type) => type === 'text/plain' ? clipboardText : '',
                        items: clipboardItems
                    }
                };

                // Handle the paste with our existing function
                handlePaste(syntheticEvent);
            })
            .catch(error => {
                debugLog('Error reading clipboard:', error);
                showNotification('Failed to read clipboard content', 'error');
            });
    }
}); 

// Update the message listener in content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'run-intelligent-paste') {
        // Create a synthetic paste event
        const syntheticEvent = {
            preventDefault: () => {},
            clipboardData: null  // We'll get this from the clipboard API
        };

        // Read from clipboard using Clipboard API
        navigator.clipboard.read()
            .then(async clipboardItems => {
                let clipboardText = '';
                let imageBase64 = null;

                for (const item of clipboardItems) {
                    // Handle text
                    if (item.types.includes('text/plain')) {
                        const blob = await item.getType('text/plain');
                        clipboardText = await blob.text();
                    }
                    // Handle image
                    if (item.types.some(type => type.startsWith('image/'))) {
                        const imageType = item.types.find(type => type.startsWith('image/'));
                        if (imageType) {
                            const blob = await item.getType(imageType);
                            imageBase64 = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result.split(',')[1]);
                                reader.readAsDataURL(blob);
                            });
                        }
                    }
                }

                // Update the synthetic event with clipboard data
                syntheticEvent.clipboardData = {
                    getData: (type) => type === 'text/plain' ? clipboardText : '',
                    items: clipboardItems
                };

                // Handle the paste with our existing function
                handlePaste(syntheticEvent);
            })
            .catch(error => {
                debugLog('Error reading clipboard:', error);
                showNotification('Failed to read clipboard content', 'error');
            });
    }
}); 