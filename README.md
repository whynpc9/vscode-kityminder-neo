# vscode-kityminder-neo

A minimal VS Code extension for viewing and editing KityMinder `.km` mindmap files, with `.xmind` import support.

## Features

- Open and edit `.km` files in a custom visual editor
- Canvas 内交互式编辑（选中、拖动、内联编辑等）
- Switch between `default`, `right`, and `structure` templates
- Catppuccin 配色切换（Latte / Frappé / Macchiato / Mocha）
- Import `.xmind` files and convert them to `.km`
- Undo / Redo 支持

## 支持的操作

### 选中

| 操作 | 说明 |
|---|---|
| 单击节点 | 选中该节点 |
| 单击空白区域 | 取消选中 |
| 方向键 ↑ / ↓ | 在兄弟节点间导航（structure 布局下为父子导航） |
| 方向键 ← | 导航到父节点（structure 布局下为上一个兄弟） |
| 方向键 → | 导航到第一个子节点（structure 布局下为下一个兄弟） |

### 展开 / 收缩

| 操作 | 说明 |
|---|---|
| Space | 切换当前节点的展开/收缩状态 |
| 工具栏「展开」按钮 | 展开当前节点 |
| 工具栏「收起」按钮 | 收缩当前节点 |
| 工具栏 1 / 2 / 3 按钮 | 展开到指定层级 |
| 工具栏「全部」按钮 | 展开所有节点 |

### 编辑节点标题

| 操作 | 说明 |
|---|---|
| 双击节点 | 进入内联编辑模式 |
| F2 | 对当前选中节点进入内联编辑模式 |
| Enter（编辑中） | 确认编辑内容 |
| Escape（编辑中） | 取消编辑，恢复原文本 |
| 侧边栏标题输入框 | 修改当前选中节点的标题 |
| 侧边栏备注输入框 | 修改当前选中节点的备注（Markdown） |

### 新增 / 删除节点

| 操作 | 说明 |
|---|---|
| Tab | 新增一个子节点，并立即进入编辑模式 |
| Enter | 新增一个兄弟节点（插入到当前节点之后），并立即进入编辑模式 |
| Tab（编辑中） | 确认当前编辑，新增子节点并继续编辑 |
| Delete / Backspace | 删除当前选中节点及其所有子节点 |
| 工具栏「添加子节点」按钮 | 新增一个子节点 |
| 工具栏「添加同级节点」按钮 | 新增一个兄弟节点 |
| 工具栏「添加父节点」按钮 | 在当前节点上方插入一个父节点 |
| 工具栏「删除节点」按钮 | 删除当前选中节点及其所有子节点 |

### 拖动节点

| 操作 | 说明 |
|---|---|
| 拖动非根节点到另一个节点上 | 将该节点（含所有子节点）移动为目标节点的子节点 |
| 拖动非根节点到两个兄弟节点之间 | 将该节点插入到目标位置（调整顺序） |
| Alt + ↑ | 在同一父节点下向上移动当前节点（调整顺序） |
| Alt + ↓ | 在同一父节点下向下移动当前节点（调整顺序） |

> 拖动操作不允许将节点拖到自身或其后代节点上。  
> 拖动和排序结果会实时反映到 `.km` 文件的 JSON 子成员顺序中。

### 复制 / 粘贴 / 剪切

| 操作 | 说明 |
|---|---|
| Ctrl+C (⌘C) | 复制当前选中节点及其整个子树到剪贴板 |
| Ctrl+X (⌘X) | 剪切当前选中节点及其整个子树（不可剪切根节点） |
| Ctrl+V (⌘V) | 将剪贴板内容粘贴为当前选中节点的子节点 |

> 支持跨 `.km` 文件操作：在一张图中复制一个分支，切换到另一张图后粘贴即可。  
> 如果剪贴板中是普通文本（非脑图节点数据），粘贴时会创建一个以该文本为标题的新子节点。

### 键盘快捷键汇总

| 快捷键 | 功能 |
|---|---|
| Tab | 新增子节点并编辑 |
| Enter | 新增兄弟节点并编辑 |
| Delete / Backspace | 删除选中节点及子树 |
| F2 | 进入内联编辑 |
| Escape | 取消编辑 |
| Space | 切换展开/收缩 |
| ↑ / ↓ | 兄弟节点间导航 |
| ← / → | 父子节点间导航 |
| Alt + ↑ / ↓ | 同级节点间调整顺序 |
| Ctrl+C (⌘C) | 复制 |
| Ctrl+X (⌘X) | 剪切 |
| Ctrl+V (⌘V) | 粘贴 |
| Ctrl+Z (⌘Z) | 撤销 |
| Ctrl+Shift+Z (⌘⇧Z) / Ctrl+Y | 重做 |

### 布局与视图

| 操作 | 说明 |
|---|---|
| 工具栏「脑图 / 右展 / 组织」按钮 | 切换布局模板 |
| 工具栏「整理布局」按钮 | 重置所有节点布局 |
| 工具栏「居中」按钮 | 将视图居中到内容 |
| 工具栏「适应画布」按钮 | 缩放至内容适应画布 |
| 工具栏 Latte / Frappé / Macchiato / Mocha | 切换 Catppuccin 配色方案 |
| 鼠标滚轮 | 缩放画布 |
| 鼠标右键拖动空白区域 | 平移画布 |

### 其他

| 操作 | 说明 |
|---|---|
| 工具栏「源码 JSON」按钮 | 以文本编辑器打开 `.km` 文件的原始 JSON |
| 工具栏「撤销」/「重做」按钮 | 撤销 / 重做最近的操作（最多 50 步） |
| 资源管理器右键 `.xmind` → Import XMind to KM | 将 XMind 文件导入为 `.km` |

## Development

```bash
npm install
npm run build
```

Then press `F5` in VS Code to launch an Extension Development Host.

## Validation

```bash
npm run build
npm test
npx tsc --noEmit
```
