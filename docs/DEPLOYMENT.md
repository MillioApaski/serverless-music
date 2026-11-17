# 部署与解除 Phase 0 阻塞

用户已部署测试站点 https://music.convert-alpha.cc 。2026-11-18 已补充仓库生产 Access 配置：issuer 为 https://unknown22518.cloudflareaccess.com，audience 为该应用的 AUD。首页和 /api/me 的未登录请求均已观察到转向对应 Access 登录页。最新配置仍需由 Cloudflare 部署后验证已登录的 Worker 响应，尚不能视为生产验收通过。

配置提交：`d64a6680ee2b960cfb46b39c0406295a01d4123f`。若使用仓库自动部署，检查该提交或后续提交是否部署成功；否则手动部署最新 main。填入 issuer/audience 本身不会创建或修改 Access Allow 策略。

## 当前权限阻塞

2026-11-17 实际连接检查：账户识别成功；读取 Access organization、Workers scripts 和 zones 均被 API 以 403 拒绝。连接缺少其接受的访问权限。

用户调整权限后已再次读取 Access organization、Access apps、Workers scripts和zones，结果仍为403；当前连接提示需要重新授权接受的OAuth范围。ChatGPT中的操作确认设置无法代替Cloudflare服务侧的OAuth权限。

继续云端验证需要 Cloudflare 连接至少具备 Workers 编辑/部署、Access 配置读取与维护，以及目标 Zone / DNS 的适当权限。具体使用最小权限配置；不需要把 token发到聊天中。

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
5. 按 Cloudflare 当前支持的 rate-limit binding方式配置名为 HTTP_LIMITER 的绑定并核实限额。未配置时生产 Bridge和播放会话会返回 503。
6. 确认 custom domain 的路由后部署；workers_dev=false、preview_urls=false 已设置。仍需验证部署预览环境不会成为绕过入口。
7. 部署后逐项验证 HTML、JS、WASM、/api/me、Bridge、stream 在未登录时均被拒绝；验证指定身份成功，非允许身份失败。
8. 用有明确授权依据的真实音源进行外部 HTTP/音频验证，记录访问地区、源版本、权限清单、资源授权及曲目样本。
9. 使用 Workers 观测/日志采集实际 CPU分位与错误率。分开测量 Direct、Bridge、Proxy、JWT 冷/热 JWKS 和 Range 跳转。记录样本量、时段、套餐与版本，CPU P95 目标小于6ms。不要使用本地请求墙钟 P95代替 Workers CPU。

## 发布前检查

真实第三方音源、实际 Access、外部 Range代理及云端性能完成前，不将此工程标记为完整播放器或生产就绪。因为还没有用户同步模块，D1 实例及 migration 将在 Phase 1/6 接入时生成与验证，不在 PoC 部署时创建未使用的数据库。

参考：[Access JWT验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Static Assets绑定](https://developers.cloudflare.com/workers/static-assets/binding/)。
