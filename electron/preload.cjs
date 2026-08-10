const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('normixDesktop', {
  platform: process.platform,
  version: process.env.npm_package_version ?? '',
})
