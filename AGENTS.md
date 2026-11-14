# 明码项目协作约定

<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->

## 局域网部署

每次完成明码网页或服务的更新并通过相关检查后，运行 `node scripts/local-deploy.mjs update`，同步更新本机和局域网使用的同一套部署。用 `node scripts/local-deploy.mjs status` 获取当前局域网地址，并从该地址确认网页可访问。交付时附上最新的局域网链接。
