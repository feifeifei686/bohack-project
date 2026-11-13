# C 版 筑序 Atelier

访问根设计展厅后选择 C，或打开 `http://localhost:5188/versions/atelier/index.html`。

这是一版可操作的建筑方案册。桌面采用细目录、宽幅厨房摄影、项目摘要与双栏轴测图；功能页采用访谈记录、需求档案、证据批注与印刷式对照表。手机版本保留横向章节导航及完整工作流程。

## 页面与验收入口

| 页面 | 地址片段 | 主要操作 |
| --- | --- | --- |
| 项目总览 | #overview | 开始访谈、完整示例、空间选择、重置 |
| 生活访谈 | #clarify | 五轮基础问题、草稿恢复 |
| 需求档案 | #requirements | 编辑、优先级、发布与历史版本 |
| 维度索引 | #dimensions | 19项成熟度与依据、导出 |
| 方案审阅 | #compare | 两商家比较、证据、反馈与选择 |
| 商家修订 | #vendor | CSV模板与导入、手动编辑、修订 |
| 空间图纸 | #space | 旋转、俯视、房间与管线图层 |
| 确认归档 | #records | 选择快照、未决项及操作记录 |

## 实现与数据

主模板在 `src/main.ts`，基础和首页样式在 `src/style.css`，功能页样式在 `src/workspace-atelier.css`。`src/atelier-model.ts` 使用三维顶点投影绘制可交互模型，不依赖WebGL。摄影引用根目录的 `/assets/atelier.webp`，为概念参考素材，不是实际商家方案。

数据隔离键为 `mingma-atelier-v1`、`mingma-atelier-dimensions-v1` 与 `mingma-atelier-drafts-v1`。全部数据仅存当前浏览器；不存在真实企业发送、大模型调用或跨设备同步。

## 已执行检查

- 严格 TypeScript 检查。
- 完整浏览器流程14项断言通过，包括澄清、发布、反馈、修订、选择、旧版本失效与量表依据。
- 空间交互10项断言通过，包括旋转、俯视、房间联动、路线隔离、图层与墙体。
- 桌面首页、方案、量表，以及390px首页、访谈、量表截图检查。

共用边界修正已统一复测，历史结果见[验收摘要](../../review/verification.json)。原始截图本地留存，仓库保留[桌面预览](../../public/previews/atelier-desktop.webp)和[手机预览](../../public/previews/atelier-mobile.webp)。当前自动测试与构建结果以 GitHub Actions 为准。
