# Serverless 多音源音乐播放器开发任务书

## 1. 项目目标

开发一个现代化、支持多音乐平台聚合的 Web 音乐播放器，完整部署于 Cloudflare Workers，具有自动化音源维护能力。

项目核心目标：

- 聚合多个可合法使用的免费音乐音源。
- 兼容洛雪音乐自定义音源生态。
- 支持主流音乐平台的音乐搜索与歌单导入。
- 支持跨平台歌曲匹配与自动换源。
- 自动检测、更新、禁用和恢复音源。
- 支持在线音乐播放及同步歌词。
- 支持桌面端、移动端和 PWA。
- 使用 Cloudflare Access 控制访问权限。
- 尽可能实现零部署成本和低人工维护成本。

不依赖独立服务器、Docker 服务或常驻 Node.js 后端。

## 2. 开发原则

优先研究和复用现有开源项目，避免重复实现已经成熟的技术。

不得直接将多个项目粗暴拼接。需要设计统一的数据模型、模块接口和错误处理机制。

各模块之间应保持低耦合，允许独立替换。

所有第三方代码均需检查许可证，记录上游仓库地址、参考版本和修改内容。

音乐源、歌单平台和播放器之间必须解耦。不得将用户收藏、歌单等持久化数据绑定到某个具体播放音源。

优先使用获得授权的音乐接口及资源，不实现 DRM 破解、付费权限绕过等功能。

## 3. 整体架构

采用 TypeScript Monorepo。

浏览器端负责：

- React 用户界面。
- 音乐播放引擎。
- 播放队列管理。
- 歌词渲染。
- QuickJS WASM 音源运行时。
- 音源选择与自动换源。
- 本地数据缓存。
- PWA。

Cloudflare Workers 负责：

- API Gateway。
- Cloudflare Access 身份校验。
- 音乐搜索与元数据查询。
- 跨平台歌单解析。
- 受限 HTTP 请求代理。
- 音频流式代理。
- 音源注册表分发。
- 用户数据同步。

GitHub Actions 负责：

- 音源定时检测。
- 在线音源更新。
- 音源版本管理。
- 自动化测试。
- 构建及部署。

Cloudflare D1 负责持久化用户数据。

IndexedDB 负责本地数据与音源脚本缓存。

Cloudflare KV 作为可选缓存服务，不作为强一致性数据库使用。

## 4. 技术栈

| 模块 | 技术 |
|---|---|
| 编程语言 | TypeScript |
| 包管理器 | pnpm |
| 前端框架 | React |
| 构建工具 | Vite |
| UI 组件 | shadcn/ui |
| 样式 | Tailwind CSS |
| 图标 | Lucide |
| 路由 | React Router |
| 状态管理 | Zustand |
| 请求管理 | TanStack Query |
| 虚拟列表 | TanStack Virtual |
| 本地数据库 | Dexie.js / IndexedDB |
| 音频播放 | HTMLAudioElement |
| 系统媒体控制 | Media Session API |
| 脚本执行 | QuickJS Emscripten |
| 脚本线程 | Web Worker |
| 后端框架 | Hono |
| 数据校验 | Zod |
| ORM | Drizzle ORM |
| 远程数据库 | Cloudflare D1 |
| 单元测试 | Vitest |
| E2E 测试 | Playwright |
| 部署 | Wrangler |
| CI/CD | GitHub Actions |

## 5. 必须研究的开源项目

### 5.1 音乐播放器

Otter Music Web

https://github.com/DJChanahCJD/otter-music-web

参考 Web 音乐播放器整体结构、多音源聚合、API 封装和 Serverless 部署。

AlgerMusicPlayer

https://github.com/algerkong/AlgerMusicPlayer

参考音乐播放器 UI、交互设计、歌单管理和播放控制。

YesPlayMusic

https://github.com/qier222/YesPlayMusic

参考简洁的音乐库界面和播放器视觉设计。

Listen 1

https://github.com/listen1/listen1_desktop

参考多音乐平台适配器结构和统一音乐接口。

### 5.2 音乐源规范

LX Music Desktop

https://github.com/lyswhut/lx-music-desktop

官方自定义源规范：

https://lxmusic.toside.cn/desktop/custom-source

重点研究：

- 自定义音源 API。
- 音源初始化流程。
- 音乐平台定义。
- 原生歌曲 ID 与元数据结构。
- 音质类型。
- 请求事件。
- HTTP 请求接口。
- 歌曲播放地址获取机制。

LX Server

https://github.com/XCQ0607/lxserver

参考洛雪音乐 Web 化、音源管理及媒体接口设计。

Meting API Serverless

https://github.com/ZeroTang05/Meting-API-Serverless

参考在 Cloudflare Workers 上实现音乐平台 API 适配的方法。

### 5.3 歌单导入

PlaylistOut

https://github.com/LengxiQwQ/playlistout

这是歌单导入功能的主要参考与复用项目。

重点研究其 Workers 后端、链接解析、平台适配器、原生歌曲标识符保留、分页及统一输出格式。

优先移植其 MIT 许可下的必要模块，而非长期依赖其公共 API 服务。

### 5.4 自动化音源维护

cf-anheplayer

https://github.com/raclen/cf-anheplayer

重点研究：

- scripts/check-sources.mjs
- scripts/lib/lx-sandbox.mjs
- .github/workflows/check-sources.yml
- sources/remote.json
- public/sources-status.json

参考其定时检测、音源更新、音频拉流校验、历史状态管理和检测结果发布机制。

该项目此前未发现明确的许可证文件。未确认授权前，仅参考技术设计，自行实现相关模块。

lx-music-source

https://github.com/pdone/lx-music-source

研究社区音源版本更新及分发机制。不得默认认为其中所有音源均获得播放或转发授权。

### 5.5 JavaScript 沙箱

QuickJS Emscripten

https://github.com/justjake/quickjs-emscripten

用于在浏览器内隔离执行音源脚本。

优先使用 Release 版本。

### 5.6 歌词与元数据

Apple Music Like Lyrics

https://github.com/amll-dev/applemusic-like-lyrics

AMLL TTML Database

https://github.com/amll-dev/amll-ttml-db

LRCLIB

https://github.com/tranxuanthang/lrclib

MusicBrainz

https://github.com/metabrainz/musicbrainz-server

根据许可证兼容性决定直接引入或独立实现歌词组件。

### 5.7 基础框架

https://github.com/honojs/hono

https://github.com/shadcn-ui/ui

https://github.com/pmndrs/zustand

https://github.com/TanStack/query

https://github.com/TanStack/virtual

https://github.com/dexie/Dexie.js

https://github.com/drizzle-team/drizzle-orm

https://github.com/vite-pwa/vite-plugin-pwa

## 6. 音乐播放器功能

实现完整的音乐播放状态机。

基础功能：

- 播放、暂停、上一首、下一首。
- 播放进度拖动。
- 音量控制。
- 顺序播放、随机播放、列表循环、单曲循环。
- 播放队列。
- 下一首播放。
- 播放历史。
- 歌曲收藏。
- 音质选择。
- 音源选择。
- 自动恢复播放进度。
- 播放错误自动处理。
- 系统媒体按键与锁屏控制。
- 歌词同步显示。

播放引擎应使用全局单例或等效生命周期设计，切换页面不得导致音乐中断。

切歌时取消旧请求，防止迟到的解析结果覆盖当前播放任务。

自动恢复播放应遵守浏览器 autoplay 限制。

不将全部音频下载到内存后再播放。

## 7. 统一音乐数据模型

定义以下核心实体：

- Track
- Artist
- Album
- Playlist
- TrackIdentifier
- Source
- SourceVersion
- SourceHealth
- PlaybackCandidate
- PlaybackSession
- Lyric

Track 应包含内部 ID、歌曲名、歌手、专辑、时长、封面、ISRC、多个平台原生 ID 及必要的平台原始元数据。

保留不同音乐平台需要的特殊字段，例如 QQ 音乐 songmid、网易云歌曲 ID、酷狗 hash、酷我 rid 等。

不能假设所有音源仅凭歌曲 ID 即可解析歌曲。

同一首歌曲可以关联多个平台标识，但不同录音版本不能仅凭同名而被错误合并。

## 8. 音乐搜索及跨平台匹配

实现统一的 MetadataProvider 接口。

每个平台适配器独立提供其支持的能力：

- search
- getTrack
- getAlbum
- getArtist
- getLyrics
- getPlaylist

根据平台能力声明决定哪些接口可调用。

聚合搜索支持单平台搜索、多平台并行搜索、分页、取消请求和结果去重。

歌曲匹配优先级：

1. 已保存的平台映射。
2. ISRC 精确匹配。
3. 标准化歌曲名与歌手匹配。
4. 专辑和时长辅助匹配。
5. 特殊版本识别。

需要区分 Live、Remix、伴奏、翻唱、重制版等不同版本。

低置信度匹配不得直接自动播放，应允许用户手动确认。

## 9. 跨平台歌单导入

以 PlaylistOut 为基础实现歌单导入模块。

优先支持：

- 网易云音乐。
- QQ 音乐。
- 酷狗音乐及概念版。
- 酷我音乐。
- 咪咕音乐。
- 汽水音乐。

按照实际接口可用性决定最终支持的平台。

Spotify 和 Apple Music 可通过官方接口扩展，但不作为第一阶段阻塞条件。

支持：

- 粘贴歌单分享链接。
- 从公开用户主页导入歌单。
- 批量导入。
- 导入预览。
- 导入进度。
- 部分失败重试。
- 歌曲去重。
- 原始歌单信息保留。
- 手动重新同步。
- JSON、CSV 等本地歌单导入导出。

导入歌单时只获取元数据，不需要立即解析每首歌曲的播放 URL。

## 10. 浏览器端音源运行时

确定使用浏览器 Web Worker + QuickJS WASM。

不在 Cloudflare Workers 中执行第三方音源脚本。

QuickJS 实现独立的 LX Compatibility Layer。

根据洛雪官方规范实现必要的接口：

- lx.EVENT_NAMES
- lx.on
- lx.send
- lx.request
- lx.utils
- 初始化事件。
- 应用 API 请求事件。
- 音源能力声明。
- 必要的 Buffer、加密及编码兼容接口。
- 定时器。
- Promise 和异步事件处理。

对不同版本的接口差异建立兼容策略。

HTTP 请求由 QuickJS 宿主桥接至浏览器，并按需调用同源 Workers HTTP Proxy。

正确管理 QuickJSDeferredPromise、executePendingJobs、回调生命周期和所有 WASM handles，避免异步死锁及内存泄漏。

同一个 Web Worker 可复用已加载的 WASM 模块，但不同第三方音源应拥有隔离的运行时或等效隔离机制。

禁止将第三方脚本直接交给页面 eval、Function 或浏览器原生 JavaScript 环境执行。

限制：

- 执行时间。
- 内存使用。
- JavaScript 栈大小。
- 网络请求数量。
- HTTP 响应大小。
- 定时器数量。
- 单次解析耗时。

音源脚本禁止访问宿主 DOM、IndexedDB、Cookie、Access Token 及其他用户数据。

发生超时或沙箱异常时，应能够销毁并重建运行环境。

音源脚本公开可见是可接受的，不需要对其进行混淆或隐藏。

## 11. 音源注册表

定义统一 Source Manifest。

每条音源记录至少包含：

- id
- name
- version
- scriptUrl
- sha256
- enabled
- supportedPlatforms
- supportedQualities
- supportedActions
- allowedHosts
- priority
- healthStatus
- updatedAt
- checkedAt

音源脚本使用版本化 URL 或内容哈希作为唯一标识。

浏览器下载脚本后检查哈希值，缓存到 IndexedDB。

禁止未经审核的新脚本自动扩大自身网络权限。

用户可查看音源状态、手动启停以及调整优先级。

注册表必须由项目维护方控制，不能由普通客户端直接修改。

## 12. 自动化音源维护

参考 cf-anheplayer，自行实现完整 Source Manager。

使用 GitHub Actions 每四小时尝试执行一次检测，并支持手动触发。

检测流程：

1. 获取已注册音源的最新版本。
2. 检查文件完整性和网络权限变更。
3. 在隔离环境中初始化脚本。
4. 识别音源声明的平台与音质能力。
5. 针对不同平台执行固定样本测试。
6. 获取获准使用的测试音频 URL。
7. 实际拉取少量音频字节验证响应。
8. 记录错误类型及响应时间。
9. 生成检测结果。
10. 发布通过检查的音源版本。

检测状态至少包含：

- available
- partial
- unavailable
- untested
- stale

不能仅根据 API HTTP 200 或返回了 URL 判定音源可用。

使用多个测试样本，避免单曲下架影响整个平台的判断。

音源检测应支持部分平台成功的情况。

音源更新失败时保留最后一个通过验证的版本，但不能将过期检测结果视为当前可用性保证。

检测任务不提供部署密钥、生产环境密钥或可写 GitHub Token。

检测与发布应使用独立 Job，发布阶段验证输出文件后才允许写入。

音源更新尽量独立于播放器应用部署，不因每次检测而重新构建整个网站。

## 13. 自动换源及熔断

对每首歌曲构建候选音源列表。

选择依据：

- 用户指定的音乐平台。
- 歌曲匹配置信度。
- 音源平台可用性。
- 音质偏好。
- 音源近期成功率。
- 历史响应时间。
- 用户设定的优先级。

当播放失败时，先判断是否为临时 URL 过期，再决定重新解析或切换音源。

连续失败的音源进入冷却状态，冷却结束后允许小规模试探请求。

避免无限循环重试。

不得因某个音源的一首歌曲播放失败就永久禁用整个音源。

GitHub Actions 检测结果只作为初始健康信息，最终结合当前浏览器的实际播放结果动态调整。

## 14. HTTP 代理

在 Workers 中实现受限 HTTP Bridge。

建议接口：

POST /api/sources/:sourceId/request

请求可以描述目标 URL、HTTP 方法、允许的请求头和请求体。

后端必须根据服务端维护的 Source Manifest 判断请求是否允许，不能信任客户端提交的白名单。

安全要求：

- 强制 Cloudflare Access 鉴权。
- 精确限制目标域名及必要的 URL 路径。
- 默认只允许 HTTPS。
- 限制 HTTP 方法。
- 拒绝内网、回环、保留地址和未经授权的目标。
- 逐跳检查重定向。
- 禁止转发 Access Cookie、Authorization 等宿主敏感请求头。
- 限制请求体和响应体大小。
- 限制请求超时及频率。
- 不允许任意目标 URL 的开放代理。
- 不暴露服务端环境变量。
- 日志中脱敏敏感参数。

如果音源更新导致需要访问新域名，必须进入待审核状态。

不得通过代理绕过音乐平台的访问控制或授权要求。

## 15. 音频播放与代理

支持三种播放模式：

Direct：浏览器直接从获准使用的源站拉流。

Redirect：站内播放地址返回 302，由浏览器访问真实音源。

Proxy：浏览器使用本网站域名，Workers 流式转发音频数据。

默认使用 Direct。

只有在音源需要且允许中转时才启用 Proxy。

音频代理接口：

GET /api/stream/:token

HEAD /api/stream/:token

必须支持：

- Range。
- 206 Partial Content。
- Content-Range。
- Content-Length。
- Accept-Ranges。
- 正确的 Content-Type。
- 播放进度跳转。
- Response Stream。
- 客户端取消请求。
- 短期播放凭证。

播放凭证绑定合法音源、目标地址、有效期及必要的用户身份信息。

代理不得缓存或中转无权使用的音乐资源。

禁止将完整音频文件载入 Workers 内存。

## 16. Cloudflare Access

不实现独立用户注册、登录、密码管理、验证码或 OAuth 系统。

使用 Cloudflare Access 控制整个网站的访问。

优先使用单 Worker 级别的 Access 保护，覆盖生产和预览访问入口。

访问策略由部署者在 Cloudflare Zero Trust 配置，仅允许指定邮箱或指定身份。

所有 API 必须验证访问是经过 Access 认证的。

根据当前 Workers Static Assets 路由方式，正确处理 ctx.access 不可用的情况，必要时验证 Cf-Access-Jwt-Assertion 的签名、issuer、audience 和有效期。

不得仅信任客户端提交的邮件地址或身份请求头。

使用经过验证的 Access 身份映射内部用户 ID，为 D1 数据执行用户隔离。

前端提供退出登录及会话过期处理。

关闭不需要的 workers.dev 路由及部署预览地址，防止绕过访问控制。

本地开发允许模拟 Access 身份，但生产环境必须 fail-closed，禁止匿名回退。

## 17. 数据管理

Cloudflare D1 存储：

- 用户身份映射。
- 自建歌单。
- 导入歌单。
- 歌单曲目。
- 收藏。
- 播放历史。
- 用户设置。
- 歌曲跨平台标识。
- 必要的音源管理记录。

IndexedDB 存储：

- 已获取的音源脚本。
- 音源注册表缓存。
- 歌曲元数据缓存。
- 歌词缓存。
- 播放队列与进度。
- 未同步的用户操作。

D1 为云端用户数据权威来源。

实现基础同步、冲突处理和幂等机制。

用户退出或切换 Access 身份后，不能展示其他用户的本地缓存数据。

支持完整用户数据导入、导出和恢复。

不将临时音频 URL 作为永久歌曲数据保存。

## 18. UI / UX 设计

界面采用现代桌面音乐播放器风格。

避免默认 shadcn/ui 组件堆砌、过度圆角、大量渐变和无意义卡片。

桌面端布局：

- 左侧导航栏。
- 中央音乐内容区。
- 底部固定播放器控制栏。
- 可展开的播放队列。
- 独立全屏歌曲及歌词页面。

主要页面：

- 首页。
- 音乐搜索。
- 我的收藏。
- 我的歌单。
- 歌单详情。
- 歌单导入。
- 最近播放。
- 音源管理。
- 设置。
- 关于项目。

移动端采用适合触屏操作的底部导航栏及迷你播放器。

支持亮色、暗色和跟随系统主题。

支持长歌单虚拟滚动。

加载、空数据、错误及离线状态均需完整设计。

PWA 不应将 Access 登录响应、敏感 API 数据、临时播放链接或音乐代理响应错误地缓存到 Service Worker。

## 19. 歌词系统

支持：

- 普通文本歌词。
- LRC。
- 逐行歌词。
- 逐字歌词。
- TTML。
- 翻译歌词。
- 罗马音歌词。
- 歌词时间偏移调整。
- 点击歌词跳转进度。

歌词与实际播放录音版本必须匹配。

优先利用获得许可的歌词资源。

歌词渲染应与音频播放时钟同步，避免大量无意义的 React 重渲染。

实现低性能设备降级模式。

## 20. API 设计

建议提供：

- GET /api/me
- GET /api/search
- GET /api/tracks/:id
- GET /api/tracks/:id/lyrics
- POST /api/tracks/match
- POST /api/playlists/import
- GET /api/playlists
- POST /api/playlists
- PATCH /api/playlists/:id
- DELETE /api/playlists/:id
- POST /api/playlists/:id/tracks
- GET /api/favorites
- GET /api/history
- GET /api/sources
- GET /api/sources/:id/health
- POST /api/sources/:id/request
- POST /api/playback/session
- GET /api/stream/:token
- GET /api/settings
- PATCH /api/settings

所有接口使用统一错误结构和输入校验。

对于上游服务错误，保留内部可诊断信息，但不得向客户端暴露密钥及敏感网络数据。

## 21. 项目目录

```text
music-player/
├── apps/
│   ├── web/
│   └── worker/
├── packages/
│   ├── core/
│   ├── player/
│   ├── metadata/
│   ├── playlist/
│   ├── source-sdk/
│   ├── source-runtime/
│   ├── source-manager/
│   ├── stream-proxy/
│   ├── lyrics/
│   └── database/
├── sources/
│   ├── registry/
│   └── fixtures/
├── scripts/
│   ├── check-sources.ts
│   └── update-sources.ts
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── e2e/
├── docs/
├── .github/workflows/
├── wrangler.jsonc
├── pnpm-workspace.yaml
├── README.md
└── LICENSE
```

可根据实际模块规模调整结构，但不允许让单一文件承担多个系统的职责。

## 22. 开发阶段

### Phase 0：技术验证

必须先完成最小 PoC。

验证浏览器 QuickJS WASM 初始化、模拟洛雪音源执行、异步 HTTP Bridge、资源限制、脚本隔离、音频直连、音频 Range 代理、Access 鉴权和 PlaylistOut 适配可行性。

在实际 Cloudflare Workers 环境中验证资源消耗。

使用至少一个获得授权的真实音源及多个模拟音源进行测试。

不得在核心技术验证失败的情况下盲目推进完整应用。

### Phase 1：项目基础与播放器

建立 Monorepo、CI、Workers 部署、基础 UI、播放引擎、播放队列、基础设置。

### Phase 2：元数据及歌单

完成音乐搜索、歌曲模型、跨平台匹配、歌单解析、导入与导出。

### Phase 3：音源运行时

实现 QuickJS WASM、LX Compatibility Layer、音源注册表、缓存、受限 HTTP Bridge。

### Phase 4：播放与自动换源

完成音源选择、播放地址解析、Direct / Redirect / Proxy、Range 支持及故障切换。

### Phase 5：自动化维护

实现定时检测、状态发布、音源更新、版本回滚、熔断及自动恢复。

### Phase 6：完整音乐体验

实现歌词、收藏、历史、完整歌单管理、云端数据同步。

### Phase 7：生产环境完善

完成 Access、安全测试、移动端适配、PWA、性能优化、部署文档及最终验收。

## 23. 测试与验收

必须编写真实的单元测试、集成测试和浏览器端到端测试。

重点测试：

- 音源脚本无限循环。
- 音源初始化失败。
- 异步请求超时。
- QuickJS 内存泄漏。
- 非法代理请求。
- 未授权访问。
- Access 身份伪造。
- 不同用户数据隔离。
- 音源更新及回滚。
- 歌曲跨平台版本不匹配。
- 播放 URL 过期。
- 上游接口失效。
- Range 请求及进度跳转。
- 快速连续切歌。
- 页面切换时持续播放。
- 移动端播放。
- 歌单部分导入失败。
- 音源全部失效时保留用户数据。

性能验收目标：

- 播放器 UI 不因音源脚本执行而明显卡顿。
- 大型歌单支持虚拟滚动。
- 音频代理不随文件大小线性增加内存占用。
- Workers 无 CPU 超限错误。
- Workers CPU P95 目标低于 6 ms，为免费版保留余量。
- 音源执行超时后可以自动恢复。
- 不出现持续增长的 WASM 内存泄漏。

性能指标必须实际测量，不得使用推测数据冒充测试结果。

## 24. 部署要求

生产部署使用：

- Cloudflare Workers。
- Workers Static Assets。
- Cloudflare Access。
- Cloudflare D1。
- 可选的 Cloudflare KV。
- GitHub Actions。

优先兼容 Cloudflare 免费套餐。

默认域名可暂定为 music.convert-alpha.cc，实际部署时由用户确认。

自动生成数据库 migration、安全配置示例和部署文档。

未获得实际 Cloudflare 账户配置或部署权限时，不得声称部署成功。

## 25. AI 开发工作流

采用以下闭环：

架构设计 → 实现 → 测试 → 证据反馈 → 审查 → 修正。

每个阶段完成后：

1. 执行相关测试。
2. 检查实际运行结果。
3. 审查实现与需求是否一致。
4. 修复发现的问题。
5. 更新开发进度文档。
6. 提交清晰的 Git Commit。

创建并维护：

- docs/ARCHITECTURE.md
- docs/UPSTREAMS.md
- docs/SECURITY.md
- docs/DEPLOYMENT.md
- docs/TEST_REPORT.md
- docs/PROGRESS.md

明确区分已经实现、已经验证、尚未验证和被阻塞的功能。

不要在完成初始模板后停止，也不要将 Mock 实现冒充生产功能。

优先完成 Phase 0，确认技术可行性后持续推进其余阶段，直到完成全部可实施功能及验收测试。