# 本机与局域网部署

本机入口为 [http://127.0.0.1:5188/](http://127.0.0.1:5188/)，直接进入安居有数的澄境界面。前端静态网关与 AI 服务独立运行，使用 Node.js 24 和 npm。

项目、房间访谈、上传图纸和记录自动保存于当前浏览器同一来源的 IndexedDB，刷新或重新打开后可继续。不同设备、浏览器、协议、主机或端口的草稿相互独立，目前没有云端同步。

## 启动与更新

在 macOS 项目根目录双击 [启动明码.command](../启动明码.command)，或使用：

```sh
node scripts/local-deploy.mjs start
node scripts/local-deploy.mjs status
```

首次启动会准备依赖并构建，需要网络。真实 AI 功能须先按 [API 指南](../mingma-api/README.md)配置服务端 `.env`。

服务由当前 macOS 登录会话管理，关闭启动终端后仍可访问；重启电脑或退出登录后需再次启动。配置位于项目 `.local-run/`，不安装登录启动项。

| 操作 | 根目录命令 | 双击入口 |
| --- | --- | --- |
| 更新源码对应部署 | `node scripts/local-deploy.mjs update` | [更新明码.command](../更新明码.command) |
| 查看服务和日志位置 | `node scripts/local-deploy.mjs status` | [查看明码状态.command](../查看明码状态.command) |
| 停止服务 | `node scripts/local-deploy.mjs stop` | [停止明码.command](../停止明码.command) |
| 开启局域网访问 | `node scripts/local-deploy.mjs lan-on` | [开启局域网访问.command](../开启局域网访问.command) |
| 关闭局域网访问 | `node scripts/local-deploy.mjs lan-off` | [关闭局域网访问.command](../关闭局域网访问.command) |

`update` 重新构建当前本地源码并重启，不拉取 GitHub 代码。每次网页或服务更新通过检查后执行 `update`、`status`，并从输出的最新局域网地址确认网页可访问。更新期间服务可能短暂不可用。

## 手机或其他电脑访问

1. 开启局域网访问，用 `status` 读取当前地址。
2. 让设备与 Mac 连接同一局域网，打开状态输出的 `http://<电脑局域网IP>:5188/`。
3. 保持 Mac 开机、未休眠且服务运行。换网后重新读取地址；访客或校园网络可能限制设备互访。

开关保存在 `.local-run/access.json`，启动和更新沿用当前选择。地址从网卡动态获取，不在文档或代码中固定。

## 服务与访问范围

| 本机地址 | 用途 |
| --- | --- |
| [5188/](http://127.0.0.1:5188/) | 网页与同源网关 |
| [5188/api/health](http://127.0.0.1:5188/api/health) | 经网关检查 API 状态 |
| [5188/api/openapi.json](http://127.0.0.1:5188/api/openapi.json) | 接口契约 |
| [5199/api/health](http://127.0.0.1:5199/api/health) | 直接检查本机 API |

默认仅监听本机。开启 LAN 后，网页网关监听 IPv4 接口，允许私有 IPv4 局域网来源；API 5199 仍绑定回环地址。局域网用户无需访问码，可通过同源网关调用以下 POST：

- `/api/ai/intake`：需求整理与追问。
- `/api/ai/floorplan`：户型图片识别。
- `/api/ai/requirement-insight`：发布后的 Flash 需求分析。

其他 API 与诊断入口对远端返回 403。网关检查来源 IP、Host 与 Origin，后端保留频率和并发限制。DeepSeek 密钥只在服务端读取；真实请求使用该服务端账户，健康检查不调用模型。字段与错误见[接口文档](api/README.md)。

## 配置与排查

- `mingma-api/.env` 保存服务端模型配置；不要写入网页、截图或仓库。修改配置后更新部署。
- `.local-run/logs/` 保存运行日志，`.local-run/` 保存本机状态；均不应提交。
- `aiConfigured` 只说明已配置密钥，不证明模型调用、额度或结果质量。
- 端口冲突会报告错误，不会自动终止其他程序。开发服务和部署默认共用 5188 / 5199，切换前先停止现有服务。
- 搬移项目目录前先停止服务，移动后从新位置启动。
- 保存异常时先看页面提示，可重试或导出项目。浏览器数据清除会影响本机草稿；JSON 导出用于留存，当前没有导入恢复功能。
