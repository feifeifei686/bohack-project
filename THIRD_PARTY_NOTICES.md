# 素材与第三方依赖

## 界面图片

`mingma-lab/public/assets/` 中的三张室内图片通过图像生成工具制作，用于演示界面的视觉背景，不代表真实商家案例或施工成果。生成提示词、原始文件及校验值见 [素材清单](mingma-lab/public/assets/manifest.json)。用户提供的参考图仅用于视觉方向，没有复制到仓库。

`mingma-lab/public/previews/` 是本项目界面的演示截图。

## 字体

Atelier 使用 Noto Serif SC 的本地界面字形子集，遵循 SIL Open Font License 1.1。许可全文见 [OFL-NotoSerifSC.txt](mingma-lab/public/fonts/OFL-NotoSerifSC.txt)，来源与子集信息见 [source.json](mingma-lab/public/fonts/source.json)。其他字体使用系统字体回退。

## 软件依赖

Vite、TypeScript、Tailwind CSS、Three.js、Prettier 等依赖由各工程的 `package.json` 和 `package-lock.json` 记录，许可分别以依赖包内的许可证为准。此说明不替代依赖许可证，也不为项目自有代码新增开源授权。
