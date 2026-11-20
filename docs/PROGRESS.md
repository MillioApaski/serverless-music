# 开发进度

更新时间：2026-11-20。Phase 0 按调整后的范围完成，Phase 1 已完成，Phase 2 已开始。

## 仓库与云端连接

代码已上传到 https://github.com/MillioApaski/serverless-music 的 main 分支，初次上传已核对Git tree一致，随后修正预览环境刷新与移动端导航问题。GitHub CI已全部通过：依赖安装、类型检查、66项测试、构建以及桌面/移动端6项Playwright测试。结果见 TEST_REPORT.md。

线上站点为 https://music.convert-alpha.cc 。已部署测试源与播放链路，采集了 Cloudflare Workers CPU 指标。

## Phase 0 · 已完成

2026-11-20 按用户确认的验收范围收尾。真实音源推迟到正式接入时验证，Access 专项验收与长期内存测试推迟到生产完善阶段。

| 验收项 | 状态 | 证据或缺口 |
| --- | --- | --- |
| pnpm TypeScript workspace | 已实现/验证 | 9 个 workspace 项目；typecheck / build |
| 浏览器 QuickJS Release WASM | 已实现/验证 | 实际浏览器异步解析及隔离检查 |
| 模拟 LX 源与自有测试音频 | 已实现/验证 | 自行编写脚本与 18秒 PCM 旋律 |
| 获准真实第三方音乐源 | 延期 | 尚无已核实授权、代表真实兼容需求的源 |
| 异步 HTTP Bridge | 本地及线上测试链路已验证 | 补齐生产 HTTP_LIMITER 后，QuickJS 初始化与同源 Bridge 在用户复测中通过 |
| 资源限额及异常恢复 | 已实现/局部验证 | 超时、内存上限、请求/响应/计时器配额；致命清理异常通过终止 Worker 回收 |
| 长期浏览器 WASM/RSS 无增长 | 延期 | 仅 1000 次本地 guest live allocations smoke test |
| Direct / Redirect / Proxy | 测试源线上通过 | 自有音频有声并播完，独立测试 Worker 的 Redirect 与 Proxy Range 已验证 |
| 实际外部音频代理 | 独立测试源通过 | 线上短 Range、整首串行下载与五路并发下载均通过 |
| Access JWT | 代码/本地验签已验证 | 本地签名测试证书验证负向样本 |
| 真实 Access 全站策略 | 专项验收延期 | 未登录会转登录页；用户截图确认已登录身份已验证；完整Allow策略及拒绝身份仍待验证 |
| PlaylistOut 适配 | 本地可行性已验证 | normalize 模块与 ID 保留通过测试。正式抓取和分页在 Phase 2 实现 |
| Workers 资源消耗 | 本轮 CPU 达标 | 会话 4 ms、Redirect 2 ms、短 Range Proxy 4 ms、完整 Proxy 串行/五路并发均为 2 ms。长期内存延期 |
| 浏览器自动化 | 当前用例已验证 | CUA交互及GitHub CI桌面/移动Chromium共6项Playwright测试通过；未替代真实移动设备验收 |

## Phase 1 · 已完成

Monorepo、GitHub CI、Cloudflare Workers 部署、基础界面及播放器均已就绪。播放器支持队列、下一首播放、上一首和下一首、顺序与随机、列表与单曲循环，并保留本机音量和播放顺序设置。用户已在线验证两首测试曲的队列切换。

## 后续阶段

| 阶段 | 状态 | 下一步 |
| --- | --- | --- |
| Phase 2 元数据与歌单 | 开发中 | 已实现网易云音乐和 QQ 音乐的聚合搜索、手动确认曲目关联、公开标准歌单链接分页读取与续读，以及本地 JSON / CSV 导入导出。下一批为短链、公开主页与批量导入 |
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

## 最新修复

补充生产HTTP_LIMITER原生绑定（120次/60秒/用户/接入点近似限制），保留缺失绑定时拒绝请求的行为。增加生产限流路由回归测试，并将Wrangler生产打包检查纳入CI。用户复测确认线上 5/5，本轮数据见 TEST_REPORT.md。
