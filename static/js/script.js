/**
 * TALON MAIN SCRIPT (WITHOUT SIDEBAR LOGIC)
 * File: static/js/script.js
 * 
 * Gestisce:
 * - Animazione dell'header con network canvas
 * - Selettori con ricerca
 * - Albero dinamico e selettore vista
 */

document.addEventListener('DOMContentLoaded', function () {
    initializeNetworkAnimation();
    initializeSearchableSelects();
    initializeTreeView();
    initializeViewToggle();
    initializeTableSort();
});

function initializeNetworkAnimation() {
    const canvas = document.getElementById('network-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const nodes = [];
    const maxNodes = 60;
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = document.querySelector('.page-header').offsetHeight;
    let animationId = null;

    for (let i = 0; i < maxNodes; i++) {
        const bias = Math.random() * 0.4 + 0.4;
        nodes.push({
            x: width - Math.pow(Math.random(), 1.5) * width * bias,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2
        });
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 0.5;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            node.x += node.vx;
            node.y += node.vy;

            if (node.x <= 0 || node.x >= width) {
                node.vx *= -1;
                node.x = Math.max(0, Math.min(width, node.x));
            }

            if (node.y <= 0 || node.y >= height) {
                node.vy *= -1;
                node.y = Math.max(0, Math.min(height, node.y));
            }

            ctx.beginPath();
            ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(170, 170, 170, 1)';
            ctx.fill();

            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[j].x - node.x;
                const dy = nodes[j].y - node.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 100) {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.strokeStyle = `rgba(170, 170, 170, ${(1 - dist / 100) * 0.5})`;
                    ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    function animate() {
        draw();
        animationId = requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = document.querySelector('.page-header').offsetHeight;

        nodes.forEach(node => {
            node.x = Math.min(node.x, width);
            node.y = Math.min(node.y, height);
        });
    });

    window.addEventListener('beforeunload', () => {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    });
}

function initializeSearchableSelects(scope = document) {
    scope.querySelectorAll('.searchable-select').forEach(container => {
        const originalSelectId = container.dataset.selectId;
        const originalSelect = document.getElementById(originalSelectId);
        if (!originalSelect || container.querySelector('.searchable-select-display')) return;

        const display = document.createElement('div');
        display.className = 'searchable-select-display';
        display.textContent = originalSelect.options[originalSelect.selectedIndex]?.text || '';

        const dropdown = document.createElement('div');
        dropdown.className = 'searchable-select-dropdown';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'searchable-select-search';
        searchInput.placeholder = 'FILTRA...';

        const optionsList = document.createElement('ul');
        optionsList.className = 'searchable-select-options';

        Array.from(originalSelect.options).forEach(option => {
            if (option.disabled || !option.value) return;

            const li = document.createElement('li');
            li.dataset.value = option.value;
            if (option.parentElement.tagName === 'OPTGROUP') li.classList.add('sub-option');

            const mainText = document.createElement('span');
            mainText.textContent = option.textContent;
            li.appendChild(mainText);

            if (option.dataset.details) {
                const detailText = document.createElement('span');
                detailText.className = 'option-details';
                detailText.textContent = option.dataset.details;
                li.appendChild(detailText);

                // 👇 Concatenazione testo e dettagli per migliorare la ricerca
                li.dataset.filter = (option.textContent + ' ' + option.dataset.details).toUpperCase();
            } else {
                li.dataset.filter = option.textContent.toUpperCase();
            }

            optionsList.appendChild(li);
        });

        Array.from(originalSelect.querySelectorAll('optgroup')).forEach(optgroup => {
            const label = document.createElement('li');
            label.textContent = optgroup.label;
            label.classList.add('group-label');

            const firstChildValue = optgroup.children.length > 0 ? optgroup.children[0].value : null;
            if (firstChildValue) {
                const firstChildLi = optionsList.querySelector(`li[data-value="${firstChildValue}"]`);
                if (firstChildLi) {
                    optionsList.insertBefore(label, firstChildLi);
                }
            }
        });

        dropdown.appendChild(searchInput);
        dropdown.appendChild(optionsList);
        container.appendChild(display);
        container.appendChild(dropdown);

        display.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            if (dropdown.classList.contains('open')) {
                searchInput.focus();
                searchInput.value = '';
                optionsList.querySelectorAll('li:not(.group-label)').forEach(li => {
                    li.style.display = '';
                });
            }
        });

        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toUpperCase();
            optionsList.querySelectorAll('li:not(.group-label)').forEach(li => {
                const text = li.dataset.filter || li.textContent.toUpperCase();
                li.style.display = text.includes(filter) ? '' : 'none';
            });
        });

        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        optionsList.addEventListener('click', (e) => {
            const targetLi = e.target.closest('li:not(.group-label)');
            if (targetLi) {
                originalSelect.value = targetLi.dataset.value;
                display.textContent = targetLi.querySelector('span:first-child').textContent;
                dropdown.classList.remove('open');
                originalSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });
    });
}

function initializeTreeView() {
    const treeContainer = document.querySelector('.tree');
    if (!treeContainer) return;

    treeContainer.addEventListener('click', function(event) {
        const toggleButton = event.target.closest('.toggle-btn');
        if (toggleButton) {
            event.preventDefault();
            const parentLi = toggleButton.closest('li');
            if (parentLi) {
                parentLi.classList.toggle('expanded');

                const expandedNodes = [...treeContainer.querySelectorAll('li.expanded')]
                    .map(li => li.querySelector('.ente-name a')?.textContent)
                    .filter(Boolean);
                localStorage.setItem('treeExpandedNodes', JSON.stringify(expandedNodes));
            }
        }
    });

    const expandedNodes = JSON.parse(localStorage.getItem('treeExpandedNodes') || '[]');
    if (expandedNodes.length > 0) {
        treeContainer.querySelectorAll('li').forEach(li => {
            const nodeName = li.querySelector('.ente-name a')?.textContent;
            if (nodeName && expandedNodes.includes(nodeName)) {
                li.classList.add('expanded');
            }
        });
    }
}

function initializeViewToggle() {
    const viewToggleCheckbox = document.getElementById('view-toggle-checkbox');
    if (!viewToggleCheckbox) return;

    viewToggleCheckbox.addEventListener('change', function () {
        const baseUrl = this.dataset.urlBase;
        const fullUrl = this.dataset.urlFull;
        window.location.href = this.checked ? fullUrl : baseUrl;
    });
}

function initializeTableSort() {
    const table = document.querySelector('.styled-table');
    if (!table) return;

    const headers = table.querySelectorAll('thead th');
    const tbody = table.querySelector('tbody');

    headers.forEach((th, colIndex) => {
        if (th.textContent.trim() === '') return;

        let ascending = true;
        th.style.cursor = 'pointer';

        const labelText = th.textContent.replace(/[▲▼]/g, '').trim();
        th.textContent = '';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'th-label';
        labelSpan.textContent = labelText;

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'th-arrow';
        arrowSpan.textContent = '▲▼';

        th.appendChild(labelSpan);
        th.appendChild(arrowSpan);

        th.addEventListener('click', () => {
            const rows = Array.from(tbody.querySelectorAll('tr.clickable-row'));

            rows.sort((a, b) => {
                const cellA = a.children[colIndex]?.textContent.trim().toUpperCase();
                const cellB = b.children[colIndex]?.textContent.trim().toUpperCase();

                const dateA = Date.parse(cellA.split('/').reverse().join('-'));
                const dateB = Date.parse(cellB.split('/').reverse().join('-'));

                if (!isNaN(dateA) && !isNaN(dateB)) {
                    return ascending ? dateA - dateB : dateB - dateA;
                } else {
                    return ascending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
                }
            });

            rows.forEach(row => tbody.appendChild(row));
            ascending = !ascending;

            headers.forEach(h => {
                const arrow = h.querySelector('.th-arrow');
                if (arrow) arrow.textContent = '▲▼';
            });

            arrowSpan.textContent = ascending ? '▲' : '▼';
        });
    });
}