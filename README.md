# Normix

Normix 是一个开源的 PPT 灵感集管理平台，支持上传 PDF、图片集 PPT、ZIP 和单张图片，自动整理为图集，并提供标签、文件夹、回收站、搜索和预览能力。

## 功能

- 上传 PDF / 图片集 PPT / ZIP / PNG / JPG / WEBP / GIF
- 自动将 PDF 和 PPTX 处理为页面图集
- 标签管理、文件夹整理、回收站
- 页面预览、复制、导出
- 动画 GIF 单次播放，避免循环闪烁
- 本地 SQLite 存储，适合个人和团队本地使用

## 桌面版

桌面版基于 Electron，内置 Express 服务和 SQLite 数据库。

### macOS

下载对应架构的 DMG 后安装：

```text
Normix-1.0.0-mac-arm64.dmg
Normix-1.0.0-mac-x64.dmg
```

未签名版本首次打开时，请在 Finder 中右键应用并选择“打开”。

### Windows

下载安装包：

```text
Normix-1.0.0-win-x64-setup.exe
```

如果出现 SmartScreen 提示，请选择“更多信息 > 仍要运行”。

## 从源码运行

```bash
npm ci
npm run dev
```

前端默认运行在 `http://localhost:5173/`，API 默认运行在 `http://localhost:4000/`。

## 从源码构建桌面版

```bash
npm ci
npm run build
npm run desktop:dev
```

构建安装包：

```bash
npm run package:mac
npm run package:win
```

如果下载 Electron 或 DMG 工具超时，可以使用国内镜像：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm run package:mac
```

## 数据存储

桌面版数据位于：

- macOS：`~/Library/Application Support/Normix`
- Windows：`%APPDATA%\Normix`

开发模式数据位于当前项目的 `data/` 和 `storage/`，这些目录默认不进入 Git。

## 技术栈

- React
- Vite
- Express
- SQLite
- Electron
- Sharp
- JSZip
- pdfjs-dist / Poppler

## 开源协议

本项目使用 [MIT License](LICENSE)。
