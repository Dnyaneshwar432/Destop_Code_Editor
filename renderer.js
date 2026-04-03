require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = {
  getWorkerUrl: function(workerId, label) {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' };
      importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`
    )}`;
  }
};

let editor;
let jsonTree;

// UI Elements
const editorContainer = document.getElementById('editor-container');
const treeContainer = document.getElementById('tree-container');
const treeWrapper = document.getElementById('jsoneditor-wrapper'); // New nested wrapper
const statusBar = document.getElementById('status-text');
const copyPathBtn = document.getElementById('copy-path-btn');
const inputFileName = document.getElementById('file-name');
const tabsListUI = document.getElementById('tabs-list');
const btnAddTab = document.getElementById('btn-add-tab');

// JSON Path State
let currentDotPath = '';
let currentBracketPath = '';
const pathInput = document.getElementById('json-path-display');
const pathRadios = document.querySelectorAll('input[name="path-style"]');

pathRadios.forEach(r => r.addEventListener('change', () => {
    pathInput.value = (document.querySelector('input[name="path-style"]:checked').value === 'dot') ? currentDotPath : currentBracketPath;
}));

// Feature 1: Tab Management System
let tabs = [];
let activeTabId = null;
let isSwitchingTab = false;

function saveTabs() {
   localStorage.setItem('editor_tabs', JSON.stringify(tabs));
   localStorage.setItem('editor_active_tab', activeTabId);
}

function loadTabs() {
   try {
       const saved = localStorage.getItem('editor_tabs');
       const savedActive = localStorage.getItem('editor_active_tab');
       if(saved) tabs = JSON.parse(saved);
       if(tabs.length === 0) createTab();
       else switchTab(savedActive && tabs.some(t => t.id === savedActive) ? savedActive : tabs[0].id);
   } catch(e) {
       tabs = [];
       createTab();
   }
}

function createTab(fileData = null) {
  const id = 'tab_' + Date.now() + Math.floor(Math.random() * 1000);
  const lang = fileData ? getLanguageFromFilename(fileData.filename) : 'plaintext';
  tabs.push({
    id,
    fileName: fileData ? fileData.filename : '',
    content: fileData ? fileData.content : '',
    filePath: fileData ? fileData.filePath : '',
    language: lang
  });
  switchTab(id);
  saveTabs();
}

function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index === -1) return;
  tabs.splice(index, 1);
  if (tabs.length === 0) {
      createTab();
  } else if (activeTabId === id) {
      switchTab(tabs[Math.max(0, index - 1)].id);
  } else {
      renderTabs();
  }
  saveTabs();
}

function switchTab(id) {
  if (activeTabId && editor && !isSwitchingTab) {
      const currentTab = tabs.find(t => t.id === activeTabId);
      if (currentTab) currentTab.content = editor.getValue();
  }
  
  activeTabId = id;
  const newTab = tabs.find(t => t.id === activeTabId);
  if (!newTab) return;
  
  isSwitchingTab = true;
  inputFileName.value = newTab.fileName;
  setLayoutForLanguage(newTab.language);
  
  if(editor) {
      editor.setValue(newTab.content);
      if(newTab.language === 'json' && newTab.content.trim()) {
         try { jsonTree.update(JSON.parse(newTab.content)); } catch(e) { jsonTree.set({}); }
      }
  }
  isSwitchingTab = false;
  
  renderTabs();
  saveTabs();
}

function renderTabs() {
  tabsListUI.innerHTML = '';
  tabs.forEach(t => {
     const tabEl = document.createElement('div');
     tabEl.className = `tab ${t.id === activeTabId ? 'active' : ''}`;
     
     const title = document.createElement('span');
     title.className = 'tab-title';
     title.innerText = t.fileName || 'Untitled';
     
     const closeBtn = document.createElement('button');
     closeBtn.className = 'tab-close';
     closeBtn.innerHTML = '×';
     closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
     
     tabEl.appendChild(title);
     tabEl.appendChild(closeBtn);
     tabEl.onclick = () => switchTab(t.id);
     
     tabsListUI.appendChild(tabEl);
  });
}

btnAddTab.addEventListener('click', () => createTab());

function getLanguageFromFilename(filename) {
  const extMatch = filename.match(/\.([^.]+)$/);
  if (!extMatch) return 'plaintext';
  const ext = extMatch[1].toLowerCase();
  const langMap = { 'js': 'javascript', 'json': 'json', 'py': 'python', 'html': 'html', 'css': 'css', 'ts': 'typescript', 'txt': 'plaintext' };
  return langMap[ext] || 'plaintext';
}

require(['vs/editor/editor.main'], function() {
  
  // Feature 3: Rainbow Brackets implemented natively using independent color pools!
  monaco.editor.defineTheme('premium-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
          { token: 'string.key.json', foreground: '9cdcfe' },
          { token: 'string.value.json', foreground: 'ce9178' },
          { token: 'number', foreground: 'b5cea8' },
          { token: 'keyword.json', foreground: 'dcdcaa', fontStyle: 'bold' }
      ],
      colors: {
          'editor.background': '#1e1e1e',
          'editorBracketHighlight.foreground1': '#ff5252', // Red
          'editorBracketHighlight.foreground2': '#ffeb3b', // Yellow
          'editorBracketHighlight.foreground3': '#4caf50', // Green
          'editorBracketHighlight.foreground4': '#00bcd4', // Cyan
          'editorBracketHighlight.foreground5': '#448aff', // Blue
          'editorBracketHighlight.foreground6': '#e040fb', // Purple
          'editorBracketHighlight.unexpectedBracket.foreground': '#ff0000'
      }
  });

  editor = monaco.editor.create(editorContainer, {
    value: '',
    language: 'plaintext',
    theme: 'premium-dark',
    fontFamily: "'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace",
    fontLigatures: true,
    bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true }, // Rainbow brackets enabled
    guides: { bracketPairs: true, indentation: true, highlightActiveBracketPair: true },
    matchBrackets: 'always',
    automaticLayout: true,
    roundedSelection: true,
    minimap: { enabled: false },
    padding: { top: 16, bottom: 16 }
  });

  // Feature 2: JSON Path extraction (Tree config)
  const options = {
    mode: 'tree',
    search: true,
    mainMenuBar: true,
    navigationBar: true,
    onCreateMenu: function (items, node) {
       const path = node.path;
       if(!path) return items;
       const dotPath = path.map(p => typeof p === 'number' ? `[${p}]` : `.${p}`).join('').replace(/^\./, '');
       const bracketPath = path.map(p => typeof p === 'number' ? `[${p}]` : `["${p}"]`).join('');
       
       return [
         { text: 'Copy Path (Dot)', click: () => copyToClipboard(dotPath) },
         { text: 'Copy Path (Bracket)', click: () => copyToClipboard(bracketPath) },
         { type: 'separator' },
         ...items
       ];
    },
    onEvent: function (node, event) {
      if (event.type === 'click' && node.path) {
        currentDotPath = node.path.map(p => typeof p === 'number' ? `[${p}]` : `.${p}`).join('').replace(/^\./, '');
        currentBracketPath = node.path.map(p => typeof p === 'number' ? `[${p}]` : `["${p}"]`).join('');
        
        // Update input field
        pathInput.value = (document.querySelector('input[name="path-style"]:checked').value === 'dot') ? currentDotPath : currentBracketPath;
        
        statusBar.innerText = `[PATH EXTRACTED]`;
        document.getElementById('status-bar').className = '';
        copyPathBtn.classList.remove('hidden');

        highlightInEditor(node);
      }
    }
  };
  jsonTree = new JSONEditor(treeWrapper, options);

  editor.onDidChangeModelContent(() => {
    if (isSwitchingTab) return;
    
    // Auto-update state array
    const activeTabObj = tabs.find(t => t.id === activeTabId);
    if(activeTabObj) {
       activeTabObj.content = editor.getValue();
       saveTabs();
    }

    if (activeTabObj && activeTabObj.language === 'json') {
      try {
        const val = editor.getValue();
        if (val.trim()) {
           jsonTree.update(JSON.parse(val));
           document.getElementById('status-bar').className = '';
        } else {
           jsonTree.set({});
        }
      } catch (e) {
        statusBar.innerText = `Invalid JSON: ${e.message}`;
        document.getElementById('status-bar').className = 'error';
      }
    }
  });

  setTimeout(() => { 
      editor.layout(); 
      loadTabs(); // Inject state setup once editor is ready
  }, 200);
});

// Trace Highlight
let decorations = [];
function highlightInEditor(node) {
   if(node.field === undefined && node.value === undefined) return;
   const target = node.field !== undefined && node.field !== '' ? `"${node.field}"` : (typeof node.value === 'string' ? `"${node.value}"` : String(node.value));
   
   const matches = editor.getModel().findMatches(target, false, false, false, null, true);
   if(matches && matches.length > 0) {
      const bestMatch = matches[0];
      editor.revealLineInCenter(bestMatch.range.startLineNumber);
      decorations = editor.deltaDecorations(decorations, [{
          range: bestMatch.range,
          options: { inlineClassName: 'highlight-target', isWholeLine: false, stickiness: 1 }
      }]);
      setTimeout(() => { decorations = editor.deltaDecorations(decorations, []); }, 2500);
   }
}

function copyToClipboard(text) {
   navigator.clipboard.writeText(text);
   const old = statusBar.innerText;
   statusBar.innerText = `Copied to clipboard: ${text}`;
   setTimeout(() => { statusBar.innerText = old; }, 2000);
}

copyPathBtn.addEventListener('click', () => {
   if(currentDotPath || currentBracketPath) {
      const isDot = document.querySelector('input[name="path-style"]:checked').value === 'dot';
      copyToClipboard(isDot ? currentDotPath : currentBracketPath);
   }
});

function setLayoutForLanguage(language) {
  if(editor) monaco.editor.setModelLanguage(editor.getModel(), language);
  
  if (language === 'json') {
    treeContainer.classList.remove('hidden');
    editorContainer.style.width = '45%';
    treeContainer.style.width = '55%';
  } else {
    treeContainer.classList.add('hidden');
    editorContainer.style.width = '100%';
  }
}

// Modify bindings to operate via Tab System
document.getElementById('btn-new').addEventListener('click', () => {
  createTab();
});

document.getElementById('btn-format').addEventListener('click', () => {
   if(editor) editor.getAction('editor.action.formatDocument').run();
});

document.getElementById('btn-open').addEventListener('click', async () => {
  document.getElementById('save-status').innerText = '';
  const fileData = await window.electronAPI.openFile();
  if (fileData) {
    const lang = getLanguageFromFilename(fileData.filename);
    
    let content = fileData.content;
    if(lang === 'json') {
        try { content = JSON.stringify(JSON.parse(content), null, 4); } catch(e){}
    }
    
    fileData.content = content;
    createTab(fileData); // Spawns new tab natively
    statusBar.innerText = `Opened: ${fileData.filePath}`;
  }
});

// Feature 4: File Save Logic uses exact name or override
document.getElementById('btn-save').addEventListener('click', async () => {
  if (!editor || !activeTabId) return;
  const content = editor.getValue();
  const filename = inputFileName.value;
  
  document.getElementById('save-status').innerText = 'Saving...';
  const result = await window.electronAPI.saveFile(content, filename);
  
  if (result.success) {
    document.getElementById('save-status').innerText = `✓ Saved`;
    inputFileName.value = result.filename;
    statusBar.innerText = `Saved successfully! Path: ${result.targetPath}`;
    
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        activeTab.fileName = result.filename;
        activeTab.content = content;
        
        const lang = getLanguageFromFilename(result.filename);
        if (lang !== activeTab.language) {
            activeTab.language = lang;
            setLayoutForLanguage(lang);
        }
        renderTabs();
    }
    
    setTimeout(() => { document.getElementById('save-status').innerText = ''; }, 3000);
  } else {
    statusBar.innerText = `Save Error: ${result.error}`;
    document.getElementById('status-bar').className = 'error';
  }
});
