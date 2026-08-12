import { app, BrowserWindow, dialog, Menu, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.setName('Normix')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let mainWindow = null
  let normixServer = null
  let displayRefreshListenersRegistered = false
  let surfaceRefreshTimer = null

  const refreshWindowSurface = () => {
    surfaceRefreshTimer = null
    if (!mainWindow || mainWindow.isDestroyed()) return

    mainWindow.setBackgroundColor('#ffffff')
    mainWindow.webContents.invalidate()

    if (process.platform === 'darwin' && mainWindow.isVisible()) {
      const opacity = mainWindow.getOpacity()
      if (opacity === 1) {
        mainWindow.setOpacity(0.9999)
        setTimeout(() => {
          if (!mainWindow?.isDestroyed()) mainWindow.setOpacity(1)
        }, 40)
      }
    }
  }

  const scheduleWindowSurfaceRefresh = (delay = 120) => {
    if (surfaceRefreshTimer !== null) clearTimeout(surfaceRefreshTimer)
    surfaceRefreshTimer = setTimeout(refreshWindowSurface, delay)
  }

  const registerDisplayRefreshListeners = () => {
    if (displayRefreshListenersRegistered) return
    displayRefreshListenersRegistered = true

    screen.on('display-metrics-changed', () => scheduleWindowSurfaceRefresh(120))
    screen.on('display-added', () => scheduleWindowSurfaceRefresh(120))
    screen.on('display-removed', () => scheduleWindowSurfaceRefresh(120))
  }

  const userData = app.getPath('userData')
  process.env.NORMIX_DESKTOP = '1'
  process.env.DATA_DIR = path.join(userData, 'data')
  process.env.STORAGE_DIR = path.join(userData, 'storage')
  process.env.HOST = '127.0.0.1'
  process.env.PORT = '0'

  const createWindow = async () => {
    try {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize
      if (!normixServer) {
        const serverModule = await import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href)
        normixServer = await serverModule.startNormixServer({ host: '127.0.0.1', port: 0 })
        console.log('Normix desktop ready', normixServer.url)
      }

      mainWindow = new BrowserWindow({
        width,
        height,
        minWidth: 960,
        minHeight: 640,
        title: 'Normix',
        show: false,
        autoHideMenuBar: process.platform === 'win32',
        icon: path.join(__dirname, '..', 'build', 'icon.png'),
        backgroundColor: '#ffffff',
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      })

      mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        mainWindow?.maximize()
        scheduleWindowSurfaceRefresh(0)
        setTimeout(() => scheduleWindowSurfaceRefresh(100), 100)
        setTimeout(() => scheduleWindowSurfaceRefresh(700), 700)
      })
      mainWindow.on('show', () => scheduleWindowSurfaceRefresh(120))
      mainWindow.on('focus', () => scheduleWindowSurfaceRefresh(0))
      mainWindow.on('moved', () => scheduleWindowSurfaceRefresh(80))
      mainWindow.on('resized', () => scheduleWindowSurfaceRefresh(80))
      mainWindow.on('maximize', () => scheduleWindowSurfaceRefresh(80))
      mainWindow.on('unmaximize', () => scheduleWindowSurfaceRefresh(80))
      mainWindow.on('enter-full-screen', () => scheduleWindowSurfaceRefresh(80))
      mainWindow.on('leave-full-screen', () => scheduleWindowSurfaceRefresh(80))

      registerDisplayRefreshListeners()

      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
        return { action: 'deny' }
      })

      mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(normixServer?.url ?? '')) event.preventDefault()
      })

      await mainWindow.loadURL(normixServer.url)
      scheduleWindowSurfaceRefresh(250)
    } catch (error) {
      console.error('Normix failed to start', error)
      dialog.showErrorBox('Normix 启动失败', error instanceof Error ? error.message : String(error))
      app.quit()
    }
  }

  app.setAboutPanelOptions({
    applicationName: 'Normix',
    applicationVersion: app.getVersion(),
    copyright: 'Normix contributors',
  })

  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    void createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    normixServer?.server.close()
  })
}
