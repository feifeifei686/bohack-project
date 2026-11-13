# 明码水电走线预览

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
业主与装修公司，通过按房间组织的硬装清单理解施工范围。

## Product Purpose
用户提出用可交互3D户型呈现水管和电线走线。本次制作可旋转、可选择房间、可切换图层并关联施工项目的本地样例。

## Capabilities and Constraints
示意数据仅用于交互验证。真实工程应接入测绘及经施工方复核的线路数据。房间来自用户参考图，布局为本次实现假设。价格、管径、电气参数和施工规范结论尚未提供。

## Brand Commitments
沿用明码名称以及用户所示浅色、暖白、绿色选中态的户型工作台。

## Implementation Assumptions
使用TypeScript、Vite、Three.js构建本地浏览器样例，源文件独立保存在mingma-3d目录。
