# 架构与技术验证边界

当前只实现 Phase 0 验证链路。目录已建立 9 个 pnpm workspace 项目，避免把试验页面误标为完整产品。

## 当前模块

| 模块 | 职责 | 实现状态 |
| --- | --- | --- |
| apps/web | React 试验台、源状态、JSON 预览、实际检查结果 | 已实现 |
| apps/worker | Hono 路由、身份门禁、固定测试资源、播放会话 | 已实现、本地验证 |
| packages/core | Track、Source、网络策略、统一错误结构 | 已实现 |
| packages/source-runtime | QuickJS、Web Worker、宿主桥接、硬超时 | 已实现 PoC 子集 |
| packages/source-sdk | 精确域名与路径权限检查、请求头过滤 | 已实现 |
| packages/stream-proxy | 有界 HTTP 响应、逐跳检查、Range 原样流转发、凭证 | 已实现、本地验证 |
| packages/playlist | PlaylistOut 规范化适配、原始 ID 和字段、JSON 导入预览 | 已实现、fixture 验证 |
| packages/player | 全局 HTMLAudioElement、快速切换取消、autoplay 处理 | 已实现最小链路 |

## 音源执行

第三方 JavaScript 只进入 Web Worker 内的 QuickJS `evalCode`。从未交给页面原生 eval / Function。显式指定 `@jitl/quickjs-wasmfile-release-sync/wasm?url`，避免 Vite 开发环境把 WASM 路径解析到 HTML。最终只打包一个 Release WASM 文件。

同一个 Worker 可以复用已实例化模块，但每个 SourceRuntime 都建立独立 runtime/context。页面当前每次独立验证会创建新 Worker，便于完全回收异常实例。未来可以在同一音源的多个请求间复用 Worker；不得跨用户复用状态。

LX 调用链：事件注册 → `__dispatch` → QuickJS Promise → 宿主 QuickJSDeferredPromise → 同源 HTTP Bridge → resolve/reject → executePendingJobs → 解析结果。Deferred、返回值、异常、上下文和 runtime 均有释放路径。

默认限制：16 MiB guest heap、256 KiB JS stack、3 秒解析期限、8 次 HTTP 请求、1 MiB HTTP 响应、64 KiB宿主消息、16 个定时器。页面独立设置 6 秒硬超时；卡死时终止整个 Worker。以上 guest heap 配额不等于总 WASM 线性内存配额。

## 已观察的异常与恢复设计

QuickJS 0.32.0 在特定“大量字符串分配 + 超时中断”的组合中，清理可能触发 `JS_FreeRuntime` GC 断言。该实例不再复用；前端错误路径销毁整个 Worker，重新创建后可以正常执行。专门的 Node Worker 测试验证了此回收边界。不能将该结果描述为所有异常下都能优雅释放 WASM handles，也不能把 guest allocation 统计替代浏览器长期 RSS 测量。

## 播放

引擎独立于 React 页面生命周期。选歌时增加 generation 并 abort 旧解析任务；迟到结果不会替换当前音频。autoplay 被浏览器拒绝时显示 blocked，由用户再次点击播放。

当前只有自有测试旋律，上一首/下一首明确禁用。未实现完整队列、随机、循环、跨音源匹配或熔断。音量和进度可实际操作。

Proxy 保留上游 Response.body；固定测试旋律由每次最多 8192 字节的 chunk 动态生成，没有先加载完整音频。外部上游流转发用受控 Fetcher 集成测试验证，云端实际内存仍待测。

## 下一阶段接口

MetadataProvider 将按能力提供 search / getTrack / getAlbum / getArtist / getLyrics / getPlaylist。SourceManager 负责维护版本与权限审核，不能直接将社区脚本集合视为授权音源。D1 作为用户持久化权威，IndexedDB 按已验证身份隔离缓存。上述模块当前仅为后续设计，不存在已启用的占位服务。

保留任务书的完整目标技术栈；Phase 0 试验台使用轻量 CSS 与 React。Zustand、TanStack Query/Virtual、Dexie、Drizzle、PWA 等在对应产品阶段接入，不为显示技术栈而预装空实现。
