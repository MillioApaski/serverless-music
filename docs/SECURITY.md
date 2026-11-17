# 安全边界

## 身份

生产环境对所有请求先验证 Access，包括 HTML、WASM 和 API。配置缺失返回 503；缺少或无效 JWT 返回 401。JOSE 校验 RS256 签名、issuer、audience、exp、iat、sub，以及应用 token 类型。JWKS 只从配置的 `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` 获取，并在 isolate 内缓存。

内部身份为 issuer 与 sub 的 SHA-256，不相信客户端邮箱头，也不把邮箱作为可伪造的数据库分区键。现有测试覆盖错误签名、过期、错误 issuer / audience、伪造邮箱和公开域名上的本地标志。真实 Access 策略与会话尚未验证。

本地身份同时要求 APP_ENV=local、显式 DEV_IDENTITY 和 loopback hostname。Vite 本地适配器不打入 Worker；生产配置无 DEV_IDENTITY。所有写接口校验同源 Origin 和 application/json。

## 网络

Source Manifest 只能来自维护方源码注册表。当前外部源注册表为空，只有独立的固定同源测试资源。普通客户端不能提交新的权限策略。

外部请求仅允许 HTTPS、精确域名与路径边界、预先声明的方法和请求头；禁止字面 IP、数字形式的回环地址、保留主机名、非标准端口、认证信息、歧义路径编码。每次重定向先重新检查；跨 origin 丢弃原请求头。Access Cookie、Authorization、代理凭证等永不转发。

普通 Bridge 限制请求体 64 KiB、响应 1 MiB、超时最长 10 秒。请求读取也有 1 MiB入口限制。生产代理及播放会话必须绑定 HTTP_LIMITER，否则返回 503；云端限流绑定尚未验证。

DNS：域名审核必须确认域名由可信公共服务维护，不能把用户可控域名或通配符加入注册表。当前实现没有 DNS 查询与 IP 固定连接机制，不能声称能抵御已允许域名的 DNS rebinding；由于尚未接入外部音源，该项不会扩大实际外部出口。启用新域名之前必须确认 Cloudflare 出口对保留地址的阻止行为并完成云端负向测试；必要时引入固定可信出口策略。

## 凭证和音频

播放凭证为有效期 5 分钟的 HS256 JWT，绑定内部用户 ID、合法源和目标 URL。凭证不是 URL 加密，不能用于隐藏音源。每次使用重新检查身份及当前源权限。生产 STREAM_SECRET 需要至少 32 字节并通过 Wrangler secret 设置。

仅转发媒体必要响应头；不转发 Set-Cookie。Range 支持单段字节范围，保留 206 / Content-Range / Content-Length / Accept-Ranges。HEAD 不返回 body。上游非音频返回拒绝，416 不反射上游 HTML。客户端取消会取消流读取。

## 脚本

网页原生 JavaScript 环境不执行第三方脚本；其可见宿主接口受到配额约束，未向脚本提供 DOM、Cookie、fetch、Node require、Access token 或 IndexedDB。Buffer / crypto / zlib 当前没有实现；不通过暴露 Node 全局对象来填补这些功能。

不能把 QuickJS 的 guest heap 限额当作全浏览器内存上限。WASM 清理发生致命异常时必须终止 Worker。长期浏览器内存与更广泛恶意脚本 corpus 仍需验证。

## 缓存和日志

当前所有生产响应 no-store，没有 Service Worker，不会把 Access 登录响应和临时播放链接缓存到 PWA。尚未接入任何用户持久化数据，不存在可宣称验证的 D1 跨用户同步。源码不含生产密钥或部署 token；错误响应不返回异常栈及上游网络参数。

后续源检测必须使用无秘密的 read-only job，发布使用独立 job，不能把有写权限的 GitHub token交给脚本执行环境。本次 CI 只有 contents:read，不运行社区音源或发布任务。
