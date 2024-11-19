# Intelligent Paste - Chrome Extension

A powerful Chrome extension that uses AI to intelligently analyze clipboard content (text or images) and automatically fill form fields. It uses OpenAI's GPT-4 Vision API to extract and map information to the appropriate form fields.

## Features

- 🔍 Intelligent form field detection and mapping
- 📋 Supports both text and image clipboard content
- 🖼️ Image analysis using GPT-4 Vision API
- 🎯 Relevance scoring for extracted information
- 🚀 Quick copy/paste functionality
- ⌨️ Keyboard shortcut support (Alt+P)
- 🎨 Draggable floating window interface
- ⚙️ Customizable AI instructions
- 🔒 Secure API key management

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. Configure your OpenAI API key in the extension settings

## Usage

1. **Setup**:
   - Click the extension icon and go to Settings
   - Enter your OpenAI API key
   - (Optional) Add custom instructions for the AI

2. **Using the Extension**:
   - Copy text or an image to your clipboard
   - Navigate to a page with form fields
   - Use one of these methods to activate:
     - Click the extension icon

3. **Features**:
   - View detected form fields
   - See extracted information with relevance scores
   - Click any value to copy or paste into focused field
   - Drag the floating window to reposition
   - View original clipboard content

## Permissions

- `activeTab`: To interact with the current webpage
- `clipboardRead`: To access clipboard content
- `storage`: To save settings
- `scripting`: To interact with form fields
- `contextMenus`: For right-click menu options

## Privacy

- Your OpenAI API key is stored locally in Chrome's secure storage
- Clipboard content is only processed when you explicitly trigger the extension
- No data is stored or transmitted except to OpenAI's API for processing

## Development

The extension is built using vanilla JavaScript and Chrome Extension APIs. Key files:

- `background.js`: Handles API communication and background tasks
- `content.js`: Manages webpage interaction and UI
- `settings.js`: Handles configuration and settings
- `templates/`: UI components and styles

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[MIT License](LICENSE)

## Credits

Built with:
- OpenAI GPT-4 Vision API
- Chrome Extension APIs 