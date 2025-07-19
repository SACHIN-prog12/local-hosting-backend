// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let backendProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // If you need it
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the built React app's index.html
  win.loadFile(path.join(__dirname, '../frontend/build/index.html')); 

  // Optional: Open the DevTools.
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  // Start the Node.js backend server as a child process
  backendProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '../backend'),
    env: { 
        ...process.env, 
        PORT: '5000', 
        MONGODB_URI: 'mongodb://localhost:27017/gym_dashboard',
        MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY, // Pass from Electron's env if set there
        MSG91_SENDER_ID: process.env.MSG91_SENDER_ID,
        MSG91_FLOW_ID: process.env.MSG91_FLOW_ID
    }, 
    stdio: 'inherit'
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend process:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend process exited with code ${code} and signal ${signal}`);
    if (code !== 0) {
      console.error('Backend server crashed!');
    }
  });

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

app.on('will-quit', () => {
  // Kill the backend process when Electron app quits
  if (backendProcess) {
    console.log('Killing backend process...');
    backendProcess.kill();
  }
});