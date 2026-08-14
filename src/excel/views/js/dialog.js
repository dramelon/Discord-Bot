(function() {
    // Premium custom Promise-based Dialogs to replace native browser popups

    function createDialog(type, message, defaultValue = '') {
        return new Promise((resolve) => {
            // Remove any existing modals first
            const existing = document.querySelector('.custom-dialog-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.className = 'custom-dialog-overlay';

            const isPrompt = type === 'prompt';
            const hasCancel = type === 'confirm' || type === 'prompt';

            overlay.innerHTML = `
                <div class="custom-dialog-box">
                    <div class="custom-dialog-body">
                        <div class="custom-dialog-icon">${getIcon(type)}</div>
                        <p class="custom-dialog-message">${escapeHTML(message)}</p>
                        ${isPrompt ? `<input type="text" class="custom-dialog-input" id="dialog-input-val" value="${escapeHTML(defaultValue)}" />` : ''}
                    </div>
                    <div class="custom-dialog-actions">
                        ${hasCancel ? `<button class="dialog-btn dialog-btn-cancel">Cancel</button>` : ''}
                        <button class="dialog-btn dialog-btn-confirm">OK</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Focus prompt input
            if (isPrompt) {
                const input = overlay.querySelector('.custom-dialog-input');
                input.focus();
                input.select();
                
                // Allow enter key press to submit
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = input.value;
                        close(val);
                    } else if (e.key === 'Escape') {
                        close(isPrompt ? null : false);
                    }
                });
            } else {
                // Focus confirm button by default for easy keyboard press
                const confirmBtn = overlay.querySelector('.dialog-btn-confirm');
                confirmBtn.focus();

                overlay.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        close(false);
                    }
                });
            }

            // Click handlers
            overlay.querySelector('.dialog-btn-confirm').addEventListener('click', () => {
                if (isPrompt) {
                    const val = overlay.querySelector('.custom-dialog-input').value;
                    close(val);
                } else {
                    close(true);
                }
            });

            if (hasCancel) {
                overlay.querySelector('.dialog-btn-cancel').addEventListener('click', () => {
                    close(isPrompt ? null : false);
                });
            }

            function close(result) {
                overlay.classList.add('fade-out');
                overlay.querySelector('.custom-dialog-box').classList.add('slide-down');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            }
        });
    }

    function getIcon(type) {
        if (type === 'alert') {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#ea580c" class="dialog-svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
        }
        if (type === 'confirm') {
            return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" class="dialog-svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#4f46e5" class="dialog-svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function createFormModal(options) {
        return new Promise((resolve) => {
            const existing = document.querySelector('.custom-dialog-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.className = 'custom-dialog-overlay';

            let fieldsHTML = '';
            options.fields.forEach(field => {
                let controlHTML = '';
                if (field.type === 'text' || field.type === 'number') {
                    controlHTML = `<input type="${field.type}" class="custom-dialog-input" id="field-${field.id}" value="${escapeHTML(String(field.value || ''))}" placeholder="${escapeHTML(field.placeholder || '')}" ${field.required ? 'required' : ''} />`;
                } else if (field.type === 'select') {
                    controlHTML = `
                        <div class="custom-select-container ${field.disabled ? 'disabled' : ''}" id="container-${field.id}" data-id="${field.id}">
                            <button type="button" class="custom-select-trigger" ${field.disabled ? 'disabled' : ''}>
                                <span class="custom-select-trigger-text">-- Select --</span>
                                <svg class="custom-select-trigger-chevron" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            <div class="custom-select-options-panel" style="display: none;"></div>
                            <input type="hidden" id="field-${field.id}" value="${escapeHTML(String(field.value || ''))}" ${field.required ? 'required' : ''} />
                        </div>
                    `;
                } else if (field.type === 'checklist') {
                    controlHTML = `
                        <div class="custom-checklist-container ${field.disabled ? 'disabled' : ''}" id="container-${field.id}" data-id="${field.id}">
                            <!-- Populated with checkboxes dynamically -->
                        </div>
                        <input type="hidden" id="field-${field.id}" value="${escapeHTML(String(field.value || ''))}" />
                    `;
                }

                fieldsHTML += `
                    <div class="form-group">
                        <label>${escapeHTML(field.label)}</label>
                        ${controlHTML}
                    </div>
                `;
            });

            overlay.innerHTML = `
                <div class="custom-dialog-box card-settings-dialog" style="max-width: 460px; width: 100%; text-align: left;">
                    <div class="custom-dialog-header">
                        <h3 class="custom-dialog-title-text">${escapeHTML(options.title)}</h3>
                        <button class="btn-close-modal" id="dialog-close-btn" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer;">&times;</button>
                    </div>
                    <form id="custom-dialog-form" style="padding: 1.25rem 0 0 0;">
                        <div class="custom-dialog-form-fields" style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
                            ${fieldsHTML}
                        </div>
                        <div class="column-settings-actions" style="margin-top: 1.5rem;">
                            <button type="button" class="dialog-btn dialog-btn-cancel">Cancel</button>
                            <button type="submit" class="dialog-btn dialog-btn-confirm">Save</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(overlay);

            const modalRef = {
                setSelectOptions(fieldId, newOptions) {
                    const container = overlay.querySelector(`#container-${fieldId}`);
                    if (!container) return;
                    
                    const triggerBtn = container.querySelector('.custom-select-trigger');
                    const optionsPanel = container.querySelector('.custom-select-options-panel');
                    const hiddenInput = container.querySelector('input[type="hidden"]');
                    
                    container.classList.remove('disabled');
                    triggerBtn.removeAttribute('disabled');

                    optionsPanel.innerHTML = '';
                    
                    let activeVal = hiddenInput.value;
                    let activeText = '';

                    const appendOption = (opt) => {
                        const optDiv = document.createElement('div');
                        optDiv.className = 'custom-select-option-item';
                        optDiv.dataset.value = opt.value;
                        optDiv.textContent = opt.text;
                        
                        if (String(opt.value) === String(activeVal)) {
                            optDiv.classList.add('selected');
                            activeText = opt.text;
                        }

                        optDiv.addEventListener('click', () => {
                            selectValue(container, opt.value, opt.text);
                        });
                        optionsPanel.appendChild(optDiv);
                    };

                    newOptions.forEach(opt => {
                        if (opt.children) {
                            const header = document.createElement('div');
                            header.className = 'custom-select-group-header';
                            header.textContent = opt.label;
                            optionsPanel.appendChild(header);

                            opt.children.forEach(child => appendOption(child));
                        } else {
                            appendOption(opt);
                        }
                    });

                    const triggerText = container.querySelector('.custom-select-trigger-text');
                    if (activeText) {
                        triggerText.textContent = activeText;
                    } else {
                        const isRequired = overlay.querySelector(`#field-${fieldId}`).hasAttribute('required');
                        if (newOptions.length > 0 && isRequired) {
                            const firstOpt = newOptions[0].children ? newOptions[0].children[0] : newOptions[0];
                            if (firstOpt) {
                                selectValue(container, firstOpt.value, firstOpt.text);
                            }
                        } else {
                            triggerText.textContent = '-- Select --';
                            hiddenInput.value = '';
                        }
                    }
                },

                setChecklistOptions(fieldId, newOptions) {
                    const container = overlay.querySelector(`#container-${fieldId}`);
                    if (!container) return;

                    const hiddenInput = container.querySelector('input[type="hidden"]');
                    container.classList.remove('disabled');
                    container.innerHTML = '';

                    // Parse comma separated values
                    const val = hiddenInput.value;
                    const activeVals = val ? val.split(',').map(s => s.trim()) : [];

                    newOptions.forEach(opt => {
                        const label = document.createElement('label');
                        label.className = 'custom-checklist-item';
                        label.style.display = 'flex';
                        label.style.alignItems = 'center';
                        label.style.gap = '0.5rem';
                        label.style.margin = '0.4rem 0';
                        label.style.cursor = 'pointer';

                        const isChecked = activeVals.includes(String(opt.value));

                        label.innerHTML = `
                            <input type="checkbox" value="${escapeHTML(String(opt.value))}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;" />
                            <span class="checkbox-text" style="font-size: 0.88rem; color: var(--text-primary); font-weight: 500;">${escapeHTML(opt.text)}</span>
                        `;

                        label.querySelector('input').addEventListener('change', () => {
                            updateChecklistValues(container);
                        });

                        container.appendChild(label);
                    });

                    updateChecklistValues(container);
                }
            };

            function updateChecklistValues(container) {
                const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
                const vals = Array.from(checkboxes).map(cb => cb.value);
                const hiddenInput = container.querySelector('input[type="hidden"]');
                hiddenInput.value = vals.join(',');

                const fieldId = container.dataset.id;
                if (options.onFieldChange) {
                    options.onFieldChange(fieldId, vals.join(','), modalRef);
                }
            }

            function selectValue(container, value, text) {
                const hiddenInput = container.querySelector('input[type="hidden"]');
                const triggerText = container.querySelector('.custom-select-trigger-text');
                const optionsPanel = container.querySelector('.custom-select-options-panel');

                hiddenInput.value = value;
                triggerText.textContent = text;
                optionsPanel.style.display = 'none';

                container.querySelectorAll('.custom-select-option-item').forEach(item => {
                    if (String(item.dataset.value) === String(value)) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });

                const fieldId = container.dataset.id;
                if (options.onFieldChange) {
                    options.onFieldChange(fieldId, value, modalRef);
                }
            }

            options.fields.forEach(field => {
                if (field.type === 'select') {
                    const container = overlay.querySelector(`#container-${field.id}`);
                    if (!container) return;

                    const triggerBtn = container.querySelector('.custom-select-trigger');
                    const optionsPanel = container.querySelector('.custom-select-options-panel');

                    triggerBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        overlay.querySelectorAll('.custom-select-options-panel').forEach(p => {
                            if (p !== optionsPanel) p.style.display = 'none';
                        });
                        const isVisible = optionsPanel.style.display === 'block';
                        optionsPanel.style.display = isVisible ? 'none' : 'block';
                    });

                    if (field.options) {
                        modalRef.setSelectOptions(field.id, field.options);
                    }
                } else if (field.type === 'checklist') {
                    const container = overlay.querySelector(`#container-${field.id}`);
                    if (container && field.options) {
                        modalRef.setChecklistOptions(field.id, field.options);
                    }
                }
            });

            overlay.addEventListener('click', (e) => {
                if (!e.target.closest('.custom-select-container')) {
                    overlay.querySelectorAll('.custom-select-options-panel').forEach(p => p.style.display = 'none');
                }
            });

            const form = overlay.querySelector('#custom-dialog-form');
            const cancelBtn = overlay.querySelector('.dialog-btn-cancel');
            const closeBtn = overlay.querySelector('#dialog-close-btn');

            const handleClose = (saved = false) => {
                if (saved) {
                    const values = {};
                    options.fields.forEach(field => {
                        const input = overlay.querySelector(`#field-${field.id}`);
                        values[field.id] = input.value;
                    });
                    close(values);
                } else {
                    close(null);
                }
            };

            form.addEventListener('submit', (e) => {
                e.preventDefault();

                // Custom validation for checklists and other required fields
                let valid = true;
                for (const field of options.fields) {
                    if (field.required) {
                        const input = overlay.querySelector(`#field-${field.id}`);
                        if (!input || !input.value || input.value.trim() === '') {
                            valid = false;
                            window.customAlert(`Please select or enter at least one option for: ${field.label}`);
                            return;
                        }
                    }
                }

                if (valid) {
                    handleClose(true);
                }
            });

            cancelBtn.addEventListener('click', () => handleClose(false));
            closeBtn.addEventListener('click', () => handleClose(false));

            function close(result) {
                overlay.classList.add('fade-out');
                overlay.querySelector('.custom-dialog-box').classList.add('slide-down');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            }
        });
    }

    // Expose functions globally
    window.customAlert = (msg) => createDialog('alert', msg);
    window.customConfirm = (msg) => createDialog('confirm', msg);
    window.customPrompt = (msg, defVal) => createDialog('prompt', msg, defVal);
    window.customFormModal = (options) => createFormModal(options);
})();
