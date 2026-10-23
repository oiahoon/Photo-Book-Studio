# GitHub Actions 与 Pages 部署

部署的是 `apps/browser`。GitHub 上不运行本地 Node 服务，也不接收照片或影集数据。

## 自动发布

`.github/workflows/pages.yml` 包含两阶段：

1. macOS 构建作业：`npm ci` → 公开文件检查 → 类型检查 → 完整测试 → 两个应用构建 → 静态产物检查。使用 macOS 是因为原工作台的测试依赖系统图片解码与中文字体。
2. 通过后，上传 **仅 `dist-browser/`**，由 Pages 部署作业发布。部署权限仅授予该作业；PR 只检查，不上传或部署。Action 固定到已核对的提交。

触发条件是推送到 `main`，也可从 Actions 手动运行。首次在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。管理员也可以使用：

```sh
gh api --method POST repos/OWNER/REPO/pages -f build_type=workflow
```

已经启用 Pages 时使用 `PUT` 更新 `build_type`。不需要部署用的个人访问令牌或额外 Secrets；部署使用 Actions 自带的短期令牌。

当前项目默认地址：`https://oiahoon.github.io/Photo-Book-Studio/`。fork 后使用自己的账户和仓库地址即可。

后续发布：

```sh
git add <本次修改的文件>
git commit -m "Describe the change"
git push origin main
```

在 Actions 查看 **Check and deploy browser app**。构建失败不会覆盖已部署的网站。

## 可选域名 album.miaowu.org

目前先使用默认 Pages 地址。域名最终确认后：

1. 先从当前网站下载 `.photobook` 项目备份。每个域名的 IndexedDB、目录授权均独立，不会自动迁移。
2. 在仓库 Settings → Pages → Custom domain 填 `album.miaowu.org`；使用自定义 Actions 时，此设置通过 GitHub 管理，不能靠提交 CNAME 文件代替。
3. 在域名 DNS 添加：

| 类型 | 名称 | 目标 |
| --- | --- | --- |
| CNAME | `album` | `oiahoon.github.io` |

目标不要包含仓库路径，也不要包含 `https://`。确认该子域没有冲突的 A/AAAA/CNAME 记录。
4. 等待 GitHub 检查 DNS 并签发证书，启用 **Enforce HTTPS**。
5. 在新域名打开或恢复项目，再选择本地照片目录/私人迁移包。

浏览器目录选择需要安全上下文：正式站使用 HTTPS，本地可使用 localhost。域名和 DNS 尚未配置时，不要把默认站点提前重定向到它。

官方说明：[Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。

## 发布边界

- `.local/`、`output/`、`tmp/`、`analysis-tasks/`、私人编辑文档、原片、数据库、迁移包、PDF、审阅截图不提交。
- 私人旧 README 已留在本机的 `.local/release/`。公开说明是通用使用说明。
- `npm run public:check` 检查 Git 索引中的发布文件；`npm run public:check -- --artifact dist-browser` 检查网页产物白名单和 CSP。
- 导入的照片、手动标注和项目备份只留在使用者的设备和浏览器。发布新的代码不会将本机 IndexedDB 打包到网站。

## CI 字体依赖

干净 macOS runner 不一定下载过楷体-简。CI 显式下载 SIL OFL 授权的 [LXGW WenKai](https://github.com/lxgw/LxgwWenKai) v1.530 正楷，校验官方 SHA-256，再通过 `PBS_PDF_KAI_FONT` / `PBS_PDF_KAI_FONT_NAME` 传给 PDF 测试。字体位于 runner 临时目录，不提交、不部署，不改变用户本机字体选择；测试继续核对实际指定字体的名称、嵌入及快照独立性。
