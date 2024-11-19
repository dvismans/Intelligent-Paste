import { styles } from './styles.js';

export function createFloatingWindow({ title = 'Form Field Analysis', onClose = null } = {}) {
    const container = document.createElement('div');
    container.style.cssText = styles.floatingWindow;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = styles.floatingHeader;
    
    const titleElement = document.createElement('div');
    titleElement.textContent = title;
    titleElement.style.fontWeight = 'bold';
    
    const closeButton = document.createElement('button');
    closeButton.style.cssText = styles.closeButton;
    closeButton.innerHTML = '×';
    closeButton.onclick = () => {
        container.remove();
        if (onClose) onClose();
    };
    
    header.appendChild(titleElement);
    header.appendChild(closeButton);
    container.appendChild(header);

    // Create content section
    const content = document.createElement('div');
    content.style.cssText = styles.contentSection;
    container.appendChild(content);

    // Make window draggable
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

    document.body.appendChild(container);

    return {
        element: container,
        content,
        addSection: (title, contentElement) => {
            const section = document.createElement('div');
            section.style.marginBottom = '16px';
            
            if (title) {
                const sectionTitle = document.createElement('div');
                sectionTitle.textContent = title;
                sectionTitle.style.fontWeight = 'bold';
                sectionTitle.style.marginBottom = '8px';
                section.appendChild(sectionTitle);
            }
            
            section.appendChild(contentElement);
            content.appendChild(section);
            return section;
        },
        remove: () => {
            container.remove();
            if (onClose) onClose();
        }
    };
} 