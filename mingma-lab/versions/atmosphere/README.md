# 雾屿 Atmosphere

本版以自然室内摄影与烟色玻璃组织家装计划，包含8个完整功能页面。入口为根展厅中的第一版，或 /versions/atmosphere/index.html。

在 mingma-lab 根目录运行 npm ci 和 npm run dev。不要将此子目录单独作为Vite根目录；图片与字体由根目录public提供。

首页生活便签可以编辑，保存后进入需求澄清；房间模型与区域便签联动。主流程、空间操作和版本/单商家/演示重置边界均已验证。独立数据键以 mingma-atmosphere 开头。

方案与量表是本机演示，未接入真实LLM、商家账户或云端；不处理价格。具体能力边界、运行方法、验收路径和素材来源见[主工程说明](../../README.md)。

原始验收截图本地留存，仓库保留[桌面预览](../../public/previews/atmosphere-desktop.webp)、[手机预览](../../public/previews/atmosphere-mobile.webp)和[带日期的验收摘要](../../review/verification.json)。当前自动测试与构建结果以 GitHub Actions 为准。
