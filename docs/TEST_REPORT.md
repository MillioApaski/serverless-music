# Phase 0 测试报告

日期：2026-11-17。执行环境：Linux、Node v24.22.1、pnpm11.25.0、QuickJS0.32.0 Release Sync；真实浏览器为当前远程 Chrome。未在实际 Cloudflare Workers执行生产测试。

## 自动测试与构建

| 检查 | 实际结果 |
| --- | --- |
| pnpm typecheck | 通过 |
| pnpm test | 最新本地结果：6个文件，70项全部通过（含新增4项生产限流路由测试） |
| pnpm build | Vite与Worker构建通过；一个Release WASM资源 |
| Wrangler deploy --dry-run | 通过本地打包检查；不是部署成功 |
| Playwright test --list | 6 条测试可发现，包含桌面和移动配置 |
| Playwright实际 suite | GitHub CI：桌面 3/3、移动 Chromium 3/3，全部通过（8.1 秒） |
| GitHub Actions CI | 修正后全部通过：安装、类型检查、66项测试、构建、6项端到端测试 |

原始结果：[Vitest JSON](evidence/vitest.json)。

66项覆盖：QuickJS真实WASM异步回调、Promise任务调度、定时器、取消请求、无限循环、无初始化、无响应、内存上限、重复调用guest分配、隔离、致命异常后的Worker回收；Access签名及错误issuer/audience/exp/伪造邮箱；敏感请求头、保留IP、路径/端口/协议、逐跳重定向及响应大小；凭证篡改/用户绑定；Range/HEAD/取消/非音频上游；歌单原始ID、版本保留、部分失败；播放器快速切换、autoplay与生命周期。

## 实际浏览器交互

通过页面真实按钮执行，并读取可见结果。该轮五项结果为：

| 检查 | 结果 | 本轮墙钟时间 |
| --- | --- | --- |
| QuickJS初始化及同源HTTP Bridge | 通过 | 231 ms |
| window/document/fetch/IndexedDB隔离 | 通过 | 145 ms |
| 无限循环中断 | 通过 | 3122 ms |
| 超时后的新实例恢复 | 通过 | 115 ms |
| Range206、Content-Range、64字节 | 通过 | 11 ms |

最终复测仍为5/5，通过耗时依次为227、139、3134、144、12ms；Direct播放进度推进到5.5秒，Redirect完整播放到18秒。

另实际操作：Proxy试听出现“暂停”状态，跨页面后进度推进到6.6秒；将进度拖到12秒后暂停，页面显示12.4秒；JSON示例读取1首、无重复/失败，并显示`tx:owned-example-id`。这是自有生成的测试PCM，不是第三方音乐平台的播放成功证明。

## 1000 次WASM调用 smoke benchmark

原始数据：[poc-benchmark.json](evidence/poc-benchmark.json)。

| 指标 | 实测值 |
| --- | --- |
| 本地模块初始化墙钟 | 54.33 ms |
| 调用次数 | 1000 |
| 单次请求墙钟P50 | 4.40 ms |
| 单次请求墙钟P95 | 4.73 ms |
| QuickJS guest live bytes，调用前/后 | 100050 / 100050 |
| QuickJS guest live bytes差值 | 0 |
| Cloudflare Workers CPU P95 | 未测，null |

HTTP传输是受控fixture函数；WASM及Promise调度是真实执行。统计包括2ms轮询的墙钟等待，不能用于推算WorkersCPU，也不能证明外部网络时延。guest memory_used_size不是WASM线性内存或浏览器RSS；仅说明该1000次简单用例没有累积活跃guest分配。

## 仍存在的限制

- 已观察到特定大量字符串分配+中断组合导致QuickJS清理GC断言。测试通过的是整个Worker强制销毁与新实例恢复，不是该路径优雅释放。错误实例不得复用。
- 线上真实音源、LX加密/压缩兼容、真实歌单分页仍未完成。外部源注册表为空。
- Cloudflare API权限检查：Access、Workers、Zone读取均403；没有部署或CPU指标。没有运行真实Access登录或伪造真实服务会话。
- 未验证PWA、iOS后台播放、真实移动设备与长期内存；未接入D1，不能声称跨用户持久化同步完成。
- 未启用任何具有部署秘密或可写GitHub权限的社区脚本检测任务。

结论：本地架构核心链路有实测支持，Phase0的外部验收仍被阻塞。没有足够证据宣称完整项目可用或CPU目标已达标。

## GitHub首轮CI与修正

[首轮运行](https://github.com/MillioApaski/serverless-music/actions/runs/44048098727)中，66项测试、类型检查和构建通过；Playwright首次执行2/6通过。trace确认：首次加载Worker依赖后Vite刷新页面，清空验证状态；移动端还存在装饰区域水平溢出，导致导航点击目标与实际可视区域错位。

修正：端到端测试改为读取构建产物的Vite preview，复用仅本地的API适配器；开发模式提前优化Worker依赖；限制水平溢出、均分移动导航命中区域；切换页面回到顶部。测试增加视口宽度断言并等待音源注册表加载。未使用force点击或跳过失败检查。[修正后运行](https://github.com/MillioApaski/serverless-music/actions/runs/44049106360)全部通过：66项单元/集成测试、构建、桌面与移动 Chromium 的6项Playwright测试；浏览器用例耗时8.1秒。受测代码commit为`5b6369cff4c125425e6dbfe2068c95a5d4b04ee6`。后续仅补充此文档和证据，不改变受测代码。

原始CI状态及测试摘要见 [github-ci.json](evidence/github-ci.json)。Cloudflare权限在本次恢复工作后再次验证仍返回403；没有发生生产部署或DNS修改。

## 2026-11-18 生产限流配置回归

用户线上截图显示4/5：宿主隔离、无限循环中断、恢复、Range通过；QuickJS初始化和HTTP Bridge失败，错误为“请求限流尚未配置”。这说明实际网关已允许已登录访问，但生产Worker缺HTTP_LIMITER绑定。未将此截图记录成5/5。

新增绑定：HTTP_LIMITER，namespace_id=1461127045，120次/60秒；使用现有已验证用户ID作为key。Cloudflare按接入点近似限流。新增4项生产路由测试明确stub认证边界，检查缺绑定返回503、允许时Bridge成功、拒绝时429，以及Bridge/播放会话共享同一用户key；实际Access验签仍由既有安全用例覆盖。

本地验证：70/70测试、类型检查、构建及Wrangler生产dry-run全部通过。Wrangler明确输出 env.HTTP_LIMITER (120 requests/60s) / Rate Limit。CI增加相同生产打包检查。随后用户部署修复并完成线上复测，结果见下方。

### 修复后线上复测

用户在 `music.convert-alpha.cc` 登录后复测，浏览器检查 **5/5 通过**。用户确认自有测试音频可听，截图显示 Direct 播放进度达到 0:18 / 0:18。

| 浏览器检查 | 结果 | 墙钟耗时 |
| --- | --- | ---: |
| QuickJS 初始化与 HTTP Bridge | 通过 | 2489 ms |
| 宿主对象隔离 | 通过 | 365 ms |
| 无限循环中断 | 通过 | 3370 ms |
| 超时后的新实例恢复 | 通过 | 366 ms |
| 自有音频 Range 字节读取 | 通过，206 / Content-Range / 64 字节 | 84 ms |

证据来自用户截图和试听反馈。

## 2026-11-20 云端测试及 Phase 0 收尾

独立测试 Worker 提供自有 WAV。线上 Redirect 返回 302，Proxy 的 `Range: bytes=0-63` 返回 206、`Content-Range: bytes 0-63/576044` 和 64 字节正文。

| Cloudflare Workers 请求 | 样本 | CPU P95 | CPU 最大值 | 成功响应 |
| --- | ---: | ---: | ---: | ---: |
| 创建播放会话 | 60 | 4 ms | 14 ms | 60 × 200 |
| Redirect | 30 | 2 ms | 3 ms | 30 × 302 |
| Proxy 64 字节 Range | 30 | 4 ms | 7 ms | 30 × 206 |
| Proxy 完整 WAV，串行 | 30 | 2 ms | 2 ms | 30 × 200 |
| Proxy 完整 WAV，五路并发 | 30 | 2 ms | 5 ms | 30 × 200 |

统计使用 Cloudflare 调用日志的 CPU 毫秒值。完整下载每次读取 576044 字节。各组 P95 均低于 6 ms。

Phase 0 按用户确认的范围收尾。真实音源接入、Access 专项验收与长期内存测试延期。
