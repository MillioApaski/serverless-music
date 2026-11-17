# Phase 0 测试报告

日期：2026-11-17。执行环境：Linux、Node v24.22.1、pnpm11.25.0、QuickJS0.32.0 Release Sync；真实浏览器为当前远程 Chrome。未在实际 Cloudflare Workers执行生产测试。

## 自动测试与构建

| 检查 | 实际结果 |
| --- | --- |
| pnpm typecheck | 通过 |
| pnpm test | 5 个文件，66 项全部通过 |
| pnpm build | Vite与Worker构建通过；一个Release WASM资源 |
| Wrangler deploy --dry-run | 通过本地打包检查；不是部署成功 |
| Playwright test --list | 6 条测试可发现，包含桌面和移动配置 |
| Playwright实际 suite | 未执行；浏览器交互通过 CUA执行，不能混记为 suite通过 |
| GitHub Actions CI | 工作流已编写，未上传仓库、未远程执行 |

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
- 未验证PWA、iOS后台播放、移动触屏与长期内存；未接入D1，不能声称跨用户持久化同步完成。
- 未启用任何具有部署秘密或可写GitHub权限的社区脚本检测任务。

结论：本地架构核心链路有实测支持，Phase0的外部验收仍被阻塞。没有足够证据宣称完整项目可用或CPU目标已达标。
