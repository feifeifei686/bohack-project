# 雾屿 Atmosphere

本版以自然室内摄影与烟色玻璃组织家装计划，包含 8 个功能页面（含商家工作区）。入口为根展厅中的第一版，或 /versions/atmosphere/index.html。

在 mingma-lab 根目录运行 npm ci 和 npm run dev。不要将此子目录单独作为Vite根目录；图片与字体由根目录public提供。

首页生活便签可以编辑，保存后进入需求共创；从首页点击「开始硬装规划」进入空间选择页，点选房间可查看硬装清单。新版共创使用共享 AI 流程，支持自由表达与多区域选择、动态追问、四组草稿、手动编辑、采纳建议和逐项确认。明确采用后进入“我的需求”，再由用户发布；已有快照保留。独立数据键以 `mingma-atmosphere` 开头，访谈另存于 `mingma-atmosphere-intake-v2`。

真实共创需要同源 AI 服务；失败会保留输入和草稿，不返回假演示答案。同一局域网内可直接使用需求共创，无需访问码；模型密钥保留在服务端。商家方案仍使用本地规则和模拟公司，没有真实商家账户或云同步，不处理价格。具体运行方法、验收路径和静态包限制见[主工程说明](../../README.md)。

“我的需求”把清单、原条目派生的待确认、三项项目背景和只读旧记录放在同一页。独立维度入口已移除，旧 `#dimensions` 会跳转；背景保存后自动带入下次 AI，修改回到此页。旧商家维度作为商家工作区的回应引导，历史记录不自动归属模拟企业。

旧版原始验收截图本地留存，仓库保留[桌面预览](../../public/previews/atmosphere-desktop.webp)、[手机预览](../../public/previews/atmosphere-mobile.webp)和[带日期的历史摘要](../../review/verification.json)。需求整合的页面、迁移、接口及部署结果见[本轮验证记录](../../../docs/requirements-unification-verification.json)，前一轮需求获取结果见[历史发布记录](../../../docs/intake-release-verification.json)；云端自动检查以对应提交的 GitHub Actions 为准。
