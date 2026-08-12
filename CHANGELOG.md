# Changelog

## [1.0.1] - 2026-08-10

### Fixed

- 修正安装包品牌图标，改为软件界面实际使用的 Normix logo
- Windows 安装包补齐 sharp win32-x64 原生模块，修复启动报错
- Windows 安装包补齐 @napi-rs/canvas win32-x64 原生模块，修复 PDF/PPTX 渲染失败
- 已生成页面的作品不再误标为“上传失败”，启动时会自动修复历史错误状态
- 优化无 Poppler 环境下的 PDF 渲染，改为并发渲染并实时更新进度
- 作品库和灵感集检查器默认开启
- 作品库进入灵感集后支持返回、恢复选中位置，并支持上一个/下一个作品
- 标签管理移除右键“新建标签”，禁止作品标签自动同步到标签系统
- 图片标签与作品标签顺序调整，图片标签位于左侧
- 优化放大预览滚轮翻页和灵感集图片拖拽性能
- 补齐 GitHub README 下载说明和界面截图
- 发布脚本支持根据 `package.json` 版本自动创建 Release
- 发布脚本增加直连失败时的代理回退

## [Unreleased]

### Added

- Electron 桌面壳
- electron-builder 打包配置
- macOS / Windows 安装包脚本
- GitHub Actions CI 与 Release 流程
- 开源仓库文档与协议

### Fixed

- 动画 GIF 单次播放
- 动图帧间隔规范化
- 页面复制支持 PNG 剪贴板格式
- 首页与侧边栏品牌文案
