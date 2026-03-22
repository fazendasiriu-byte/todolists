const GRID_SIZE = 40;

const state = {
    tasks: [],
    activeInput: null,
    hoveredTask: null,
    menuTimeout: null
};

let appData = {
    counter: 0,
    listCounter: 1,
    lists: [
        { id: 'list-0', name: 'Main', tasks: [] }
    ],
    activeListId: 'list-0'
};

function saveState() {
    localStorage.setItem('priority-sheet-state', JSON.stringify(appData));
}

function loadState() {
    const saved = localStorage.getItem('priority-sheet-state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            
            // Backward compatibility
            if (parsed.tasks) {
                appData.lists[0].tasks = parsed.tasks;
                appData.counter = parsed.counter || 0;
            } else if (parsed.lists) {
                appData = parsed;
            }
            
        } catch (e) {
            console.error('Failed to load state', e);
        }
    }
    
    // Ensure active list exists
    if (!appData.lists.find(l => l.id === appData.activeListId)) {
        appData.activeListId = appData.lists[0].id;
    }
    
    switchList(appData.activeListId);
}

// UI functions for lists
function renderTabs() {
    const tabsContainer = document.getElementById('list-tabs');
    tabsContainer.innerHTML = '';
    
    appData.lists.forEach(list => {
        const btn = document.createElement('button');
        btn.className = `list-tab ${list.id === appData.activeListId ? 'active' : ''}`;
        btn.textContent = list.name;
        
        btn.addEventListener('click', () => switchList(list.id));
        btn.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const newName = prompt('Rename list:', list.name);
            if (newName && newName.trim()) {
                list.name = newName.trim();
                saveState();
                renderTabs();
            }
        });
        
        tabsContainer.appendChild(btn);
    });
}

function switchList(listId) {
    appData.activeListId = listId;
    const activeList = appData.lists.find(l => l.id === listId);
    state.tasks = activeList.tasks;
    
    // Clear DOM grids
    document.querySelectorAll('.grid-content').forEach(grid => {
        grid.innerHTML = '';
    });
    
    // Render active list tasks
    state.tasks.forEach(task => {
        const colEl = document.querySelector(`[data-col="${task.col}"] .grid-content`);
        if (colEl) {
            renderTask(task, colEl);
            updateTaskDom(task);
        }
    });
    
    renderTabs();
    saveState();
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

document.addEventListener('DOMContentLoaded', () => {
    loadState();
    
    document.getElementById('add-list-btn').addEventListener('click', () => {
        const name = prompt('New list name:');
        if (name && name.trim()) {
            const newList = {
                id: `list-${appData.listCounter++}`,
                name: name.trim(),
                tasks: []
            };
            appData.lists.push(newList);
            switchList(newList.id);
        }
    });
});

// DOM Elements
const contextMenu = document.getElementById('context-menu');
const btnBold = document.getElementById('btn-bold');
const btnStrike = document.getElementById('btn-strike');
const btnDelete = document.getElementById('btn-delete');

document.querySelectorAll('.grid-content').forEach(grid => {
    grid.addEventListener('dragover', (e) => {
        e.preventDefault(); // allow drop
        e.dataTransfer.dropEffect = 'move';
    });

    grid.addEventListener('drop', (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;
        
        const taskObj = state.tasks.find(t => t.id === taskId);
        if (!taskObj) return;

        const rect = grid.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const rowIndex = Math.floor(y / GRID_SIZE);
        const colId = grid.parentElement.getAttribute('data-col');

        // Prevent moving if same cell or occupied
        if (taskObj.col === colId && taskObj.row === rowIndex) return;
        if (state.tasks.some(t => t.col === colId && t.row === rowIndex)) return;

        // Update state
        taskObj.col = colId;
        taskObj.row = rowIndex;
        
        // Update DOM
        const taskEl = document.getElementById(taskId);
        if (taskEl) {
            taskEl.style.top = `${rowIndex * GRID_SIZE + 2}px`;
            if (taskEl.parentElement !== grid) {
                grid.appendChild(taskEl);
            }
        }
        
        saveState();
    });

    grid.addEventListener('click', (e) => {
        // Only trigger if clicking exactly on the grid (not on a child element)
        if (e.target !== grid) return;

        // Ensure we don't have another input open
        if (state.activeInput) {
            commitActiveInput();
        }

        const rect = grid.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const rowIndex = Math.floor(y / GRID_SIZE);
        
        // Prevent adding if there's already a task here
        const colId = grid.parentElement.getAttribute('data-col');
        if (state.tasks.some(t => t.col === colId && t.row === rowIndex)) {
            return; // Cell occupied
        }

        createInputAt(grid, colId, rowIndex);
    });
});

function createInputAt(grid, colId, rowIndex) {
    const topPos = rowIndex * GRID_SIZE + 2; // +2 for center alignment in the grid row
    
    const input = document.createElement('input');
    input.className = 'task-input';
    input.style.top = `${topPos}px`;
    
    grid.appendChild(input);
    input.focus();

    state.activeInput = { element: input, colId, rowIndex, grid };

    // Handle blur and enter specifically
    const onComplete = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter') return;
        commitActiveInput();
    };

    input.addEventListener('blur', onComplete);
    input.addEventListener('keydown', onComplete);
}

function commitActiveInput() {
    if (!state.activeInput) return;
    
    const { element, colId, rowIndex, grid } = state.activeInput;
    const text = element.value.trim();
    
    element.remove();
    state.activeInput = null;

    if (text) {
        addTask(colId, rowIndex, text, grid);
    }
}

function addTask(colId, rowIndex, text, gridNode) {
    const task = {
        id: `task-${appData.counter++}`,
        col: colId,
        row: rowIndex,
        text: text,
        isBold: false,
        isStrike: false
    };
    
    state.tasks.push(task);
    renderTask(task, gridNode);
    saveState();
}

function renderTask(task, gridNode) {
    const taskEl = document.createElement('div');
    taskEl.className = 'task-item';
    taskEl.id = task.id;
    taskEl.textContent = task.text;
    
    if (task.image) {
        const img = document.createElement('img');
        img.src = task.image;
        img.className = 'task-image';
        taskEl.prepend(img);
    }
    
    taskEl.style.top = `${task.row * GRID_SIZE + 2}px`;
    taskEl.setAttribute('draggable', 'true');

    taskEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        editTask(taskEl, task);
    });
    
    // Hover events for context menu
    taskEl.addEventListener('mouseenter', (e) => showContextMenu(e, task));
    taskEl.addEventListener('mouseleave', hideContextMenuLater);
    
    taskEl.addEventListener('dragstart', (e) => {
        contextMenu.classList.remove('visible');
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => taskEl.style.opacity = '0.5', 0);
    });
    
    taskEl.addEventListener('dragend', () => {
        taskEl.style.opacity = '1';
    });
    
    gridNode.appendChild(taskEl);
}

function updateTaskDom(task) {
    const el = document.getElementById(task.id);
    if (!el) return;
    
    if (task.isBold) el.classList.add('bold');
    else el.classList.remove('bold');
    
    if (task.isStrike) el.classList.add('strike');
    else el.classList.remove('strike');
}

// Context Menu Logic
function showContextMenu(e, task) {
    clearTimeout(state.menuTimeout);
    state.hoveredTask = task;
    
    const rect = e.target.getBoundingClientRect();
    
    // Position menu just above and right of mouse center ideally, or right above the task
    contextMenu.style.left = `${rect.right + 10}px`;
    contextMenu.style.top = `${rect.top - 5}px`;
    
    // Sometimes it might clip the edge, but we are keeping it simple
    contextMenu.classList.add('visible');
}

function hideContextMenuLater() {
    state.menuTimeout = setTimeout(() => {
        contextMenu.classList.remove('visible');
        state.hoveredTask = null;
    }, 200); // Small delay allows user to move mouse to menu
}

// Keep menu visible when hovering over the menu itself
contextMenu.addEventListener('mouseenter', () => clearTimeout(state.menuTimeout));
contextMenu.addEventListener('mouseleave', hideContextMenuLater);

// Menu Actions
btnBold.addEventListener('click', () => {
    if (state.hoveredTask) {
        state.hoveredTask.isBold = !state.hoveredTask.isBold;
        updateTaskDom(state.hoveredTask);
        saveState();
    }
});

btnStrike.addEventListener('click', () => {
    if (state.hoveredTask) {
        state.hoveredTask.isStrike = !state.hoveredTask.isStrike;
        updateTaskDom(state.hoveredTask);
        saveState();
    }
});

const btnImage = document.getElementById('btn-image');
const imageUpload = document.getElementById('image-upload');

btnImage.addEventListener('click', () => {
    if (state.hoveredTask) {
        state.targetImageTask = state.hoveredTask;
        imageUpload.click();
    }
});

function attachImageToTask(taskObj, dataUrl) {
    taskObj.image = dataUrl;
    const taskEl = document.getElementById(taskObj.id);
    if (taskEl) {
        const oldImg = taskEl.querySelector('img.task-image');
        if (oldImg) oldImg.remove();
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'task-image';
        taskEl.prepend(img);
    }
    saveState();
}

function processImageFile(file, taskObj) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_HEIGHT = 60; 
            const scale = Math.min(1, MAX_HEIGHT / img.height);
            canvas.height = img.height * scale;
            canvas.width = img.width * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            attachImageToTask(taskObj, canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

imageUpload.addEventListener('change', (e) => {
    if (state.targetImageTask && e.target.files.length > 0) {
        processImageFile(e.target.files[0], state.targetImageTask);
    }
    e.target.value = '';
    state.targetImageTask = null;
    contextMenu.classList.remove('visible');
});

document.addEventListener('paste', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (state.hoveredTask) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                processImageFile(blob, state.hoveredTask);
                contextMenu.classList.remove('visible');
                break;
            }
        }
    }
});

btnDelete.addEventListener('click', () => {
    if (state.hoveredTask) {
        const id = state.hoveredTask.id;
        const el = document.getElementById(id);
        if (el) el.remove();
        
        // Remove from state
        const idx = state.tasks.findIndex(t => t.id === id);
        if (idx > -1) state.tasks.splice(idx, 1);
        saveState();
        
        contextMenu.classList.remove('visible');
        state.hoveredTask = null;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && state.hoveredTask) {
        const taskEl = document.getElementById(state.hoveredTask.id);
        if (taskEl) {
            editTask(taskEl, state.hoveredTask);
        }
    }
});

function editTask(taskEl, taskObj) {
    if (taskEl.querySelector('input')) return;
    contextMenu.classList.remove('visible');

    const originalText = taskObj.text;
    taskEl.textContent = '';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.className = 'edit-task-input';
    
    taskEl.appendChild(input);
    input.focus();
    
    taskEl.setAttribute('draggable', 'false');

    const onComplete = (e) => {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== 'Escape') return;
        
        input.removeEventListener('blur', onComplete);
        input.removeEventListener('keydown', onComplete);

        let newText = input.value.trim();
        if (e.key === 'Escape') newText = originalText;

        if (newText === '') {
            taskEl.remove();
            const idx = state.tasks.findIndex(t => t.id === taskObj.id);
            if (idx > -1) state.tasks.splice(idx, 1);
        } else {
            taskObj.text = newText;
            taskEl.innerHTML = '';
            taskEl.textContent = newText;
            if (taskObj.image) {
                const img = document.createElement('img');
                img.src = taskObj.image;
                img.className = 'task-image';
                taskEl.prepend(img);
            }
            taskEl.setAttribute('draggable', 'true');
        }
        
        saveState();
    };

    input.addEventListener('blur', onComplete);
    input.addEventListener('keydown', onComplete);
}

document.getElementById('btn-export').addEventListener('click', () => {
    const dataStr = localStorage.getItem('priority-sheet-state');
    if (!dataStr) return alert("Nothing to export!");
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `priority-sheet-backup.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-import').click();
});

document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const content = evt.target.result;
            const parsed = JSON.parse(content);
            if (!parsed.lists && !parsed.tasks) throw new Error("Invalid format");
            
            localStorage.setItem('priority-sheet-state', content);
            alert("Backup imported successfully! The page will now reload to apply the data.");
            location.reload();
        } catch (err) {
            alert("Error parsing backup file. Make sure it is a valid JSON.");
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});
