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
let currentLanguage = 'plaintext';
let currentJSONPath = '';

const editorContainer = document.getElementById('editor-container');
const treeContainer = document.getElementById('tree-container');
const statusBar = document.getElementById('status-text');
const copyPathBtn = document.getElementById('copy-path-btn');
const inputFileName = document.getElementById('file-name');

function getLanguageFromFilename(filename) {
  const extMatch = filename.match(/\.([^.]+)$/);
  if (!extMatch) return 'plaintext';
  const ext = extMatch[1].toLowerCase();
  const langMap = { 'js': 'javascript', 'json': 'json', 'py': 'python', 'html': 'html', 'css': 'css', 'ts': 'typescript', 'txt': 'plaintext' };
  return langMap[ext] || 'plaintext';
}

require(['vs/editor/editor.main'], function() {
  
  // Custom theme for Rainbow Brackets + Vibrant JSON syntax
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
    bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
    guides: {
        bracketPairs: true,
        indentation: true,
        highlightActiveBracketPair: true
    },
    matchBrackets: 'always',
    automaticLayout: true,
    roundedSelection: true,
    minimap: { enabled: false }, // Turn off minimap for cleaner split view
    padding: { top: 16, bottom: 16 }
  });

  // Highlight roughly near selection to Tree
  editor.onDidChangeCursorSelection((e) => {
    if(currentLanguage !== 'json') return;
    const word = editor.getModel().getWordAtPosition(e.selection.getStartPosition());
    if(word && jsonTree) {
       // Search is fully exposed via native JSON tree Ctrl+F
    }
  });

  // Setup Advanced JSONEditor
  const options = {
    mode: 'tree',
    search: true, // Internal search enabled
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
         { text: 'Copy Value', click: () => copyToClipboard(JSON.stringify(node.value, null, 2)) },
         { type: 'separator' },
         { text: 'Expand All', click: () => jsonTree.expandAll() },
         { text: 'Collapse All', click: () => jsonTree.collapseAll() },
         { type: 'separator' },
         ...items // Default format/extract
       ];
    },
    onEvent: function (node, event) {
      if (event.type === 'click' && node.path) {
        // Dynamically compute full path of node
        const dotNotation = node.path.map(p => typeof p === 'number' ? `[${p}]` : `.${p}`).join('').replace(/^\./, '');
        const bracketNotation = node.path.map(p => typeof p === 'number' ? `[${p}]` : `["${p}"]`).join('');
        currentJSONPath = dotNotation;
        
        statusBar.innerText = `[PATH] ${dotNotation}  ||  ${bracketNotation}`;
        document.getElementById('status-bar').className = '';
        copyPathBtn.classList.remove('hidden');

        // Bidirectional trace highlight
        highlightInEditor(node);
      }
    }
  };
  jsonTree = new JSONEditor(treeContainer, options);

  editor.onDidChangeModelContent(() => {
    if (currentLanguage === 'json') {
      try {
        const val = editor.getValue();
        if (val.trim()) {
           jsonTree.update(JSON.parse(val));
           document.getElementById('status-bar').className = '';
        } else {
           jsonTree.set({});
        }
      } catch (e) {
        // Handle invalid JSON gracefully without crashing
        statusBar.innerText = `Invalid JSON: ${e.message}`;
        document.getElementById('status-bar').className = 'error';
      }
    }
  });

  setTimeout(() => { editor.layout(); }, 200);
});

// Monaco Highlights
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
   if(currentJSONPath) copyToClipboard(currentJSONPath);
});

function setLayoutForLanguage(language) {
  currentLanguage = language;
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

document.getElementById('btn-new').addEventListener('click', () => {
  if (editor) {
    editor.setValue('');
    inputFileName.value = '';
    setLayoutForLanguage('plaintext');
    statusBar.innerText = 'New buffer created.';
    document.getElementById('save-status').innerText = '';
  }
});

document.getElementById('btn-format').addEventListener('click', () => {
   if(editor) editor.getAction('editor.action.formatDocument').run();
});

document.getElementById('btn-open').addEventListener('click', async () => {
  document.getElementById('save-status').innerText = '';
  const fileData = await window.electronAPI.openFile();
  if (fileData) {
    const lang = getLanguageFromFilename(fileData.filename);
    setLayoutForLanguage(lang);
    
    let content = fileData.content;
    if(lang === 'json') {
        try { content = JSON.stringify(JSON.parse(content), null, 4); } catch(e){}
    }
    
    editor.setValue(content);
    inputFileName.value = fileData.filename;
    statusBar.innerText = `Opened: ${fileData.filePath}`;
  }
});

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!editor) return;
  const content = editor.getValue();
  const filename = inputFileName.value;
  
  document.getElementById('save-status').innerText = 'Saving...';
  const result = await window.electronAPI.saveFile(content, filename);
  
  if (result.success) {
    document.getElementById('save-status').innerText = `✓ Saved`;
    inputFileName.value = result.filename;
    statusBar.innerText = `Saved successfully! Path: ${result.targetPath}`;
    
    const lang = getLanguageFromFilename(result.filename);
    if (lang !== currentLanguage) {
      setLayoutForLanguage(lang);
    }
    if(lang === 'json' && content.trim()) {
       try { jsonTree.update(JSON.parse(content)); } catch(e){}
    }
    
    setTimeout(() => { document.getElementById('save-status').innerText = ''; }, 3000);
  } else {
    statusBar.innerText = `Save Error: ${result.error}`;
    document.getElementById('status-bar').className = 'error';
  }
});
