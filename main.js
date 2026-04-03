const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getDesktopFolder() {
  const targetFolder = path.join(app.getPath('desktop'), 'MyEditorFiles');
  if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
  return targetFolder;
}

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf8');
  return { filePath, filename: path.basename(filePath), content };
});

ipcMain.handle('fs:saveFile', async (event, content, customName) => {
  const folder = getDesktopFolder();
  let filename = customName && customName.trim() ? customName.trim() : '';
  
  if (!filename) {
    const d = new Date();
    // Format: file_YYYYMMDD_HHMMSS.txt
    filename = `file_${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}_${d.getHours().toString().padStart(2,'0')}${d.getMinutes().toString().padStart(2,'0')}${d.getSeconds().toString().padStart(2,'0')}.txt`;
  }
  
  const targetPath = path.join(folder, filename);
  
  try {
    fs.writeFileSync(targetPath, content, 'utf8');
    return { success: true, targetPath, filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
