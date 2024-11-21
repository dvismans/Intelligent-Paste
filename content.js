console.log('Content script loaded!');

// Global variables
let isProcessingPaste = false;
let currentFloatingWindow = null;
let lastFocusedElement = null;
let lastFocusedTextElement = null;
let lastFocusedElementValue = null;

// Add this shared function for clipboard reading
async function readClipboardContent() {
	debugLog('Reading clipboard content...');
	try {
		const [text, items] = await Promise.all([
			navigator.clipboard.readText().catch(() => ''),
			navigator.clipboard.read().catch(() => []),
		]);

		let clipboardText = text;
		let imageBase64 = null;

		// Try to extract image from clipboard items
		if (items && items.length > 0) {
			for (const item of items) {
				try {
					if (item.types && Array.isArray(item.types)) {
						for (const type of item.types) {
							if (type && type.startsWith('image/')) {
								const blob = await item.getType(type);
								imageBase64 = await new Promise((resolve) => {
									const reader = new FileReader();
									reader.onload = () => resolve(reader.result.split(',')[1]);
									reader.readAsDataURL(blob);
								});
								break;
							}
						}
					}
				} catch (error) {
					debugLog('Error processing clipboard item:', error);
				}
			}
		}

		debugLog('Clipboard content read:', {
			hasText: !!clipboardText,
			hasImage: !!imageBase64,
		});

		return { clipboardText, imageBase64, items };
	} catch (error) {
		debugLog('Error reading clipboard:', error);
		throw new Error('Failed to read clipboard content');
	}
}

// Update the message listeners to use the shared function
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (
		request.action === 'intelligent-paste' ||
		request.action === 'run-intelligent-paste'
	) {
		// Get all form fields first
		const formFields = getAllFormFields();
		if (!formFields || formFields.length === 0) {
			showNotification('No form fields found on page', 'error');
			return;
		}

		// Read clipboard and handle paste
		readClipboardContent()
			.then(({ clipboardText, imageBase64, items }) => {
				if (clipboardText || imageBase64) {
					const syntheticEvent = {
						preventDefault: () => {},
						clipboardData: {
							getData: (type) => (type === 'text/plain' ? clipboardText : ''),
							items: items,
						},
					};
					handlePaste(syntheticEvent);
				} else {
					showNotification(
						'No content found in clipboard. Please copy some text or image first.',
						'error'
					);
				}
			})
			.catch((error) => {
				debugLog('Error handling clipboard:', error);
				showNotification(
					'Failed to read clipboard content. Please try copying again.',
					'error'
				);
			});
	}
});

// Remove the old keydown event listener since we're removing Alt+P functionality

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

			types.forEach((type) => {
				const data = e.clipboardData.getData(type);
				debugLog(`Fallback data for ${type}:`, data);
			});
		}
	}
}

// Update the debug logging function
function debugLog(message, data = null) {
	const timestamp = new Date().toISOString();
	const logMessage = data
		? `${timestamp} - ${message} ${JSON.stringify(data, null, 2)}`
		: `${timestamp} - ${message}`;
	console.log(logMessage);
}

// Move commonStyles to the top of the file
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
        margin-bottom: 4px;
        padding: 8px;
        background: #f5f5f5;
        border: 1px solid #eee;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
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
    `,
};

// Update createStepTracker to include backdrop
function createStepTracker() {
	const backdrop = document.createElement('div');
	backdrop.style.cssText = commonStyles.backdrop;
	document.body.appendChild(backdrop);

	const tracker = document.createElement('div');
	tracker.style.cssText = commonStyles.popup + 'width: 400px;';

	const header = document.createElement('div');
	header.style.cssText =
		commonStyles.header +
		`
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

	const title = document.createElement('div');
	title.textContent = 'Intelligent Paste';
	title.style.fontWeight = 'bold';

	const cancelButton = document.createElement('button');
	cancelButton.textContent = '×';
	cancelButton.style.cssText = `
        background: none;
        border: none;
        color: #666;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
    `;
	cancelButton.onclick = () => {
		window.intelligentPasteCancelled = true;
		tracker.remove();
		backdrop.remove();
		showNotification('Processing cancelled', 'error');
	};

	header.appendChild(title);
	header.appendChild(cancelButton);

	const content = document.createElement('div');
	content.style.cssText = commonStyles.content;

	const status = document.createElement('div');
	status.style.cssText = commonStyles.message;

	// Add clipboard content preview in a more compact way
	const previewContainer = document.createElement('div');
	previewContainer.style.cssText = `
        margin: 8px 0;
        position: relative;
        background: #f8f9fa;
        border-radius: 4px;
        border: 1px solid #eee;
    `;

	const preview = document.createElement('div');
	preview.style.cssText = `
        padding: 8px;
        font-size: 12px;
        font-family: monospace;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 100px;
        overflow-y: auto;
        position: relative;
    `;

	// Add copy button that floats over the content
	const copyButton = document.createElement('button');
	copyButton.textContent = 'Copy';
	copyButton.style.cssText = `
        position: absolute;
        top: 4px;
        right: 4px;
        padding: 2px 6px;
        background: rgba(33, 150, 243, 0.9);
        color: white;
        border: none;
        border-radius: 3px;
        font-size: 11px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 1;
    `;
	copyButton.onclick = async () => {
		const text = preview.textContent;
		await navigator.clipboard.writeText(text);
		showFeedback(previewContainer, 'Copied!');
	};

	// Show/hide copy button on hover
	previewContainer.addEventListener('mouseenter', () => {
		copyButton.style.opacity = '1';
	});
	previewContainer.addEventListener('mouseleave', () => {
		copyButton.style.opacity = '0';
	});

	previewContainer.appendChild(preview);
	previewContainer.appendChild(copyButton);

	// Add image preview with similar floating copy button
	const imagePreview = document.createElement('div');
	imagePreview.style.cssText = `
        margin-top: 8px;
        position: relative;
        display: none;
    `;

	const img = document.createElement('img');
	img.style.cssText = `
        max-width: 100%;
        max-height: 100px;
        object-fit: contain;
        border-radius: 4px;
    `;

	const imageCopyButton = document.createElement('button');
	imageCopyButton.textContent = 'Copy Image';
	imageCopyButton.style.cssText = copyButton.style.cssText;
	imageCopyButton.onclick = async () => {
		try {
			const response = await fetch(img.src);
			const blob = await response.blob();
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob }),
			]);
			showFeedback(imagePreview, 'Copied!');
		} catch (error) {
			showFeedback(imagePreview, 'Failed to copy', 'error');
		}
	};

	imagePreview.appendChild(img);
	imagePreview.appendChild(imageCopyButton);

	// Show/hide image copy button on hover
	imagePreview.addEventListener('mouseenter', () => {
		imageCopyButton.style.opacity = '1';
	});
	imagePreview.addEventListener('mouseleave', () => {
		imageCopyButton.style.opacity = '0';
	});

	const progressContainer = document.createElement('div');
	progressContainer.style.cssText = commonStyles.progressContainer;

	const progressBar = document.createElement('div');
	progressBar.style.cssText = commonStyles.progressBar;

	const progress = document.createElement('div');
	progress.style.cssText = commonStyles.progressFill;

	progressBar.appendChild(progress);
	progressContainer.appendChild(progressBar);

	content.appendChild(status);
	content.appendChild(previewContainer);
	content.appendChild(imagePreview);
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
			if (text) {
				preview.textContent =
					text.length > 500 ? text.substring(0, 500) + '...' : text;
				previewContainer.style.display = 'block';
			} else {
				previewContainer.style.display = 'none';
			}
			if (image) {
				img.src = `data:image/png;base64,${image}`;
				imagePreview.style.display = 'block';
			} else {
				imagePreview.style.display = 'none';
			}
		},
		remove: () => {
			tracker.remove();
			backdrop.remove();
		},
	};
}

// Update the captureVisibleTab function
async function captureVisibleTab() {
	try {
		debugLog('Requesting screenshot capture');
		const response = await chrome.runtime.sendMessage({
			action: 'captureVisibleTab',
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
function createFloatingClipboardWindow(
	clipboardText,
	imageBase64,
	extractedInfo = null
) {
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
	title.textContent = 'Intelligent Paste Results';
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
		// Mapped Fields Section
		if (
			extractedInfo.mappings &&
			Object.keys(extractedInfo.mappings).length > 0
		) {
			const mappedSection = document.createElement('div');
			mappedSection.style.marginBottom = '16px';

			const mappedTitle = document.createElement('div');
			mappedTitle.textContent = 'Mapped Fields';
			mappedTitle.style.cssText =
				'font-weight: bold; margin-bottom: 8px; color: #2196F3;';
			mappedSection.appendChild(mappedTitle);

			Object.entries(extractedInfo.mappings).forEach(([fieldId, data]) => {
				const value = typeof data === 'object' ? data.value : data;
				const confidence = typeof data === 'object' ? data.index : 90;

				createContentItem(
					mappedSection,
					fieldId,
					value,
					confidence,
					true // is mapped field
				);
			});

			content.appendChild(mappedSection);
		}

		// Unmapped Data Section
		if (
			extractedInfo.unmappedData &&
			Object.keys(extractedInfo.unmappedData).length > 0
		) {
			const unmappedSection = document.createElement('div');
			unmappedSection.style.marginBottom = '16px';

			const unmappedTitle = document.createElement('div');
			unmappedTitle.textContent = 'Additional Information';
			unmappedTitle.style.cssText =
				'font-weight: bold; margin-bottom: 8px; color: #666;';
			unmappedSection.appendChild(unmappedTitle);

			Object.entries(extractedInfo.unmappedData).forEach(([key, data]) => {
				const value = typeof data === 'object' ? data.value : data;
				const confidence = typeof data === 'object' ? data.index : 50;

				createContentItem(
					unmappedSection,
					key,
					value,
					confidence,
					false // is unmapped field
				);
			});

			content.appendChild(unmappedSection);
		}
	}

	// Add original content section if available
	if (clipboardText || imageBase64) {
		const originalSection = document.createElement('div');
		const originalTitle = document.createElement('div');
		originalTitle.textContent = 'Original Content';
		originalTitle.style.cssText =
			'font-weight: bold; margin: 16px 0 8px 0; color: #666;';
		originalSection.appendChild(originalTitle);

		if (clipboardText) {
			createContentItem(
				originalSection,
				'Clipboard Text',
				clipboardText,
				null,
				false
			);
		}

		if (imageBase64) {
			const imageContainer = document.createElement('div');
			imageContainer.style.cssText = commonStyles.contentItem;
			const img = document.createElement('img');
			img.src = `data:image/png;base64,${imageBase64}`;
			img.style.maxWidth = '100%';
			img.style.borderRadius = '4px';
			imageContainer.appendChild(img);
			originalSection.appendChild(imageContainer);
		}

		content.appendChild(originalSection);
	}

	container.appendChild(content);
	document.body.appendChild(container);

	// Make window draggable
	makeWindowDraggable(container, header);

	return {
		element: container,
		remove: () => {
			container.remove();
			currentFloatingWindow = null;
		},
	};
}

// Helper function to create content items
function createContentItem(
	parent,
	label,
	value,
	confidence = null,
	isMapped = false
) {
	const item = document.createElement('div');
	item.style.cssText = `
        position: relative;
        margin-bottom: 4px;
        padding: 8px;
        background: ${isMapped ? '#f3f9ff' : '#f5f5f5'};
        border: 1px solid ${isMapped ? '#e3f2fd' : '#eee'};
        border-radius: 4px;
        transition: background-color 0.2s;
    `;

	// Main content container
	const contentContainer = document.createElement('div');
	contentContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding-right: ${
					confidence !== null ? '40px' : '0'
				}; // Space for confidence indicator
    `;

	// Label and value
	const textContent = document.createElement('div');
	textContent.style.cssText = 'flex: 1; min-width: 0;';

	const labelElement = document.createElement('span');
	labelElement.style.cssText =
		'font-weight: bold; color: #666; margin-right: 8px;';
	labelElement.textContent = label + ':';
	textContent.appendChild(labelElement);

	const valueElement = document.createElement('span');
	valueElement.style.cssText = 'word-break: break-word; color: #333;';
	valueElement.textContent = value;
	textContent.appendChild(valueElement);

	contentContainer.appendChild(textContent);

	// Add confidence indicator if available
	if (confidence !== null) {
		const confidenceIndicator = document.createElement('span');
		confidenceIndicator.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 11px;
            background: ${getConfidenceColor(confidence)};
            color: white;
        `;
		confidenceIndicator.textContent = `${confidence}%`;
		item.appendChild(confidenceIndicator);
	}

	// Action buttons container (floating)
	const actions = document.createElement('div');
	actions.className = 'action-container';
	actions.dataset.value = value;
	actions.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        padding: 0 8px;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s;
        background: linear-gradient(to left, ${
					isMapped ? '#f3f9ff' : '#f5f5f5'
				} 70%, transparent);
    `;

	// Copy button
	const copyButton = createActionButton('Copy', () => {
		navigator.clipboard.writeText(value);
		showFeedback(item, 'Copied!');
	});
	actions.appendChild(copyButton);

	// Create insert button if we have a focused field
	const createInsertButton = () => {
		// Use the text input field if available, otherwise use the last focused field
		const targetElement = lastFocusedTextElement || lastFocusedElement;

		if (targetElement && isValidFormField(targetElement)) {
			const insertButton = createActionButton('Insert', () => {
				// Get the current focused element at click time
				const currentFocused = document.activeElement;
				const targetToUse = lastFocusedTextElement || currentFocused;

				debugLog('Insert clicked:', {
					lastFocusedText: lastFocusedTextElement?.tagName,
					currentFocused: currentFocused?.tagName,
					targetToUse: targetToUse?.tagName,
				});

				if (targetToUse && isValidFormField(targetToUse)) {
					insertValueIntoField(targetToUse, value);
					showFeedback(item, 'Inserted!');
				} else {
					debugLog('No valid target field found');
					showFeedback(item, 'Please click a text field first', 'error');
				}
			});
			insertButton.className = 'insert-button';
			return insertButton;
		}
		return null;
	};

	// Initial insert button if needed
	const insertButton = createInsertButton();
	if (insertButton) {
		actions.appendChild(insertButton);
	}

	// Update insert button visibility on hover
	item.addEventListener('mouseenter', () => {
		const existingInsertButton = actions.querySelector('.insert-button');
		if (!existingInsertButton) {
			const newInsertButton = createInsertButton();
			if (newInsertButton) {
				actions.appendChild(newInsertButton);
			}
		}
		actions.style.opacity = '1';
		item.style.backgroundColor = isMapped ? '#e3f2fd' : '#eee';
	});

	item.addEventListener('mouseleave', () => {
		actions.style.opacity = '0';
		item.style.backgroundColor = isMapped ? '#f3f9ff' : '#f5f5f5';
	});

	item.appendChild(contentContainer);
	item.appendChild(actions);

	parent.appendChild(item);
	return item;
}

// Update createActionButton function
function createActionButton(text, onClick) {
	const button = document.createElement('button');
	button.style.cssText = `
        padding: 2px 6px;
        border: none;
        border-radius: 3px;
        background: #2196F3;
        color: white;
        cursor: pointer;
        font-size: 11px;
        transition: background-color 0.2s;
        white-space: nowrap;
    `;
	button.textContent = text;
	button.type = 'button'; // Prevent form submission
	button.onclick = (e) => {
		e.preventDefault(); // Prevent any default behavior
		e.stopPropagation(); // Stop event bubbling
		onClick();
	};

	// Prevent focus tracking on the button itself
	button.addEventListener('focus', (e) => {
		e.stopPropagation();
	});

	return button;
}

// Helper function to show feedback
function showFeedback(item, message, type = 'success') {
	const feedback = document.createElement('div');
	feedback.style.cssText = `
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        background: ${type === 'success' ? '#4CAF50' : '#FF9800'};
        color: white;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 1000;
    `;
	feedback.textContent = message;
	item.appendChild(feedback);

	requestAnimationFrame(() => {
		feedback.style.opacity = '1';
		setTimeout(() => {
			feedback.style.opacity = '0';
			setTimeout(() => feedback.remove(), 200);
		}, 1500);
	});
}

// Helper function to get confidence color
function getConfidenceColor(confidence) {
	if (confidence >= 90) return '#2196F3';
	if (confidence >= 70) return '#4CAF50';
	if (confidence >= 40) return '#FF9800';
	return '#757575';
}

// Update the focus tracking event listeners
document.addEventListener('focusin', (e) => {
	if (e.target.tagName === 'BUTTON' || !isValidFormField(e.target)) {
		return;
	}

	lastFocusedElement = e.target;

	// Track text/textarea fields separately
	if (isTextInputField(e.target)) {
		lastFocusedTextElement = e.target;
	}

	debugLog('Element focused:', {
		tagName: e.target.tagName,
		type: e.target.type,
		id: e.target.id,
		name: e.target.name,
		className: e.target.className,
		isFocused: document.activeElement === e.target,
		isTextInput: isTextInputField(e.target),
	});

	// Update insert buttons immediately
	if (currentFloatingWindow) {
		updateInsertButtons();
	}
});

// Add helper function to check if element is a text input
function isTextInputField(element) {
	return (
		element &&
		(element.tagName === 'TEXTAREA' ||
			(element.tagName === 'INPUT' &&
				(element.type === 'text' ||
					element.type === 'search' ||
					element.type === 'url' ||
					element.type === 'tel' ||
					element.type === 'email' ||
					!element.type)) || // Defaults to text
			element.isContentEditable ||
			element.getAttribute('contenteditable') === 'true')
	);
}

// Update the insertValueIntoField function
function insertValueIntoField(field, value) {
	debugLog('Attempting to insert value:', {
		field: {
			tagName: field.tagName,
			type: field.type,
			id: field.id,
			name: field.name,
			isFocused: document.activeElement === field,
		},
		value,
	});

	if (!field || !field.isConnected) {
		debugLog('Error: Invalid or disconnected field');
		return false;
	}

	try {
		// Ensure field has focus
		if (document.activeElement !== field) {
			field.focus();
			// Verify focus was gained
			if (document.activeElement !== field) {
				debugLog('Error: Could not focus field');
				return false;
			}
		}

		// Set the value based on field type
		if (field.tagName === 'TEXTAREA') {
			const start = field.selectionStart;
			const end = field.selectionEnd;
			const currentValue = field.value;

			if (typeof start === 'number' && typeof end === 'number') {
				field.value =
					currentValue.substring(0, start) +
					value +
					currentValue.substring(end);
				field.selectionStart = field.selectionEnd = start + value.length;
			} else {
				field.value = value;
			}
		} else {
			field.value = value.toString();
		}

		// Trigger events
		['input', 'change'].forEach((eventType) => {
			field.dispatchEvent(new Event(eventType, { bubbles: true }));
		});

		// Keep focus on the field
		field.focus();

		debugLog('Value inserted successfully:', {
			newValue: field.value,
			isFocused: document.activeElement === field,
		});

		highlightField(field, 'success');
		return true;
	} catch (error) {
		debugLog('Error inserting value:', error);
		highlightField(field, 'error');
		return false;
	}
}

// Update validateElementValue function
function validateElementValue(element, expectedValue) {
	const currentValue = getElementValue(element);

	// Handle empty values
	if (!currentValue && expectedValue) {
		return false;
	}

	// For select elements, check both value and text
	if (element.tagName === 'SELECT') {
		return (
			element.value &&
			(element.value
				.toLowerCase()
				.includes(expectedValue.toString().toLowerCase()) ||
				element.options[element.selectedIndex]?.text
					.toLowerCase()
					.includes(expectedValue.toString().toLowerCase()))
		);
	}

	// For other elements, do a direct comparison
	return (
		currentValue.toString().toLowerCase() ===
		expectedValue.toString().toLowerCase()
	);
}

// Update the handlePaste function to check for cancellation
async function handlePaste(e) {
	window.intelligentPasteCancelled = false;

	if (isProcessingPaste) {
		debugLog('Already processing a paste event, skipping');
		return;
	}

	let stepTracker = null;
	try {
		debugLog('Paste event captured!');
		isProcessingPaste = true;

		stepTracker = createStepTracker();
		stepTracker.showProgress(true);
		stepTracker.updateStep('Detecting form fields...');
		let progress = 0;

		const formFields = getAllFormFields();
		if (!formFields || formFields.length === 0) {
			stepTracker.updateStep('❌ No form fields found on page');
			setTimeout(() => stepTracker.remove(), 2000);
			isProcessingPaste = false;
			return;
		}

		stepTracker.updateStep(`Found ${formFields.length} form fields`);
		10;
		stepTracker.updateProgress(progress);

		stepTracker.updateStep('Reading clipboard content...');
		let clipboardText = '';
		let imageBase64 = null;

		try {
			const [text, items] = await Promise.all([
				navigator.clipboard.readText().catch(() => ''),
				navigator.clipboard.read().catch(() => []),
			]);

			clipboardText = text;
			if (clipboardText) {
				stepTracker.updateStep('Found text in clipboard');
			}
			progress = 20;
			stepTracker.updateProgress(progress);

			if (items && items.length > 0) {
				stepTracker.updateStep('Checking for images in clipboard...');
				for (const item of items) {
					if (item.types) {
						for (const type of item.types) {
							if (type && type.startsWith('image/')) {
								stepTracker.updateStep('Processing image from clipboard...');
								const blob = await item.getType(type);
								imageBase64 = await new Promise((resolve) => {
									const reader = new FileReader();
									reader.onload = () => resolve(reader.result.split(',')[1]);
									reader.readAsDataURL(blob);
								});
								stepTracker.updateStep('Successfully extracted image');
								break;
							}
						}
					}
				}
				progress = 30;
				stepTracker.updateProgress(progress);
			}
		} catch (error) {
			debugLog('Error accessing clipboard:', error);
		}

		if (!clipboardText && !imageBase64) {
			stepTracker.updateStep('❌ No content found in clipboard');
			setTimeout(() => stepTracker.remove(), 2000);
			isProcessingPaste = false;
			return;
		}

		if (clipboardText || imageBase64) {
			stepTracker.showClipboardContent(clipboardText, imageBase64);
		}

		if (window.intelligentPasteCancelled) {
			throw new Error('Processing cancelled by user');
		}

		stepTracker.updateStep('Preparing content for AI analysis...');
		progress = 40;
		stepTracker.updateProgress(progress);

		if (window.intelligentPasteCancelled) {
			throw new Error('Processing cancelled by user');
		}

		stepTracker.updateStep('Sending to OpenAI for analysis...');
		progress = 60;
		stepTracker.updateProgress(progress);

		const response = await chrome.runtime.sendMessage({
			action: 'intelligentPaste',
			clipboardText,
			formFields,
			imageBase64,
		});

		if (response?.mappings) {
			const mappedFieldCount = Object.keys(response.mappings).length;
			const unmappedDataCount = Object.keys(response.unmappedData || {}).length;

			stepTracker.updateStep(
				`AI identified ${mappedFieldCount} field matches and ${unmappedDataCount} additional data points`
			);
			progress = 80;
			stepTracker.updateProgress(progress);

			stepTracker.updateStep('Filling form fields...');
			progress = 90;
			stepTracker.updateProgress(progress);

			fillFormFields(response.mappings);

			progress = 100;
			stepTracker.updateProgress(progress);
			stepTracker.updateStep(
				'✅ Processing complete! Form filled successfully.'
			);

			// Wait a moment to show success before removing progress window
			setTimeout(() => {
				stepTracker.remove();
				createFloatingClipboardWindow(clipboardText, imageBase64, response);
			}, 1500);
		} else {
			throw new Error('No mappings received from AI');
		}
	} catch (error) {
		if (error.message === 'Processing cancelled by user') {
			if (stepTracker) {
				stepTracker.remove();
			}
			return;
		}
		if (stepTracker) {
			stepTracker.updateStep(`❌ Error: ${error.message}`);
			setTimeout(() => stepTracker.remove(), 2000);
		}
		debugLog('Critical error in paste handler:', error.message || error);
	} finally {
		isProcessingPaste = false;
		debugLog('Paste processing flag reset');
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
				action: form.action,
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
			'input[type="number"]',
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
	inputs.forEach((input) => {
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
			tagName: input.tagName.toLowerCase(),
		};

		// If in a form, require at least an id or name
		if (isInForm && !input.id && !input.name) {
			debugLog('Skipping form field without id or name:', {
				element: input.tagName,
				type: input.type,
				identifiers,
			});
			return;
		}

		// Get all possible labels
		const label =
			findLabel(input) ||
			input.getAttribute('aria-label') ||
			input.getAttribute('placeholder') ||
			input.getAttribute('title') ||
			input.getAttribute('data-label');

		// Get select options if it's a select element
		let options = null;
		if (input.tagName === 'SELECT') {
			options = Array.from(input.options).map((opt) => ({
				value: opt.value,
				text: opt.text,
			}));
		}

		// Log detailed field information
		debugLog('Found field:', {
			element: input.tagName,
			type: input.type || input.getAttribute('type') || 'text',
			identifiers,
			label,
			value: input.value,
			options,
			isVisible: isElementVisible(input),
			path: getElementPath(input),
			isInForm,
		});

		const fieldInfo = {
			id: identifiers.id || input.name, // Use name as fallback for id
			name: input.name,
			type: input.type || input.getAttribute('type') || 'text',
			placeholder: input.placeholder,
			label: label,
			isInForm,
			options, // Include select options in field info
			identifiers: Object.fromEntries(
				Object.entries(identifiers).filter(([_, v]) => v)
			),
		};

		formFields.push(fieldInfo);
	});

	debugLog('Processed form fields:', formFields);
}

// Helper function to check if element is visible
function isElementVisible(element) {
	const style = window.getComputedStyle(element);
	return (
		style.display !== 'none' &&
		style.visibility !== 'hidden' &&
		style.opacity !== '0'
	);
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
		() =>
			input.id &&
			document.querySelector(`label[for="${input.id}"]`)?.textContent,

		// Method 2: Wrapping label
		() => input.closest('label')?.textContent,

		// Method 3: Preceding label or text
		() => {
			const previous = input.previousElementSibling;
			if (
				previous?.tagName === 'LABEL' ||
				previous?.classList.contains('label')
			) {
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
		},
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
	messageContainer.style.cssText =
		commonStyles.message +
		'white-space: pre-wrap; display: flex; align-items: flex-start;';

	// Add icon
	const icon = document.createElement('span');
	icon.style.cssText =
		type === 'success' ? commonStyles.successIcon : commonStyles.errorIcon;
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

// Update fillFormFields function's validation part
function fillFormFields(mappings) {
	debugLog('Attempting to fill fields with mappings:', mappings);
	const filledFields = [];
	const actualMappings = mappings.mappings || mappings;
	const results = {
		successful: [],
		failed: [],
	};

	Object.entries(actualMappings).forEach(([fieldIdentifier, mapping]) => {
		const value =
			typeof mapping === 'object' && mapping.value !== undefined
				? mapping.value
				: mapping;

		debugLog(`Trying to fill field "${fieldIdentifier}" with value:`, value);

		// Try to find all matching elements (there might be multiple with same name)
		const elements = findFormElements(fieldIdentifier);
		debugLog(
			`Found ${elements.length} matching elements for "${fieldIdentifier}"`,
			elements
		);

		if (elements.length > 0) {
			let successfulFill = false;

			for (const element of elements) {
				try {
					// Store original value for comparison
					const originalValue = getElementValue(element);
					debugLog(`Original value for "${fieldIdentifier}":`, originalValue);

					// Set the value
					setElementValue(element, value);

					// Trigger events
					['focus', 'input', 'change', 'blur'].forEach((eventType) => {
						element.dispatchEvent(new Event(eventType, { bubbles: true }));
					});

					// Validate immediately and after a short delay
					const immediateValue = getElementValue(element);
					debugLog(
						`Immediate value after setting "${fieldIdentifier}":`,
						immediateValue
					);

					// Wait for any potential async updates
					setTimeout(() => {
						const finalValue = getElementValue(element);
						debugLog(`Final value for "${fieldIdentifier}":`, finalValue);

						const valueMatches = validateElementValue(element, value);

						if (valueMatches) {
							debugLog(
								`✅ Validated field "${fieldIdentifier}": Value set successfully`
							);
							results.successful.push({
								field: fieldIdentifier,
								value: finalValue,
								element: element,
							});
							highlightField(element, 'success');
							successfulFill = true;
						} else {
							debugLog(`❌ Validation failed for "${fieldIdentifier}":`, {
								expected: value,
								actual: finalValue,
								originalValue: originalValue,
							});
							results.failed.push({
								field: fieldIdentifier,
								expectedValue: value,
								actualValue: finalValue,
								element: element,
							});
							highlightField(element, 'error');
						}
					}, 100);
				} catch (error) {
					debugLog(`Error filling field "${fieldIdentifier}":`, error);
					results.failed.push({
						field: fieldIdentifier,
						error: error.message,
						element: element,
					});
					highlightField(element, 'error');
				}
			}
		} else {
			debugLog(`Could not find element for "${fieldIdentifier}"`);
			results.failed.push({
				field: fieldIdentifier,
				error: 'Element not found',
			});
		}
	});

	return results;
}

// New helper functions for better element handling
function findFormElements(identifier) {
	const elements = [];

	// Try all these queries
	const queries = [
		// By name (most common for forms)
		`select[name="${identifier}"]`,
		`[name="${identifier}"]`,
		// By ID if it exists
		`#${identifier}`,
		// By various data attributes
		`[data-field="${identifier}"]`,
		`[data-test-id="${identifier}"]`,
		`[data-name="${identifier}"]`,
		// By aria attributes
		`[aria-label="${identifier}"]`,
		// Partial matches on name
		`[name*="${identifier}"]`,
	];

	// Try each query
	queries.forEach((query) => {
		try {
			const found = document.querySelectorAll(query);
			found.forEach((element) => {
				if (!elements.includes(element) && isValidFormField(element)) {
					elements.push(element);
				}
			});
		} catch (e) {
			debugLog(`Query failed: ${query}`, e);
		}
	});

	// Log found elements with more detail
	if (elements.length > 0) {
		debugLog(
			`Found elements for "${identifier}":`,
			elements.map((el) => ({
				tagName: el.tagName,
				type: el.type,
				id: el.id,
				name: el.name,
				value: el.value,
				options:
					el.tagName === 'SELECT'
						? Array.from(el.options).map((opt) => ({
								value: opt.value,
								text: opt.text,
								selected: opt.selected,
						  }))
						: undefined,
			}))
		);
	}

	return elements;
}

function getElementValue(element) {
	if (element.tagName === 'SELECT') {
		return element.options[element.selectedIndex]?.text || element.value;
	} else if (
		element.isContentEditable ||
		element.getAttribute('contenteditable') === 'true'
	) {
		return element.textContent;
	} else {
		return element.value;
	}
}

function setElementValue(element, value) {
	if (element.tagName === 'SELECT') {
		const options = Array.from(element.options);
		debugLog(
			`Setting select value "${value}". Available options:`,
			options.map((opt) => ({ value: opt.value, text: opt.text }))
		);

		// Try exact match first
		let matchingOption = options.find(
			(opt) =>
				opt.value.toLowerCase() === value.toString().toLowerCase() ||
				opt.text.toLowerCase() === value.toString().toLowerCase()
		);

		// If no exact match, try includes
		if (!matchingOption) {
			matchingOption = options.find(
				(opt) =>
					opt.value.toLowerCase().includes(value.toString().toLowerCase()) ||
					opt.text.toLowerCase().includes(value.toString().toLowerCase())
			);
		}

		if (matchingOption) {
			debugLog(`Found matching option:`, {
				value: matchingOption.value,
				text: matchingOption.text,
			});
			element.value = matchingOption.value;
		} else {
			debugLog(`No matching option found for value: ${value}`);
		}
	} else if (
		element.isContentEditable ||
		element.getAttribute('contenteditable') === 'true'
	) {
		element.textContent = value.toString();
	} else {
		element.value = value.toString();
	}
}

function validateElementValue(element, expectedValue) {
	if (!element || expectedValue === undefined) return false;

	const currentValue = getElementValue(element);
	debugLog('Validating element value:', {
		element: {
			tagName: element.tagName,
			type: element.type,
			id: element.id,
			name: element.name,
		},
		expectedValue,
		currentValue,
		isSelect: element.tagName === 'SELECT',
		selectedOption:
			element.tagName === 'SELECT'
				? {
						value: element.value,
						text: element.options[element.selectedIndex]?.text,
				  }
				: undefined,
	});

	// For select elements
	if (element.tagName === 'SELECT') {
		const selectedOption = element.options[element.selectedIndex];
		const expectedLower = expectedValue.toString().toLowerCase();
		const selectedValueMatch = element.value.toLowerCase() === expectedLower;
		const selectedTextMatch =
			selectedOption?.text.toLowerCase() === expectedLower;
		const selectedValueIncludes = element.value
			.toLowerCase()
			.includes(expectedLower);
		const selectedTextIncludes = selectedOption?.text
			.toLowerCase()
			.includes(expectedLower);

		debugLog('Select validation:', {
			selectedValueMatch,
			selectedTextMatch,
			selectedValueIncludes,
			selectedTextIncludes,
		});

		return (
			selectedValueMatch ||
			selectedTextMatch ||
			selectedValueIncludes ||
			selectedTextIncludes
		);
	}

	// For other elements
	return (
		currentValue.toString().toLowerCase() ===
		expectedValue.toString().toLowerCase()
	);
}

// Update the keyboard shortcut handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'intelligent-paste') {
		// Read from clipboard using Clipboard API
		navigator.clipboard
			.read()
			.then(async (clipboardItems) => {
				let clipboardText = '';
				let imageBase64 = null;

				for (const item of clipboardItems) {
					// Handle text
					if (item.types.includes('text/plain')) {
						const blob = await item.getType('text/plain');
						clipboardText = await blob.text();
					}
					// Handle image
					if (item.types.some((type) => type.startsWith('image/'))) {
						const imageType = item.types.find((type) =>
							type.startsWith('image/')
						);
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
						getData: (type) => (type === 'text/plain' ? clipboardText : ''),
						items: clipboardItems,
					},
				};

				// Handle the paste with our existing function
				handlePaste(syntheticEvent);
			})
			.catch((error) => {
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
			clipboardData: null, // We'll get this from the clipboard API
		};

		// Read from clipboard using Clipboard API
		navigator.clipboard
			.read()
			.then(async (clipboardItems) => {
				let clipboardText = '';
				let imageBase64 = null;

				for (const item of clipboardItems) {
					// Handle text
					if (item.types.includes('text/plain')) {
						const blob = await item.getType('text/plain');
						clipboardText = await blob.text();
					}
					// Handle image
					if (item.types.some((type) => type.startsWith('image/'))) {
						const imageType = item.types.find((type) =>
							type.startsWith('image/')
						);
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
					getData: (type) => (type === 'text/plain' ? clipboardText : ''),
					items: clipboardItems,
				};

				// Handle the paste with our existing function
				handlePaste(syntheticEvent);
			})
			.catch((error) => {
				debugLog('Error reading clipboard:', error);
				showNotification('Failed to read clipboard content', 'error');
			});
	}
});

// Update focus tracking
document.addEventListener('focusin', (e) => {
	// Ignore buttons and non-form elements
	if (e.target.tagName === 'BUTTON' || !isValidFormField(e.target)) {
		return;
	}

	lastFocusedElement = e.target;

	// Track text/textarea fields separately
	if (isTextInputField(e.target)) {
		lastFocusedTextElement = e.target;
	}

	debugLog('Element focused:', {
		tagName: e.target.tagName,
		type: e.target.type,
		id: e.target.id,
		name: e.target.name,
		className: e.target.className,
		isFocused: document.activeElement === e.target,
		isTextInput: isTextInputField(e.target),
	});

	// Update insert buttons immediately
	if (currentFloatingWindow) {
		updateInsertButtons();
	}
});

document.addEventListener('focusout', (e) => {
	// Ignore buttons and non-form elements
	if (e.target.tagName === 'BUTTON' || !isValidFormField(e.target)) {
		return;
	}

	// Small delay to allow new focus to be set
	setTimeout(() => {
		// Only clear lastFocusedElement if we're not focusing another valid form field
		if (!isValidFormField(document.activeElement)) {
			lastFocusedElement = null;
			if (currentFloatingWindow) {
				updateInsertButtons();
			}
		}
	}, 100);
});

// Add this function to update insert buttons
function updateInsertButtons() {
	if (!currentFloatingWindow) return;

	const actionContainers =
		currentFloatingWindow.querySelectorAll('.action-container');
	const targetElement = lastFocusedTextElement || lastFocusedElement;

	actionContainers.forEach((container) => {
		const existingInsertButton = container.querySelector('.insert-button');
		const value = container.dataset.value;

		if (targetElement && isValidFormField(targetElement)) {
			if (!existingInsertButton) {
				const insertButton = createActionButton('Insert', () => {
					const currentTarget =
						lastFocusedTextElement || document.activeElement;
					if (currentTarget && currentTarget.isConnected) {
						insertValueIntoField(currentTarget, value);
						showFeedback(container.parentElement, 'Inserted!');
					}
				});
				insertButton.className = 'insert-button';
				container.appendChild(insertButton);
			}
		} else if (existingInsertButton) {
			existingInsertButton.remove();
		}
	});
}

// Helper function to sort by index
function sortByIndex(a, b) {
	return (b.index || 0) - (a.index || 0);
}

// Update isValidFormField to explicitly exclude buttons
function isValidFormField(element) {
	if (!element || !element.tagName) return false;

	// Explicitly exclude buttons
	if (
		element.tagName === 'BUTTON' ||
		(element.tagName === 'INPUT' && element.type === 'button') ||
		(element.tagName === 'INPUT' && element.type === 'submit')
	) {
		return false;
	}

	return (
		element.tagName === 'INPUT' ||
		element.tagName === 'TEXTAREA' ||
		element.tagName === 'SELECT' ||
		element.isContentEditable ||
		element.getAttribute('contenteditable') === 'true'
	);
}

// Add this function to make windows draggable
function makeWindowDraggable(container, handle) {
	let isDragging = false;
	let currentX;
	let currentY;
	let initialX;
	let initialY;

	handle.style.cursor = 'move';

	handle.addEventListener('mousedown', dragStart);
	document.addEventListener('mousemove', drag);
	document.addEventListener('mouseup', dragEnd);

	function dragStart(e) {
		if (e.target.tagName === 'BUTTON') return; // Don't start drag if clicking a button

		initialX = e.clientX - container.offsetLeft;
		initialY = e.clientY - container.offsetTop;

		if (e.target === handle) {
			isDragging = true;
		}
	}

	function drag(e) {
		if (isDragging) {
			e.preventDefault();

			currentX = e.clientX - initialX;
			currentY = e.clientY - initialY;

			// Keep window within viewport
			const maxX = window.innerWidth - container.offsetWidth;
			const maxY = window.innerHeight - container.offsetHeight;

			currentX = Math.min(Math.max(0, currentX), maxX);
			currentY = Math.min(Math.max(0, currentY), maxY);

			container.style.left = currentX + 'px';
			container.style.top = currentY + 'px';
			container.style.bottom = 'auto';
			container.style.right = 'auto';
		}
	}

	function dragEnd() {
		isDragging = false;
	}

	// Cleanup function
	return () => {
		handle.removeEventListener('mousedown', dragStart);
		document.removeEventListener('mousemove', drag);
		document.removeEventListener('mouseup', dragEnd);
	};
}

// Add this before fillFormFields function
const selectorStrategies = [
	// Try ID first
	(fieldIdentifier) => document.getElementById(fieldIdentifier),
	// Try name attribute with different selectors
	(fieldIdentifier) => document.querySelector(`[name="${fieldIdentifier}"]`),
	(fieldIdentifier) =>
		document.querySelector(`input[name="${fieldIdentifier}"]`),
	(fieldIdentifier) =>
		document.querySelector(`textarea[name="${fieldIdentifier}"]`),
	(fieldIdentifier) =>
		document.querySelector(`select[name="${fieldIdentifier}"]`),
	// Try data attributes
	(fieldIdentifier) =>
		document.querySelector(`[data-field="${fieldIdentifier}"]`),
	(fieldIdentifier) =>
		document.querySelector(`[data-test-id="${fieldIdentifier}"]`),
	(fieldIdentifier) =>
		document.querySelector(`[data-name="${fieldIdentifier}"]`),
	// Try aria label
	(fieldIdentifier) =>
		document.querySelector(`[aria-label="${fieldIdentifier}"]`),
	// Try case-insensitive name match
	(fieldIdentifier) =>
		Array.from(document.getElementsByName(fieldIdentifier)).find(
			(el) => el.name.toLowerCase() === fieldIdentifier.toLowerCase()
		),
	// Try partial matches on name attribute
	(fieldIdentifier) => document.querySelector(`[name*="${fieldIdentifier}"]`),
	// Try label text content
	(fieldIdentifier) => {
		const label = Array.from(document.getElementsByTagName('label')).find(
			(label) =>
				label.textContent.toLowerCase().includes(fieldIdentifier.toLowerCase())
		);
		return label?.control || label?.querySelector('input, textarea, select');
	},
];

// Add this function for field highlighting
function highlightField(element, state = 'success') {
	if (!element || !element.isConnected) {
		debugLog('Cannot highlight field: element is null or not in DOM');
		return;
	}

	try {
		// Save original styles if not already saved
		if (!element.dataset) {
			debugLog('Element does not support dataset, skipping highlight');
			return;
		}

		if (!element.dataset.originalStyle) {
			element.dataset.originalStyle = element.style.cssText;
		}

		const successStyle = `
			background-color: rgba(33, 150, 243, 0.05) !important;
			border-color: #2196F3 !important;
			box-shadow: 0 0 0 1px rgba(33, 150, 243, 0.2) !important;
			transition: all 0.3s ease !important;
		`;

		const errorStyle = `
			background-color: rgba(244, 67, 54, 0.05) !important;
			border-color: #f44336 !important;
			box-shadow: 0 0 0 1px rgba(244, 67, 54, 0.2) !important;
			transition: all 0.3s ease !important;
		`;

		// Apply new styles
		element.style.cssText += state === 'success' ? successStyle : errorStyle;

		// Find and highlight associated labels
		const labels = [
			...Array.from(document.querySelectorAll(`label[for="${element.id}"]`)),
			element.closest('label'),
			element.parentElement?.querySelector('label'),
		].filter(Boolean);

		labels.forEach((label) => {
			if (label.isConnected && label.dataset) {
				if (!label.dataset.originalStyle) {
					label.dataset.originalStyle = label.style.cssText;
				}
				label.style.cssText += `
					color: ${state === 'success' ? '#2196F3' : '#f44336'} !important;
					font-weight: bold !important;
					transition: all 0.3s ease !important;
				`;
			}
		});

		// Remove highlight after delay
		setTimeout(() => {
			if (element.isConnected) {
				removeHighlight(element);
				labels.forEach((label) => {
					if (label.isConnected) {
						removeHighlight(label);
					}
				});
			}
		}, 3000);
	} catch (error) {
		debugLog('Error in highlightField:', error);
	}
}

// Add this helper function to remove highlights
function removeHighlight(element) {
	if (element && element.dataset.originalStyle !== undefined) {
		element.style.cssText = element.dataset.originalStyle;
		delete element.dataset.originalStyle;
	}
}
