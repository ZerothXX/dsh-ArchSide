# ArchSide · 项目架构

以 Markdown 连接项目设计与程序实现。在对话右侧探索结构，通过 @节点与 Agent 协作，让每次调整都回到清晰、可追踪的架构中。

## 1 需求与结构

<!-- archside: {"id":"structure","color":"blue","status":"implemented","files":["src/core/model.ts"],"summary":"定义章、节、小节和稳定节点标识，以 Markdown 表达可读的项目架构。"} -->

项目架构包含设计意图、节点归属、功能关系及程序定位。尚未实现的功能也可以成为设计节点。

### 1.1 架构 Markdown

<!-- archside: {"id":"markdown","status":"implemented","files":["src/core/markdown.ts"],"summary":"解析章、节、小节、节点元数据和跨章关系；序列化时保留稳定 ID。"} -->

架构 MD 是结构和说明的来源。标题表达层级；元数据记录稳定 ID、颜色、实施状态、关联文件及摘要。

#### 1.1.1 标题与节点规范

<!-- archside: {"id":"heading-format","status":"implemented","files":["src/core/markdown.ts","README.md"],"summary":"章使用 ## 1，节使用 ### 1.1，小节使用 #### 1.1.1；代码示例内的标题不会成为节点。"} -->

##### 输入规范

| 内容层级 | 标题写法 | 作用 |
| --- | --- | --- |
| 章 | `## 1 模块名` | 定义项目的结构部分 |
| 节 | `### 1.1 功能名` | 定义结构内部的功能 |
| 小节 | `#### 1.1.1 处理节点` | 表达输入、方法和结果等具体环节 |

##### 稳定标识

节点重命名或重编号时保留 `id`。连线通过 ID 引用节点，只有实际功能、结构或依赖变化时才调整。

```json
{"id":"image-input","status":"planned","files":[],"summary":"接收待处理图片"}
```

#### 1.1.2 节点关系与校验

<!-- archside: {"id":"edge-validation","status":"implemented","files":["src/core/markdown.ts"],"summary":"检查重复编号、重复 ID、缺失父节点和悬空连线，避免无效结构覆盖有效架构。"} -->

节点支持数据流、依赖和可选关系。关系可连接同一章内的节点，也可跨章连接。循环关系允许存在，不会改变内容的父子层级。

### 1.2 功能与程序映射

<!-- archside: {"id":"mapping","status":"implemented","files":["src/core/model.ts"],"summary":"以项目相对文件路径说明节点由哪些程序实现；设计节点可以没有关联程序。"} -->

节点可以关联多个文件，同一文件也可以服务多个节点。文件定位并不等于静态调用关系，Agent 需要结合代码核实。

## 2 图形与导航

<!-- archside: {"id":"visualization","color":"purple","status":"implemented","files":["src/client/ArchitecturePanel.tsx"],"summary":"以浅色模块、细线箭头和三层导航，将复杂结构组织成可逐层探索的图。"} -->

总览、章内架构和节点详情组成三个展示层级。展示层级与 Markdown 的内容层级各自承担不同职责。

### 2.1 三层架构视图

<!-- archside: {"id":"navigation","status":"implemented","files":["src/client/ArchitecturePanel.tsx","src/core/projection.ts"],"summary":"总览支持简洁与详细；章内显示完整细节；节点详情以只读 Markdown 展示。"} -->

总览详细模式展开各章下的节。扩展节时进入所属章，定位并高亮该节。跨章节点作为可定位的引用，与章内节点一同按关系布局。

#### 2.1.1 总览与章内投影

<!-- archside: {"id":"projection","status":"implemented","files":["src/core/projection.ts","src/core/graph-layout.ts","src/core/edge-routing.ts"],"summary":"按当前视图逐条投影关系，不合并或减少；章内保留直接跨章引用，不递归展开整个项目。"} -->

简洁总览把深层关系投影到章，详细总览投影到可见节；每条原始关系独立保留，不合并同端点关系，折叠到同一节点的关系以回环显示。隐藏章的关系标注“章级关系”。详细总览不显示章节点或章节外框，同章的节用相同颜色区分。第二层展示各节及所有小节，不设分组外框。两层都优先将同章节点相邻放置，再结合上下游关系柔性调整，不设区域边界，允许跨章节点交错及自由拖动。连线采用绕开卡片的圆角折线，分散出入口，尽量减少重叠和交叉；悬停节点时突出相关连线。浅色无箭头点线只补充可见父子节点的“组成”关系，不生成“同章”连线，不表示数据流或执行依赖，不写入 MD 业务关系。

#### 2.1.2 节点详情

<!-- archside: {"id":"detail-view","status":"implemented","files":["src/client/ArchitecturePanel.tsx"],"summary":"展示输入规范、示例、方法、模型、程序文件与上下游关系。"} -->

##### 展示内容

- 功能说明、输入输出和要求。
- 代码片段、表格、方法与模型。
- 项目内的图片示例及关联文件。
- 可跳转的上下游节点。

详情只读。通过「选中 @」把节点加入左侧输入框，再由 Agent 处理修改。

### 2.2 画布与布局

<!-- archside: {"id":"canvas","status":"implemented","files":["src/client/ArchitecturePanel.tsx","src/client/GraphScene.tsx","src/client/drag-preview.ts","src/client/useProjection.ts","src/client/projection-worker.ts","src/client/style.css"],"summary":"动画帧更新拖动，后台计算布局与连线；支持平移、缩放、说明展开和层级返回。"} -->

顶部项目标题和说明采用紧凑显示，为画布保留空间。每种总览模式和每个章内视图独立保存节点位置与缩放状态，结构变化不会重新编号布局引用。按关系重新布局只重置当前视图，不改变架构结构和其他视图的位置。

拖动节点时只按动画帧移动当前卡片及相关连线端点，松手后保存位置，并在后台 Worker 中计算完整布局和避障连线。平移和缩放只改变画布变换，图形组件复用现有内容；MD revision 未变化的轮询也复用架构对象。后台任务只保留正在执行的一项和最新待处理的一项，过期结果不会覆盖当前视图。宿主禁用 Worker 时使用兼容回退。

#### 2.2.1 节点交互

<!-- archside: {"id":"node-actions","status":"implemented","files":["src/client/ArchitecturePanel.tsx"],"summary":"右侧 > 或右键弹出选中 @、扩展、展开三个操作。"} -->

节点默认仅显示编号和名称。展开说明显示摘要、关联文件与实现状态；展开不改变当前展示层级。

## 3 Agent 协作

<!-- archside: {"id":"agent","color":"teal","status":"implemented","files":["src/host/index.ts","src/host/instructions.ts"],"summary":"将图上的明确定位转为对话上下文，由 Agent 分析、修改、验证并回写架构。"} -->

引用可以指向已实现功能，也可以指向尚未实现的设计。引用本身不会发送消息，更不会自动执行程序修改。

### 3.1 节点引用与上下文

<!-- archside: {"id":"references","status":"implemented","files":["src/client/plugin.tsx","src/host/index.ts"],"summary":"支持多个 @节点；由稳定 ID 解析选中节点、下级结构、直接关系和关联文件。"} -->

选中节点将 `@(编号 节点名)` 加入当前对话草稿。用户补充指令后发送，操作范围由指令与实际依赖决定。

#### 3.1.1 程序定位与高亮

<!-- archside: {"id":"agent-focus","status":"implemented","files":["src/host/index.ts","src/client/plugin.tsx"],"summary":"Agent 搜索节点和文件映射后，可请求打开所属章并高亮目标节点。"} -->

使用 `archside_context` 搜索程序路径或功能描述，再使用 `archside_focus` 定位稳定节点 ID。没有准确映射时需要说明。

### 3.2 架构发布与反馈

<!-- archside: {"id":"agent-publish","status":"implemented","files":["src/host/index.ts","src/host/instructions.ts"],"summary":"任务结束时统一提交有效架构；最终对话回复明确说明修改了图、程序或两者。"} -->

先读取版本，再完成代码修改和必要检查，最后发布完整 MD。对设计问题，只更新设计；对分析问题，可以不产生任何文件变更。

## 4 文件与同步

<!-- archside: {"id":"persistence","color":"orange","status":"implemented","files":["src/host/repository.ts"],"summary":"以原子写入、版本检查和文件观察保障架构与独立布局的持久化。"} -->

架构存放在项目根目录 `architecture.md`；图形布局存放在 `.archside/layout.json`。发布前的架构保留在 `.archside/history/`。

### 4.1 文件观察与任务状态

<!-- archside: {"id":"sync","status":"implemented","files":["src/host/repository.ts","src/host/index.ts"],"summary":"任务进行时保留稳定画面，任务结束后统一刷新；外部文件变化提示可能需要同步。"} -->

代码变化无法直接等同于架构变化，因此插件标记同步状态，由 Agent 检查影响，而不是擅自重写结构。

#### 4.1.1 版本冲突与历史

<!-- archside: {"id":"revision-control","status":"implemented","files":["src/host/repository.ts"],"summary":"以内容摘要检查并发修改；冲突时重新读取合并，提交前保留旧架构。"} -->

`archside_publish` 需要传入最新读取的 revision。其他任务或编辑器修改 MD 后，旧版本提交会失败，避免覆盖新内容。

### 4.2 DSH 原生接入

<!-- archside: {"id":"dsh-integration","status":"implemented","files":["src/compat/dsh.ts","src/client/plugin.tsx","src/client/dsh-api.ts","src/core/remote.ts","src/host/index.ts","cordis.patch.yml","package.json","scripts/install-desktop.ps1","scripts/test-compatibility.mjs","tests/compatibility.test.ts"],"summary":"注册 DSH 侧栏与远程服务；基于实际接口能力兼容，不按宿主版本号限制加载，验证记录维护在 README。"} -->

插件使用 Cordis 生命周期管理资源，使用 DSH 自带的 React 与对话输入服务。最终交互在 DSH 桌面端验证。

宿主版本声明与 peer 依赖均使用 `*`，安装脚本只显示检测到的版本，不按版本范围拦截。底层兼容层统一检查核心服务、远程协议、侧栏插槽和输入框能力，不依赖宿主版本字符串。输入框服务按操作动态获取，缺失时只影响草稿引用，架构阅读仍可使用；缺少个别远程方法时只拒绝相关操作。开发 SDK 固定用于可重复构建；隔离多版本测试验证真实网关、类型、构建和浏览器入口，已验证的宿主版本仅在 README 中记录。公开接口被删除或语义发生变化时仍需更新兼容层。

```archside
{
  "version": 1,
  "edges": [
    {"id":"structure-to-view","source":"markdown","target":"projection","label":"架构数据","kind":"data"},
    {"id":"view-to-agent","source":"node-actions","target":"references","label":"@节点","kind":"data"},
    {"id":"agent-to-publish","source":"references","target":"agent-publish","label":"分析与修改","kind":"data"},
    {"id":"publish-to-store","source":"agent-publish","target":"revision-control","label":"版本检查","kind":"dependency"},
    {"id":"store-to-view","source":"sync","target":"navigation","label":"完成后刷新","kind":"data"},
    {"id":"format-to-mapping","source":"heading-format","target":"mapping","label":"节点定义","kind":"data"},
    {"id":"mapping-to-context","source":"mapping","target":"references","label":"程序定位","kind":"data"},
    {"id":"focus-to-navigation","source":"agent-focus","target":"navigation","label":"跳转高亮","kind":"optional"},
    {"id":"projection-to-detail","source":"projection","target":"detail-view","label":"逐层探索","kind":"data"},
    {"id":"layout-to-store","source":"canvas","target":"sync","label":"独立布局","kind":"data"},
    {"id":"validation-to-publish","source":"edge-validation","target":"agent-publish","label":"结构校验","kind":"dependency"}
  ]
}
```
