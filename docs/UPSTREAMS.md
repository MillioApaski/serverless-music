# 上游版本、许可与复用记录

核查日期：2026-11-17。版本均为本次实际读取的 commit SHA，不追踪可变 HEAD。README / 许可初筛不等于完成每个平台适配器的技术验收。

| 上游 | commit | 许可记录 | 当前用途 |
| --- | --- | --- | --- |
| [DJChanahCJD/otter-music-web](https://github.com/DJChanahCJD/otter-music-web/tree/cea2e1337d961ff939493f52e2faa84f08bd1e47) | `cea2e1337d961ff939493f52e2faa84f08bd1e47` | 未确认；不得据此复制 | README / Serverless 架构；未复用代码。 |
| [algerkong/AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer/tree/f17418c99b688c72ef65972e945b989b170ff3e5) | `f17418c99b688c72ef65972e945b989b170ff3e5` | MIT | README / 播放交互参考；未复用组件或素材。 |
| [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic/tree/5d5fa23b7429c82a9932bbc2c9f6036403c5757b) | `5d5fa23b7429c82a9932bbc2c9f6036403c5757b` | MIT | README / 音乐库视觉参考；未复用组件或素材。 |
| [listen1/listen1_desktop](https://github.com/listen1/listen1_desktop/tree/bbc38654bd593d4ae70143230ea7814b34d09128) | `bbc38654bd593d4ae70143230ea7814b34d09128` | MIT | README / 多平台能力隔离参考；未移植适配器。 |
| [lyswhut/lx-music-desktop](https://github.com/lyswhut/lx-music-desktop/tree/323e4bac505da428adae8db6b58039fb2b36b86d) | `323e4bac505da428adae8db6b58039fb2b36b86d` | Apache-2.0 | 官方事件规范与能力声明；Compatibility Layer 独立编写。 |
| [XCQ0607/lxserver](https://github.com/XCQ0607/lxserver/tree/13865b82b19fe51219e3e21948c104a50e6fcebc) | `13865b82b19fe51219e3e21948c104a50e6fcebc` | Apache-2.0 | README / 服务端与音源管理参考；未复用服务。 |
| [ZeroTang05/Meting-API-Serverless](https://github.com/ZeroTang05/Meting-API-Serverless/tree/acc31be3d23ddbba148e54f4e37c98e8032b4a11) | `acc31be3d23ddbba148e54f4e37c98e8032b4a11` | 未确认；不得据此复制 | README / Worker 适配路线；许可未确认，未复用代码。 |
| [raclen/cf-anheplayer](https://github.com/raclen/cf-anheplayer/tree/0021c713176738f61337ebe105c2f0ede4aa5eb0) | `0021c713176738f61337ebe105c2f0ede4aa5eb0` | 未确认；不得据此复制 | 检查了检测脚本、LX 沙箱和工作流；仅参考检测/发布分离设计，未复制代码。 |
| [pdone/lx-music-source](https://github.com/pdone/lx-music-source/tree/ed8328dbd1a77aee3ee0116d835eb9d907eeaad2) | `ed8328dbd1a77aee3ee0116d835eb9d907eeaad2` | 未确认；不得据此复制 | README / 分发与更新入口调研；未抓取或运行社区音源。 |
| [amll-dev/applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics/tree/832bad5f16ec2a7f96d06707ef927c9a4d3713d3) | `832bad5f16ec2a7f96d06707ef927c9a4d3713d3` | AGPL-3.0 | AGPL-3.0；尚未引入，后续独立评估歌词组件许可。 |
| [amll-dev/amll-ttml-db](https://github.com/amll-dev/amll-ttml-db/tree/5239c94c7c9262844757055a5b4924c292653728) | `5239c94c7c9262844757055a5b4924c292653728` | CC0-1.0（根文件） | 根目录 CC0；尚未引入，仍需核查具体歌词/曲目资源的许可与版本匹配。 |
| [tranxuanthang/lrclib](https://github.com/tranxuanthang/lrclib/tree/ffdfed4dd8288f9065f5562508c13705cbe0436c) | `ffdfed4dd8288f9065f5562508c13705cbe0436c` | MIT | README / 歌词接口候选；未调用或复制服务。 |
| [metabrainz/musicbrainz-server](https://github.com/metabrainz/musicbrainz-server/tree/481d5b7b2488e4adff3b59130ba1fdcca227b1e8) | `481d5b7b2488e4adff3b59130ba1fdcca227b1e8` | GPL-2.0-or-later 为主 / 多许可 | README / ISRC 元数据候选；未复用 GPL 服务端代码。 |

## 实际移植：PlaylistOut

仓库：https://github.com/LengxiQwQ/playlistout/tree/f8f4abe62b41160633a5ae39979eda16ed6b8fff

版本：`f8f4abe62b41160633a5ae39979eda16ed6b8fff`，MIT，Copyright (c) 2026 LengxiQwQ。原始许可保存在 `packages/playlist/src/vendor/LICENSE`。

移植文件：网易云 normalize.ts、QQ normalize.ts、models/playlist.ts。两个 normalize.ts 的 import 路径从 ../../models/playlist 改为 ../models/playlist；models/playlist.ts 只把未使用的 analytics 类型依赖改为本地 string 类型别名。没有复制请求客户端。

外层适配器独立实现：原始 songmid/id/file 等对象存入 TrackIdentifier.raw，不绑定临时 URL；JSON 校验、导入失败列表、按内部 ID 去重、版本区分都由本项目处理。上游 client.ts 中的固定 X-Real-IP / X-Forwarded-For 请求头未采用；短链重定向客户端未移植。

## 独立实现的 LX 子集

参考官方规范：https://lxmusic.toside.cn/desktop/custom-source 。实现 lx.EVENT_NAMES、on、send、request、初始化、Promise 调度、定时器、回调取消。`utils` 当前为空，不能宣称完整洛雪兼容。

## cf-anheplayer 设计观察

固定版本中存在每四小时 cron、独立检测与发布任务、真实音频 URL 字节校验、平台级结果汇总和历史状态读取。其执行器使用 Node vm 并提供宿主 fetch；本项目没有移植这个执行边界，选择浏览器 Web Worker + QuickJS。根目录及 git 文件树未检出 LICENSE/COPYING，未确认授权前不复制其代码。后续 Source Manager 必须自行实现无秘密检测 job、输出验证、域名变更审核和独立发布。

## 直接依赖

以下来自本次安装的 package.json；精确解析版本以 pnpm-lock.yaml 为准。

| 包 | 安装版本 | 包声明许可 |
| --- | --- | --- |
| @cloudflare/workers-types | 5.20261117.1 | MIT OR Apache-2.0 |
| @jitl/quickjs-wasmfile-release-sync | 0.32.0 | MIT |
| @playwright/test | 1.65.1 | Apache-2.0 |
| @types/node | 24.19.2 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| esbuild | 0.27.7 | MIT |
| hono | 4.13.18 | MIT |
| jose | 6.2.17 | MIT |
| lucide-react | 0.468.0 | ISC |
| quickjs-emscripten | 0.32.0 | MIT |
| quickjs-emscripten-core | 0.32.0 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| tsx | 4.23.15 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 7.3.8 | MIT |
| vitest | 4.1.12 | MIT |
| wrangler | 4.162.0 | MIT OR Apache-2.0 |
| zod | 4.6.7 | MIT |

未使用的其他基础框架尚未安装：shadcn/ui、Zustand、TanStack Query/Virtual、Dexie、Drizzle、vite-plugin-pwa。对应模块进入实现阶段时，应重新核查当时版本与许可。
