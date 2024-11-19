import { styles } from './styles.js';

export function createNotification({ message, type = 'success', duration = 3000 } = {}) {
    const notification = document.createElement('div');
    notification.style.cssText = styles.notification;

    const icon = document.createElement('span');
    icon.style.cssText = type === 'success' ? styles.successIcon : styles.errorIcon;
    notification.appendChild(icon);

    const messageText = document.createElement('span');
    messageText.textContent = message;
    messageText.style.color = type === 'success' ? '#333' : '#f44336';
    notification.appendChild(messageText);

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateY(0)';
        notification.style.opacity = '1';
    }, 10);

    // Remove after duration
    setTimeout(() => {
        notification.style.transform = 'translateY(-20px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, duration);

    return {
        element: notification,
        remove: () => notification.remove()
    };
} 