import { styles } from './styles.js';

export function createStepTracker() {
    const container = document.createElement('div');
    container.style.cssText = styles.stepTracker;

    const status = document.createElement('div');
    status.style.cssText = styles.stepStatus;
    container.appendChild(status);

    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = styles.progressContainer;
    container.appendChild(progressContainer);

    const progressBar = document.createElement('div');
    progressBar.style.cssText = styles.progressBar;
    progressContainer.appendChild(progressBar);

    const progress = document.createElement('div');
    progress.style.cssText = styles.progressFill;
    progressBar.appendChild(progress);

    document.body.appendChild(container);

    return {
        element: container,
        updateStep: (message) => {
            status.textContent = message;
        },
        updateProgress: (percent) => {
            progress.style.width = `${percent}%`;
        },
        remove: () => container.remove()
    };
} 