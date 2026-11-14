# 文档索引

安居有数当前以澄境为主入口，完成「户型 → 分房间共创 → 汇总发布 → Flash 分析 → 方案核对 → 确认与导出」的协作流程。从[项目首页](../README.md)了解范围，按[演示指南](demo-guide.md)体验。

## 使用与实现

| 文档 | 阅读内容 |
| --- | --- |
| [本机部署](local-deployment.md) | macOS 启停、更新、动态局域网地址及日志 |
| [演示与验收](demo-guide.md) | 主要流程、刷新恢复、版本隔离和能力边界 |
| [实现结构](architecture.md) | 工程入口、状态与存储、AI 请求和网关 |
| [分房间共创](room-work.md) | 独立访谈、问卷续接、保存与总清单 |
| [底部操作栏](workflow-dock.md) | 下一步、缺项定位、焦点和忙碌状态 |
| [Flash 需求图谱](requirement-insight.md) | 发布后分析、原文关联、版本与失败重试 |
| [报告导出](report-export.md) | P1 / P2、分房间需求、证据与打印 PDF |
| [风险评估](risk-assessment.md) | 八维检查、原文、处理安排与复评 |
| [AI 接口契约](api/README.md) | intake、floorplan、requirement-insight 与兼容接口 |
| [协作指南](../CONTRIBUTING.md) | 分支、验证、存储与用户确认规则 |

项目保存在当前浏览器同一来源的 IndexedDB，刷新后可继续；没有云端账户或跨设备同步。墙体性质需手工标注。商家回应仍为模拟数据和本地文字规则，真实 AI 已用于需求共创、户型识别与发布后分析。

## 产品目标与设计

| 文档 | 范围 |
| --- | --- |
| 产品需求文档 v1.0：[PDF](明码产品需求文档_v1.0.pdf) / [Word](明码产品需求文档_v1.0.docx) | 完整产品目标，含未实现规划 |
| [需求获取与追问设计 v2](requirements-intake-v2.md) | 需求分类、表达与后续追问设计 |
| [户型模型设计](floorplan-model-design.md) | 上传、识别、校对和空间关联；逐点编辑、尺寸校准仍有未实现项 |
| [思维导图与闭环](../diagrams/README.md) | 总体协作结构，含后续「日新」规划 |

## 验证记录

记录只证明其日期和范围内的检查，不替代当前提交的测试或 [GitHub Actions](https://github.com/feifeifei686/bohack-project/actions)。功能文档中的本机临时输出路径不保证随仓库分发。

- [项目保存与体验](project-experience-verification.json)、[墙体视图](wall-demolition-verification.json)。
- [户型识别](floorplan-recognition-verification.json)、[分步问卷](questionnaire-workflow-verification.json)、[风险评估](risk-assessment-verification.json)。
- 历史阶段记录：[首页与工程预览](ui-transition-verification.json)、[需求页整合](requirements-unification-verification.json)、[需求共创初版](intake-release-verification.json)、[早期 API](api/verification.json)、[早期设计版本验收](../mingma-lab/review/verification.json)。

模拟通过不等于真实模型准确率，单次真实调用不构成固定性能承诺。浏览器、视觉与模型调用验证应分别阅读。
