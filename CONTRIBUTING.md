# Contributing to Normix

感谢你愿意参与 Normix。

## 开发环境

```bash
npm ci
npm run dev
```

## 提交规范

建议使用 Conventional Commits：

```text
feat: add desktop packaging
fix: preserve animated gif timing
docs: update installation guide
chore: update dependencies
```

## 分支

默认分支为 `main`。新功能请使用独立分支，并通过 Pull Request 合入。

## 检查

提交前请运行：

```bash
npm run lint
npm run build
```

## 隐私

`data/`、`storage/`、`backups/`、`deploy/` 不应进入 Git。提交前请检查没有用户数据或隐私截图。
