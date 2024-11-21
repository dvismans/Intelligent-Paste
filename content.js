console.log('Content script loaded!');

// Add both event listeners at the top of the file
document.addEventListener('keydown', (e) => {
	// Check for Alt/Option + P
	if (e.altKey && e.code === 'KeyP') {
		e.preventDefault(); // Prevent any default behavior
		debugLog('Intelligent paste shortcut detected (Alt/Option + P)');

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

// Global variables at the top
let isProcessingPaste = false;
let currentFloatingWindow = null;
let lastFocusedElement = null;

// Update the message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'intelligent-paste') {
		// Get all form fields first
		const formFields = getAllFormFields();
		if (!formFields || formFields.length === 0) {
			showNotification('No form fields found on page', 'error');
			return;
		}

		// Create synthetic paste event
		const syntheticEvent = {
			preventDefault: () => {},
			clipboardData: {
				getData: () => '',
				items: [],
			},
		};

		// Try to read clipboard content
		Promise.all([
			navigator.clipboard.readText().catch(() => ''),
			navigator.clipboard.read().catch(() => []),
		])
			.then(async ([clipboardText, items]) => {
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
											reader.onload = () =>
												resolve(reader.result.split(',')[1]);
											reader.readAsDataURL(blob);
										});
										break;
									}
								}
							}
						} catch (error) {
							console.error('Error processing clipboard item:', error);
						}
					}
				}

				// Update synthetic event with clipboard content
				syntheticEvent.clipboardData.getData = (type) =>
					type === 'text/plain' ? clipboardText : '';
				syntheticEvent.clipboardData.items = items;

				// Handle the paste
				if (clipboardText || imageBase64) {
					handlePaste(syntheticEvent);
				} else {
					showNotification(
						'No content found in clipboard. Please copy some text or image first.',
						'error'
					);
				}
			})
			.catch((error) => {
				console.error('Error reading clipboard:', error);
				showNotification(
					'Failed to read clipboard content. Please try copying again.',
					'error'
				);
			});
	}
});

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

	// Insert button (only show when a form field is focused)
	if (lastFocusedElement && isValidFormField(lastFocusedElement)) {
		const insertButton = createActionButton('Insert', () => {
			insertValueIntoField(lastFocusedElement, value);
			showFeedback(item, 'Inserted!');
		});
		actions.appendChild(insertButton);
	}

	item.appendChild(contentContainer);
	item.appendChild(actions);

	// Show/hide actions on hover
	item.addEventListener('mouseenter', () => {
		actions.style.opacity = '1';
		item.style.backgroundColor = isMapped ? '#e3f2fd' : '#eee';
	});
	item.addEventListener('mouseleave', () => {
		actions.style.opacity = '0';
		item.style.backgroundColor = isMapped ? '#f3f9ff' : '#f5f5f5';
	});

	parent.appendChild(item);
	return item;
}

// Helper function to create action buttons
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
	button.onclick = (e) => {
		e.stopPropagation();
		onClick();
	};
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

// Helper function to insert value into field
function insertValueIntoField(field, value) {
	if (field.tagName === 'SELECT') {
		const options = Array.from(field.options);
		const matchingOption = options.find(
			(opt) =>
				opt.text.toLowerCase().includes(value.toLowerCase()) ||
				opt.value.toLowerCase().includes(value.toLowerCase())
		);
		if (matchingOption) {
			field.value = matchingOption.value;
		}
	} else if (
		field.isContentEditable ||
		field.getAttribute('contenteditable') === 'true'
	) {
		field.textContent = value;
	} else {
		field.value = value;
	}

	// Trigger change events
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.dispatchEvent(new Event('change', { bubbles: true }));

	// Visual feedback
	const originalBackground = field.style.backgroundColor;
	field.style.backgroundColor = '#e3f2fd';
	setTimeout(() => {
		field.style.backgroundColor = originalBackground;
	}, 500);
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

		// Log detailed field information
		debugLog('Found field:', {
			element: input.tagName,
			type: input.type || input.getAttribute('type') || 'text',
			identifiers,
			label,
			value: input.value,
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

// Update fillFormFields function to properly handle the new response format
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
		let element = null;

		// Existing selector strategies...
		for (const strategy of selectorStrategies) {
			element = strategy(fieldIdentifier);
			if (element) break;
		}

		if (element) {
			try {
				// Store original value for comparison
				const originalValue = element.value;

				// Fill the field based on type
				if (
					fieldIdentifier.toLowerCase().includes('phone') ||
					element.type === 'tel'
				) {
					const cleanPhone = value.toString().replace(/[^0-9+]/g, '');
					element.value = cleanPhone;
				} else if (element.type === 'date') {
					try {
						const date = new Date(value);
						if (!isNaN(date)) {
							element.value = date.toISOString().split('T')[0];
						} else {
							element.value = value.toString();
						}
					} catch {
						element.value = value.toString();
					}
				} else if (element.tagName === 'SELECT') {
					const options = Array.from(element.options);
					const matchingOption = options.find(
						(opt) =>
							opt.text.toLowerCase().includes(value.toString().toLowerCase()) ||
							opt.value.toLowerCase().includes(value.toString().toLowerCase())
					);
					if (matchingOption) {
						element.value = matchingOption.value;
					} else {
						element.value = value.toString();
					}
				} else {
					element.value = value.toString();
				}

				// Trigger events
				['focus', 'input', 'change', 'blur'].forEach((eventType) => {
					element.dispatchEvent(new Event(eventType, { bubbles: true }));
				});

				// Validate the field was actually filled
				setTimeout(() => {
					const currentValue = element.value;
					const expectedValue =
						element.tagName === 'SELECT'
							? element.options[element.selectedIndex]?.text
							: value.toString();

					const valueMatches =
						element.tagName === 'SELECT'
							? currentValue &&
							  (currentValue
									.toLowerCase()
									.includes(value.toString().toLowerCase()) ||
									element.options[element.selectedIndex]?.text
										.toLowerCase()
										.includes(value.toString().toLowerCase()))
							: currentValue === value.toString();

					if (valueMatches) {
						debugLog(
							`✅ Validated field "${fieldIdentifier}": Value set successfully`
						);
						results.successful.push({
							field: fieldIdentifier,
							value: currentValue,
							element: element,
						});
						highlightField(element, 'success');
					} else {
						debugLog(`❌ Validation failed for "${fieldIdentifier}":`, {
							expected: value,
							actual: currentValue,
							originalValue: originalValue,
						});
						results.failed.push({
							field: fieldIdentifier,
							expectedValue: value,
							actualValue: currentValue,
							element: element,
						});
						highlightField(element, 'error');
					}
				}, 100); // Small delay to ensure events are processed

				filledFields.push(element);

				// Handle labels
				const labels = [
					...Array.from(
						document.querySelectorAll(`label[for="${element.id}"]`)
					),
					element.closest('label'),
					element.parentElement?.querySelector('label'),
					...Array.from(document.getElementsByTagName('label')).filter(
						(label) =>
							label.textContent
								.toLowerCase()
								.includes(fieldIdentifier.toLowerCase())
					),
				].filter(Boolean);

				labels.forEach((label) => {
					filledFields.push(label);
				});
			} catch (error) {
				debugLog(`Error filling field "${fieldIdentifier}":`, error);
				results.failed.push({
					field: fieldIdentifier,
					error: error.message,
					element: element,
				});
				highlightField(element, 'error');
			}
		} else {
			debugLog(`Could not find element for "${fieldIdentifier}"`);
			results.failed.push({
				field: fieldIdentifier,
				error: 'Element not found',
			});
		}
	});

	// Update the final status message based on validation results
	const successCount = results.successful.length;
	const failCount = results.failed.length;
	const totalFields = Object.keys(actualMappings).length;

	if (failCount > 0) {
		debugLog(`⚠️ Form filling completed with issues:`, {
			total: totalFields,
			successful: successCount,
			failed: failCount,
			failedFields: results.failed,
		});
		return {
			success: false,
			message: `Filled ${successCount} fields, ${failCount} failed`,
			results: results,
		};
	} else {
		debugLog(`✅ Form filling completed successfully:`, {
			total: totalFields,
			successful: successCount,
		});
		return {
			success: true,
			message: `Successfully filled ${successCount} fields`,
			results: results,
		};
	}
}

// Update highlightField function to handle success/error states
function highlightField(element, state = 'success') {
	const successStyle = `
		background-color: rgba(33, 150, 243, 0.05) !important;
		border-color: #2196F3 !important;
		box-shadow: 0 0 0 1px rgba(33, 150, 243, 0.2) !important;
	`;

	const errorStyle = `
		background-color: rgba(244, 67, 54, 0.05) !important;
		border-color: #f44336 !important;
		box-shadow: 0 0 0 1px rgba(244, 67, 54, 0.2) !important;
	`;

	element.style.cssText += `
		transition: all 0.3s ease !important;
		${state === 'success' ? successStyle : errorStyle}
	`;
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

// Add event listeners for focus tracking
document.addEventListener('focusin', (e) => {
	lastFocusedElement = e.target;
	debugLog('Element focused:', {
		tagName: e.target.tagName,
		type: e.target.type,
		id: e.target.id,
		className: e.target.className,
	});
});

// Helper function to sort by index
function sortByIndex(a, b) {
	return (b.index || 0) - (a.index || 0);
}

// Helper function to check if an element is a valid form field
function isValidFormField(element) {
	return (
		element.tagName &&
		(element.tagName === 'INPUT' ||
			element.tagName === 'TEXTAREA' ||
			element.tagName === 'SELECT' ||
			element.isContentEditable ||
			element.getAttribute('contenteditable') === 'true')
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
