# Serverless Music

Cloudflare Workers 多音源播放器的 Phase 0 技术验证工程。

**当前状态：本地 PoC 和 CI 通过；用户已部署测试站点，Phase 0 外部验收尚未完成。**

工程包含真正的 QuickJS Release WASM 沙箱、Web Worker 宿主、LX 事件及 HTTP 回调桥接、Access JWT 验证、受限网络请求、短期用户绑定播放凭证、Range 流式代理、独立音频实例，以及基于 PlaylistOut 的元数据适配。测试页面只使用本项目生成的 18 秒 PCM 测试旋律；没有预置第三方音乐或未经验证的公共音源。

## 运行

需要 Node.js 24 和 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 Vite 显示的本地地址。开发适配器只存在于 Vite 配置中，不进入生产 Worker；页面显示“本地验证身份”。本地测试用的播放凭证密钥不是生产密钥。

```sh
pnpm typecheck
pnpm test
pnpm poc
pnpm build
pnpm exec wrangler deploy --dry-run --env="" --outdir artifacts/wrangler
```

Playwright 桌面与移动端用例已提供：`pnpm exec playwright install chromium` 后运行 `pnpm test:e2e`。本地环境通过浏览器控制执行了实际交互验证；GitHub CI已在构建产物上运行桌面与移动Chromium共6项Playwright测试，全部通过。测试使用本地API适配器，不能代替真实Cloudflare部署验收。

## 已验证与未完成

本地测试、浏览器操作、基准原始数据见 [测试报告](docs/TEST_REPORT.md)。完整的阶段状态见 [进度](docs/PROGRESS.md)。原始任务书保存在 [REQUIREMENTS.md](docs/REQUIREMENTS.md)。

LX Compatibility Layer 目前是 PoC 子集，尚未提供 Buffer、加密、压缩、form / formData 和完整版本兼容。不能声称兼容所有洛雪音源。

线上搜索、线上歌单抓取、自动换源、定时音源维护、歌词、收藏、D1 同步、离线 PWA 均未完成。没有用空接口或假成功返回代替这些功能；未实现的线上导入返回 501。

用户测试站点为 https://music.convert-alpha.cc ，生产 Access issuer/audience 已按用户提供值写入配置。当前 Cloudflare 连接仍缺少 Workers、Access、Zone 权限，无法代为确认最新部署或测量 CPU P95；获得授权的真实第三方音源也尚未接入。按照任务书 Phase 0 的前置条件，后续完整产品阶段保持未验收。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [上游版本、许可及修改](docs/UPSTREAMS.md)
- [安全边界及限制](docs/SECURITY.md)
- [部署和外部验证步骤](docs/DEPLOYMENT.md)
- [测试报告](docs/TEST_REPORT.md)
- [开发进度](docs/PROGRESS.md)

项目独立代码采用 MIT；第三方代码保留其原有许可和版权声明。
