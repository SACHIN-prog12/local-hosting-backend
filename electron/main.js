const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // if you're using preload
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  let indexPath;

  if (app.isPackaged) {
    // Production - load frontend from build folder inside packaged resources
    indexPath = path.join(process.resourcesPath, 'frontend', 'build', 'index.html');
  } else {
    // Dev - load frontend from local folder
    indexPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
  }

  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    mainWindow.loadURL('data:text/html,<h1>Frontend build not found</h1><p>Did you run npm run build in frontend?</p>');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
