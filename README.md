# Serverless Music

部署在 Cloudflare Workers 上的多音源音乐播放器。

**当前状态：Phase 0 已按约定范围完成，Phase 1 基础播放器已完成，Phase 2 元数据与歌单开发中。**

工程包含真正的 QuickJS Release WASM 沙箱、Web Worker 宿主、LX 事件及 HTTP 回调桥接、Access JWT 验证、受限网络请求、短期用户绑定播放凭证、Range 流式代理、独立音频实例，以及基于 PlaylistOut 的元数据适配。测试页面使用本项目生成的两首 PCM 旋律《微光》和《暮色》，时长分别为 18 秒和 12 秒。

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

安装 Chromium（`pnpm exec playwright install chromium`）后，运行 `pnpm test:e2e` 验证桌面与移动端。用例使用本地 API 适配器，生产部署记录见测试报告。

## 已验证与未完成

本地测试、浏览器操作、基准原始数据见 [测试报告](docs/TEST_REPORT.md)。完整的阶段状态见 [进度](docs/PROGRESS.md)。原始任务书保存在 [REQUIREMENTS.md](docs/REQUIREMENTS.md)。

LX Compatibility Layer 目前是 PoC 子集，尚未提供 Buffer、加密、压缩、form / formData 和完整版本兼容。不能声称兼容所有洛雪音源。

音乐搜索支持网易云音乐、QQ 音乐及双平台聚合，可核对录音版本并手动保存曲目关联。歌单导入支持两平台的标准公开分享链接、分页读取与续读，以及本地 JSON / CSV 文件、逐条错误提示和 JSON / CSV 导出。CSV 至少包含 `title` 和 `artist` 列，可选 `album` 和 `duration`（秒）。站内导出的文件保留歌曲的平台标识与原始字段，并可重新导入。

平台短链、公开主页、批量导入和更多平台适配仍在开发。真实音源播放、自动换源、定时音源维护、歌词、收藏、D1 同步及离线 PWA 随后续阶段推进。

测试站点为 https://music.convert-alpha.cc 。测试音源的播放链路和 Workers CPU 已完成线上验证。真实音源、Access 专项和长期内存测试随对应开发阶段继续。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [上游版本、许可及修改](docs/UPSTREAMS.md)
- [安全边界及限制](docs/SECURITY.md)
- [部署和外部验证步骤](docs/DEPLOYMENT.md)
- [测试报告](docs/TEST_REPORT.md)
- [开发进度](docs/PROGRESS.md)

项目独立代码采用 MIT；第三方代码保留其原有许可和版权声明。
