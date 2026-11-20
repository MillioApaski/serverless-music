# 部署与云端验证

测试站点为 https://music.convert-alpha.cc 。Access 已配置用于测试站登录，线上浏览器技术验证为 5/5。自有测试音源的 Direct、Redirect、Proxy 和 Workers CPU 测量结果见 [Phase 0 测试报告](TEST_REPORT.md)。正式音源、Access 专项及长期内存验收按阶段继续。

## 本地

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run --env="" --outdir artifacts/wrangler
```

Wrangler 本地完整 Worker 预览：构建后运行 `pnpm worker:dev`。Vite 日常预览使用 `pnpm dev`，其 API 适配器只用于本地开发。

## 生产配置顺序

1. 确认实际部署域名和允许访问的邮箱/身份，不默认使用整个邮箱域。
2. 在 Zero Trust 中创建覆盖完整站点的 Access 应用与策略，取得 team issuer 与应用 audience。将值填写到 wrangler.jsonc 的 ACCESS_ISSUER / ACCESS_AUD。
3. 优先使用 Worker 级别 Access 保护；保留生产 Worker 内的 JWT 校验。Static Assets 的 run_worker_first=true 覆盖所有路径，避免 HTML/WASM绕过鉴权。
4. 生成独立的随机 STREAM_SECRET，通过 `pnpm exec wrangler secret put STREAM_SECRET --env=""` 设置。不得使用本地适配器中的测试密钥。
5. 生产配置现在通过 `ratelimits` 声明 `HTTP_LIMITER` 绑定，namespace_id 为 `1461127045`，limit=120、period=60。按已验证的内部用户ID计数，Bridge与播放会话共用额度。该限制按Cloudflare接入点近似执行，不是全球严格配额。namespace在账户内共享，同一namespace不得分配给无关Worker。部署后应在绑定列表确认 HTTP_LIMITER 出现；缺失仍会返回503。
6. 确认 custom domain 的路由后部署；workers_dev=false、preview_urls=false 已设置。仍需验证部署预览环境不会成为绕过入口。
7. 部署后逐项验证 HTML、JS、WASM、/api/me、Bridge、stream 在未登录时均被拒绝；验证指定身份成功，非允许身份失败。
8. 用有明确授权依据的真实音源进行外部 HTTP/音频验证，记录访问地区、源版本、权限清单、资源授权及曲目样本。
9. 使用 Workers 观测/日志采集实际 CPU分位与错误率。分开测量 Direct、Bridge、Proxy、JWT 冷/热 JWKS 和 Range 跳转。记录样本量、时段、套餐与版本，CPU P95 目标小于6ms。不要使用本地请求墙钟 P95代替 Workers CPU。

## 发布前检查

真实第三方音源、实际 Access、外部 Range代理及云端性能完成前，不将此工程标记为完整播放器或生产就绪。因为还没有用户同步模块，D1 实例及 migration 将在 Phase 1/6 接入时生成与验证，不在 PoC 部署时创建未使用的数据库。

参考：[Access JWT验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Static Assets绑定](https://developers.cloudflare.com/workers/static-assets/binding/)。

## 限流绑定修复（2026-11-18）

线上截图显示4/5检查通过，唯一失败项提示“请求限流尚未配置”。根因是Worker代码要求HTTP_LIMITER，但Wrangler缺少对应声明；本地适配器的local模式跳过限流，之前的浏览器测试未覆盖这个生产缺口。

已增加原生rate-limit绑定、生产路由的缺失/放行/拒绝/共享用户额度测试，以及CI生产Wrangler打包检查。无需手工创建KV或D1。用户已在部署后登录复测，确认 HTTP Bridge 通过，全部五项检查通过。

[Cloudflare官方限流绑定文档](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。
