import { styles } from './styles.js';

export function createFormFieldsTable(fields) {
    const table = document.createElement('table');
    table.style.cssText = styles.table;

    // Add table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr style="background: #eee;">
            <th style="padding: 6px; text-align: left; border-bottom: 2px solid #ddd;">Field ID</th>
            <th style="padding: 6px; text-align: left; border-bottom: 2px solid #ddd;">Type</th>
            <th style="padding: 6px; text-align: left; border-bottom: 2px solid #ddd;">Label/Purpose</th>
            <th style="padding: 6px; text-align: center; border-bottom: 2px solid #ddd;">Can Fill</th>
        </tr>
    `;
    table.appendChild(thead);

    // Add table body
    const tbody = document.createElement('tbody');
    
    fields.forEach(field => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom: 1px solid #eee;';
        
        const identifier = field.id || field.name || field.identifiers['data-test'];
        const label = field.label || field.identifiers['aria-label'] || field.placeholder || 'Unknown';
        const type = field.type || field.componentType || field.identifiers.role || 'text';
        const canTarget = !!(
            field.id || 
            field.name || 
            field.identifiers['data-test'] ||
            field.identifiers['data-field'] ||
            field.identifiers['aria-label']
        );
        
        tr.innerHTML = `
            <td style="padding: 6px; font-family: monospace;">${identifier || '-'}</td>
            <td style="padding: 6px; color: #666;"><code>${type}</code></td>
            <td style="padding: 6px;">
                ${label}
                ${field.options ? `
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        Options: ${field.options.map(opt => 
                            `<span style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; margin-right: 4px;">
                                ${opt.text}
                            </span>`
                        ).join('')}
                    </div>
                ` : ''}
            </td>
            <td style="padding: 6px; text-align: center; color: ${canTarget ? '#4CAF50' : '#f44336'};">
                ${canTarget ? '✓' : '✗'}
            </td>
        `;
        
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    return table;
} 