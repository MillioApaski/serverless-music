# 开发进度

更新时间：2026-11-17。状态：Phase 0 本地验证完成主要链路，外部验收被阻塞。尚未部署，不是完整音乐播放器。

## 仓库与云端连接

代码已上传到 https://github.com/MillioApaski/serverless-music 的 main 分支，初次上传已核对Git tree一致，随后修正预览环境刷新与移动端导航问题。GitHub CI已全部通过：依赖安装、类型检查、66项测试、构建以及桌面/移动端6项Playwright测试。结果见 TEST_REPORT.md。

用户调整 Cloudflare权限后再次验证，Access organization / Access apps / Workers scripts / zones 仍返回403。连接明确报告缺少OAuth scope，需重新连接并授权相应Workers、Access、Zone范围。尚未进行生产部署或修改DNS。

## Phase 0

| 验收项 | 状态 | 证据或缺口 |
| --- | --- | --- |
| pnpm TypeScript workspace | 已实现/验证 | 9 个 workspace 项目；typecheck / build |
| 浏览器 QuickJS Release WASM | 已实现/验证 | 实际浏览器异步解析及隔离检查 |
| 模拟 LX 源与自有测试音频 | 已实现/验证 | 自行编写脚本与 18秒 PCM 旋律 |
| 获准真实第三方音乐源 | 阻塞 | 尚无已核实授权、代表真实兼容需求的源 |
| 异步 HTTP Bridge | 本地已验证 | QuickJSDeferredPromise / executePendingJobs / 回调取消 |
| 资源限额及异常恢复 | 已实现/局部验证 | 超时、内存上限、请求/响应/计时器配额；致命清理异常通过终止 Worker 回收 |
| 长期浏览器 WASM/RSS 无增长 | 尚未验证 | 仅 1000 次本地 guest live allocations smoke test |
| Direct / Redirect / Proxy | 本地已验证 | 固定自有音频、会话凭证及 Range 集成测试；外部上游使用受控 Fetcher |
| 实际外部音频代理 | 尚未验证 | 缺 Cloudflare 部署权限与获准外部音频样本 |
| Access JWT | 代码/本地验签已验证 | 本地签名测试证书验证负向样本 |
| 真实 Access 全站策略 | 阻塞 | 当前连接缺 Access 权限 |
| PlaylistOut适配 | 部分可行 | MIT normalize 模块与 ID 保留通过测试；线上网络、分页未验证 |
| Workers 资源消耗 | 阻塞 | 当前连接缺 Workers 权限；CPU P95 没有数值 |
| 浏览器自动化 | 当前用例已验证 | CUA交互及GitHub CI桌面/移动Chromium共6项Playwright测试通过；未替代真实移动设备验收 |

## 后续阶段

| 阶段 | 状态 | 下一步 |
| --- | --- | --- |
| Phase 1 基础与播放器 | 未验收 | 当前只具备 PoC单例音频引擎；完整队列/循环/设置/正式 UI 待实现 |
| Phase 2 元数据与歌单 | 未验收 | search provider、线上导入、分页、匹配、CSV与导出 |
| Phase 3 音源运行时 | 未验收 | LX Buffer/crypto/zlib、完整接口版本、IndexedDB、生产音源注册表 |
| Phase 4 自动换源 | 未开始 | 候选排序、URL过期、重解析、熔断、恢复 |
| Phase 5 自动维护 | 未开始 | 无秘密检测 job、独立发布、版本/权限审核、回滚 |
| Phase 6 用户体验 | 未开始 | 歌词、收藏、历史、D1迁移与身份隔离同步 |
| Phase 7 生产完善 | 未开始 | 真实 Access、移动端实测、PWA、云端性能与正式发布 |

## 已修正的问题

- Vite 开发模式初次 WASM 请求取回 HTML：改用显式 Release WASM asset URL；实际浏览器复测通过。
- 通用 QuickJS入口引入多个 variant资源：改用独立 release-sync包，构建只输出一个 WASM。
- 病态分配/中断后的 GC 断言：错误后不复用实例，通过终止整个 Worker回收；独立 Worker回归测试通过，保留此上游限制说明。
- LX请求取消仅丢弃回调：补充宿主 AbortController取消链路并加入测试。
- 代理重定向、歧义编码路径、敏感请求头、跨用户凭证、HTML伪装音频：均有负向测试。

## 继续所需的具体输入

1. 可访问 Workers / Access / 目标 Zone 的 Cloudflare连接权限与实际 Access允许身份。
2. 至少一个能核实资源使用授权的真实音源脚本及测试曲目，用于LX接口/加密兼容和真实播放验收。
3. 正式部署域名确认。当前没有创建 music.convert-alpha.cc 或更改用户现有域名。

任务书要求 Phase 0先通过，不能在这些外部验收缺口仍存在时把后续阶段标记完成。当前保存了可复现工程、测试、证据及部署步骤，解除阻塞后从本阶段继续。
