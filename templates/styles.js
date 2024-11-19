export const styles = {
    floatingWindow: `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        width: 500px;
        max-height: 600px;
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
    notification: `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        transform: translateY(-20px);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 10001;
    `,
    successIcon: `
        width: 16px;
        height: 16px;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234CAF50"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>');
    `,
    errorIcon: `
        width: 16px;
        height: 16px;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f44336"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>');
    `,
    stepTracker: `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        width: 300px;
        z-index: 10001;
    `,
    stepStatus: `
        margin-bottom: 12px;
        font-size: 14px;
        color: #333;
    `,
    progressContainer: `
        background: #f5f5f5;
        border-radius: 4px;
        overflow: hidden;
        height: 4px;
    `,
    progressBar: `
        width: 100%;
        height: 100%;
    `,
    progressFill: `
        width: 0%;
        height: 100%;
        background: #2196F3;
        transition: width 0.3s ease;
    `,
    table: `
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 12px;
    `
}; 