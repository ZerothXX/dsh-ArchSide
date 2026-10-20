[中文](README.md) | [English](README.en.md)

![ArchSide — Project Architecture × Agent](pictures/archside-cover.png)

# ArchSide

**在图中定位架构，在对话中与 Agent 完成修改。**

ArchSide 是面向 **DeepSeek Harness** 的通用项目架构侧栏插件。左侧保留原生 Agent 对话，右侧展示可逐层探索的架构图；以一个 `architecture.md` 连接项目需求、结构设计和程序实现。

当前版本 **0.1.5**，适配 **DSH Desktop 0.2.1-rc.2**。支持已有代码的项目，也支持尚未实现的需求设计，不绑定业务类型或编程语言。

## 效果展示

![DSH 内的 ArchSide：左侧原生 Agent 对话，右侧项目架构图](pictures/show1.png)

*真实桌面效果：在右侧浏览架构，选择节点后通过左侧对话分析、调整设计或修改程序。封面为概念插画，实际界面以此截图为准。*

## 可以做什么

- **逐层探索**：项目总览 → 章内完整结构 → 节点详细说明；总览可切换简洁和详细。
- **引用节点协作**：通过 `>` 或右键选择「选中 @」，将节点加入原生输入框；支持多个引用，由用户补充指令后发送。
- **从需求或代码起步**：没有 MD 时，Agent 可扫描代码生成初稿；没有程序时，也可从需求设计架构并围绕节点讨论。
- **架构与 MD 对应**：标题表达章、节、小节；稳定 ID 维护关系，编号或名称调整不会靠名称重新连线。
- **自由布局、完整关系**：同章节点尽量相近，颜色区分类别，不设章节外框。细圆角折线避让卡片，原始关系逐条保留；点线只表示父子「组成」，不额外连接同章节点。
- **流畅移动**：拖动时按动画帧更新节点及相连线条，松手后在后台计算完整布局和避障连线；平移、缩放及未变化的轮询复用现有图形。
- **操作与定位**：拖动节点、平移、缩放、适应画布、全部展开/收起；搜索节点、文件或说明文字，并定位高亮。
- **任务完成后同步**：任务期间保留图并显示状态，完成后刷新；外部文件变化提示检查同步，发布提供版本冲突检查和历史备份。

### 三层视图

| 层级 | 展示内容 | 典型操作 |
| --- | --- | --- |
| 项目总览 | 简洁显示章；详细显示节，无章节点和章节外框 | 了解整体结构、选择模块 |
| 章内架构 | 该章的全部节与小节，以及直接跨章关联 | 查看输入、处理方法、输出和依赖 |
| 节点详情 | 只读 Markdown，含说明、规范、表格、代码和项目内图片 | 阅读实现细节，通过 `@` 请求修改 |

在总览中扩展 `1.2`，会进入第 1 章并定位、高亮 `1.2`。跨章引用可跳转至所属章。节点「展开」显示简要说明，「扩展」进入下一层。

## 安装与打开

### 方式一：在对话中让 Agent 安装

在 DSH 中将本项目的 GitHub 仓库地址、已下载的安装包或本地项目路径发给 Agent，例如：

> 请帮我安装 ArchSide 插件，安装来源是：〈仓库地址、安装包地址或本地路径〉。请按项目 README 完成安装；如果来源是源码，先构建并打包，再通过 DSH 内置插件管理安装。完成后告诉我是否需要重启，以及如何打开架构面板。

按 DSH 的提示完成安装确认；如果提示需要重启，保存任务后重新打开 DSH。

### 方式二：在桌面端插件页安装

1. 打开 DSH 左侧 **「插件」** 页面。
2. 点击右上角 **「添加插件」**，或点击旁边的下拉箭头，选择 **「安装第三方插件」**。
3. 输入 ArchSide 的 `.tgz` 安装包绝对路径、安装包下载地址，或**已构建的本地项目目录**，点击安装。
4. 按页面提示完成安装和启用；需要重启时，保存任务后重启 DSH。

<details>
<summary>查看桌面端安装入口</summary>

![DSH 插件页：添加插件 → 安装第三方插件](pictures/install-plugin.png)

</details>

插件页也支持 npm 包名和 Git 地址。从 GitHub 源码安装可交给 Agent 完成构建，或先按下方方式生成安装包。使用 npm 包名需要先发布到 npm；仓库提供 Release 安装包后，可直接使用其下载地址。

### 方式三：从源码手动安装

1. 下载或克隆本仓库，在根目录打开 PowerShell。
2. 保存 DSH 中的任务，从应用菜单或托盘**完全退出 DSH**。
3. 安装依赖并运行脚本，将路径替换为自己的 DSH 安装目录：

```powershell
npm.cmd ci
npm.cmd run install:desktop -- -DesktopDirectory 'C:\Path\To\DeepSeek Harness'
```

脚本检查宿主版本与运行进程，构建并打包插件，备份 desktop profile 的包清单和锁文件，再通过 **DSH 桌面自带 CLI** 安装。备份位于本地 `artifacts/`，脚本不会结束用户进程。

4. 安装完成后重新打开 DSH。

### 打开 ArchSide

进入项目的正式对话，点击对话顶部 **「架构」**，在右侧打开 ArchSide。新会话首页可能尚无入口，建立正式对话后即可使用。

已有 ArchSide 格式的 `architecture.md` 会自动读取；没有时点击「交给 Agent 生成」，补充需求后发送。源码更新后需重新安装，桌面插件不会随源码热更新。

<details>
<summary>手动打包、安装与移除</summary>

```powershell
npm.cmd run pack:plugin
& 'C:\Path\To\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add 'C:\Path\To\ArchSide\dsh-plugin-archside-0.1.5.tgz'
```

移除时，完全退出 DSH 后执行：

```powershell
& 'C:\Path\To\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop remove dsh-plugin-archside
```

请使用桌面自带 CLI 操作 desktop profile。宿主安装说明见 [DSH Desktop 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)。

</details>

## 与 Agent 协作

节点菜单选择「选中 @」，补充操作要求后发送，例如：

> @(1.2 功能与程序映射) 分析这一部分的职责和依赖，仅调整架构设计。

> @(2.2 画布与布局) 增加布局恢复功能，同步修改程序与架构说明。

也可以询问某段程序在图中的位置，Agent 可展开相应章并高亮节点。

引用表示明确的操作对象，实际修改范围由指令与依赖决定。插件提供 `archside_read`、`archside_context`、`archside_publish` 和 `archside_focus` 工具，由 Agent 分析和修改程序、发布架构。回复应说明此次属于**仅架构、架构与程序、仅程序或仅分析**；执行依赖模型和宿主工具权限。

## Markdown 与数据

每个项目使用一个 UTF-8 `architecture.md`，例如：

```markdown
# 图片处理项目

接收图片，完成预处理并输出模型结果。

## 1 输入与预处理
<!-- archside: {"id":"input","color":"blue","status":"planned","files":[]} -->

### 1.1 图片输入
<!-- archside: {"id":"image-input","status":"planned","files":[]} -->

#### 1.1.1 格式校验
<!-- archside: {"id":"validation","status":"planned","files":[]} -->
```

编号最多三级，父节点应先出现，编号与 ID 不得重复。节点重命名或重新编号时保留 `id`；新增功能使用新 ID。`color` 可选 `blue`、`purple`、`teal`、`orange`、`slate`；`status` 可选 `planned`、`implemented`、`unknown`；`files` 为项目相对文件路径数组，`summary` 为简短说明。正文承载节点完整详情。

关系通过一个 `archside` 代码块显式描述，端点引用稳定 ID，例如：

```archside
{"version":1,"edges":[{"id":"input-validation","source":"image-input","target":"validation","label":"待校验图片","kind":"data"}]}
```

边的 `id` 唯一，`kind` 支持 `data`、`dependency`、`optional`。允许跨章连接，删除节点时需处理相关边。完整示例见 [examples/architecture.md](examples/architecture.md)。普通 Markdown 需符合该格式才能解析为架构图。

| 文件 | 内容 |
| --- | --- |
| `architecture.md` | 架构、说明、节点元数据和关系，建议纳入版本管理 |
| `.archside/layout.json` | 本地节点位置与视口，独立于架构内容 |
| `.archside/history/` | 插件发布前的架构历史备份 |

原始业务关系不会因整理画面而减少；折叠内部关系显示回环，隐藏章的投影标注「章级关系」。无箭头浅色点线只表示父子「组成」，不生成「同章」连线，也不写入 MD 业务关系。复杂图仍可能有交叉；外部代码变化需 Agent 核查后同步，多窗口布局采用最后保存。

项目内图片支持 PNG/JPEG/WebP/GIF，大小限制为 4 MB；不执行 Markdown 内的 HTML。节点引用映射保存在当前运行会话中，重启后历史对话中的旧编号需重新选择节点或用稳定 ID 核对。

## 开发与验证

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run dev
```

打开 <http://127.0.0.1:4173>。预览读取当前目录的 `architecture.md`，左侧为未连接模型的草稿测试区。真实 Agent 协作在 DSH 内验证。可通过 `ARCHSIDE_PREVIEW_WORKSPACE` 指定其他工作区。

```powershell
npm.cmd run check
npm.cmd run test:ui
npm.cmd run test:performance
npm.cmd run pack:plugin
```

`check` 包含类型检查、自动测试和构建；界面测试及打包入口验证使用本机 **Google Chrome**。界面测试在临时工作区运行，截图输出到 `artifacts/`。当前有 31 项自动测试，覆盖 MD、稳定关系、布局、连线、拖动预览、存储及 DSH 适配。`test:performance` 使用 120 个节点和 134 条业务关系，检查后台计算、拖动重算次数、平移缩放复用及交互帧耗时。

| 目录 | 职责 |
| --- | --- |
| `src/core/` | 数据模型、MD 解析、图投影、布局及连线 |
| `src/client/` | 三层面板、DSH 侧栏与输入框适配 |
| `src/host/` | 工作区文件、任务状态、Agent 工具及网关 |
| `src/preview/` | 本地开发预览 |
| `tests/`、`scripts/` | 测试、构建、打包及桌面安装 |

当前 `package.json` 的许可字段为 `UNLICENSED`，尚未选定开源许可证。
