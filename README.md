# 安居有数

[![Project checks](https://github.com/feifeifei686/bohack-project/actions/workflows/ci.yml/badge.svg)](https://github.com/feifeifei686/bohack-project/actions/workflows/ci.yml)

**Dream Defined. Living Refined.**

把「我想要怎样的家」整理成可追溯、可讨论的装修需求。

安居有数是「艾可思 · AI 家装服务平台」赛题的硬装协作 MVP，当前入口采用「澄境」实现。业主从户型出发，分房间与 AI 梳理生活需求，确认总清单，再对照商家回应和原文依据，留下需求、方案与决定的版本记录。

[快速运行](#本机运行) · [演示指南](docs/demo-guide.md) · [文档索引](docs/README.md) · [实现结构](docs/architecture.md) · [参与开发](CONTRIBUTING.md)

## 从生活想法到确认记录

```mermaid
flowchart LR
    A[户型与房间] --> B[分房间 AI 共创]
    B --> C[保存房间需求]
    C --> B
    C --> D[确认并发布总清单]
    D --> E[Flash 需求图谱]
    E --> F[方案回应与原文核对]
    F --> G[反馈修订与用户选择]
    G --> H[版本记录与沟通报告]
```

| 能做什么 | 当前实现 |
| --- | --- |
| 看懂自己的空间 | 上传 JPG、PNG、WebP，AI 识别房间、门窗和可见家具；手工校对后生成概念立体户型，也可使用演示图纸 |
| 逐个房间整理需求 | 从选房间、AI 追问到确认，使用单选、多选与 1–5 级偏好，房间偏好题可选填一句补充；按房间和选择展开细节，逐题显示进度，每间独立保存并可返回修改 |
| 知道下一步做什么 | 工作页共用底部操作栏；缺少必要输入时定位到具体字段，显示说明并移入焦点 |
| 发布清晰的需求基准 | 总清单汇总各房间已保存内容；用户确认发布后，Flash 分析需求关联、表达清晰度和待确认事项 |
| 逐项查看方案差异 | 模拟商家按需求回应，使用本地文字规则标出遗漏和冲突，支持原文定位、反馈、修订及版本回看 |
| 留下可讨论的成果 | 浏览器自动保存项目；导出完整 JSON，或打印沟通报告并另存为 PDF，按 P1 必须满足、P2 优先偏好整理需求 |

房间中尚未保存到总清单的修改会留在对应草稿。AI 建议需要主动采纳，发布和选定方案均由用户确认；分析失败不会撤销已发布的需求版本。详见[分房间共创](docs/room-work.md)、[下一步与缺项定位](docs/workflow-dock.md)、[Flash 需求图谱](docs/requirement-insight.md)和[报告导出](docs/report-export.md)。

## 本机运行

使用 **Node.js 24** 和 npm；根目录 `.nvmrc` 指定了 Node 版本。各子工程独立管理依赖与锁文件，根目录不是 npm workspace。

```sh
git clone https://github.com/feifeifei686/bohack-project.git
cd bohack-project
# 使用 nvm 时先运行：nvm install && nvm use
cd mingma-lab
npm ci
npm run dev
```

打开 [澄境首页](http://127.0.0.1:5188/)。完整演示可用于查看本地方案协作流程；真实 AI 共创、户型识别和需求图谱需要启动 API 服务。在另一个终端中，从仓库根目录运行：

```sh
cd mingma-api
npm ci
# 首次配置时复制；已有 .env 时不要覆盖
cp .env.example .env
# 在本地 .env 填写 DEEPSEEK_API_KEY
npm run build
npm start
```

模型密钥只保存在服务端。前端开发服务将 `/api` 转发到本机 5199；配置、请求示例和错误说明见 [API 服务指南](mingma-api/README.md)与[接口契约](docs/api/README.md)。服务不可用时保留输入并提示错误，不以演示答案冒充模型结果。

macOS 也可双击 [启动明码.command](启动明码.command)运行本机部署。修改源码并通过检查后，在仓库根目录同步部署：

```sh
node scripts/local-deploy.mjs update
node scripts/local-deploy.mjs status
```

使用 `status` 输出的当前局域网地址访问，并确认页面可打开。启停服务、开启局域网与日志位置见[本机部署说明](docs/local-deployment.md)。开发与部署默认共用 5188 / 5199 端口，切换运行方式前先停止已有服务。

## 保存、导出与能力边界

- **本机保存：** 项目、独立房间草稿、图纸、墙体标注、需求版本和确认记录保存在浏览器 IndexedDB。刷新或重新打开同一地址可继续；不同设备、浏览器或网站来源（协议、主机、端口）不会共享，没有云端同步。
- **导出：** 沟通报告通过浏览器打印另存为 PDF，完整 JSON 用于留存项目状态；当前没有 JSON 导入恢复入口。清理浏览器数据会影响本机草稿，重要记录请另行导出。保存失败或记录读取异常会显示恢复提示，不自动覆盖原记录。
- **墙体与空间：** 可手工标注承重、非承重或待核实，并预览拆除意向；默认待核实，不自动判定承重性质。当前户型与需求可联动，独立六层工程及房间线路仍是示意，不能作为施工图。
- **AI 与核对：** Flash 表达清晰度不是施工可行性评分。本地方案核对只检查文字是否回应；自定义需求和专业条件保留人工核对。风险评估提供协作提示，不代替现场测量或专业鉴定。
- **产品范围：** 商家为模拟数据，尚无真实商家账号、消息发送、跨设备协作或任意 PDF / CAD 解析；报价、交易付款与自动学习不在当前实现范围内。

## 开发与验证

```sh
# 在 mingma-lab 中
npm test
npm run build

# 在 mingma-api 中
npm test
npm run build
npm run test:simulation

# 在仓库根目录
node --test scripts/*.test.mjs
```

前端构建包含 TypeScript 检查；API 构建会生成 OpenAPI 和 Postman 集合。依赖模拟需要本机 Postman CLI。浏览器交互、视觉验收与真实模型调用应单独记录，自动测试通过不代表模型准确率或全部人工验收通过。

[GitHub Actions](https://github.com/feifeifei686/bohack-project/actions)展示各提交的自动检查结果。[文档索引](docs/README.md)收录功能说明与带日期的验证记录；历史测试数量仅对应当时版本。

| 目录 | 用途 |
| --- | --- |
| `mingma-lab/` | 当前澄境前端，保留早期设计版本源码 |
| `mingma-api/` | 无状态 AI 服务、契约、客户端与测试 |
| `postman/` | API 请求集合与 DeepSeek 依赖模拟 |
| `scripts/` | macOS 本机部署、同源网关与测试 |
| `docs/`、`diagrams/` | 产品文档、实现说明与可编辑流程图 |
| `mingma-mvp/`、`mingma-3d/` | 早期原型与空间实验 |

产品目标见[需求文档 v1.0](docs/明码产品需求文档_v1.0.pdf)，实际能力以当前源码和验证范围为准。协作规则见 [CONTRIBUTING.md](CONTRIBUTING.md)，素材、字体来源与授权状态见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
