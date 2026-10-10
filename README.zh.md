# @hp-future/dsh-plugin-balance

[English](README.md) | 中文

一个 [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）插件：在输入框状态栏显示 **DeepSeek 账户余额**，与 token、缓存两个胶囊并排。

## 它做什么

- **宿主半边** —— 在 dsh web server 上注册 `GET /balance`（缓存快照，30 秒 TTL）和 `GET /balance/refresh`（强制重新读取）两条路由，并复用组合自带的 `connection` 信任围栏。API key 每次读取都通过 `credentials` 服务重新解析，因此轮换密钥后下一次读取即生效，无需重启。
- **浏览器半边** —— 向 `conversation.composer.dock` 槽位注册一个条目。每 60 秒轮询一次，页面重新可见时刷新；在确知余额之前什么都不渲染（没有胶囊是诚实的，`0` 不是）。

API key 不会离开宿主进程：两条路由只返回账户事实，永不返回凭据本身。

## 安装

在任意 dsh Web profile 中按包名安装即可。可以让你的 agent 调用插件管理器：

> `plugin_manager`，`action: install_bundle`，`target: @hp-future/dsh-plugin-balance`

或者用 CLI（它在 profile 目录内转发给 pnpm）：

```bash
dsh plugin --profile web add @hp-future/dsh-plugin-balance
```

安装会同时选中该 bundle；页面重新加载后胶囊即出现。卸载：

```bash
dsh plugin --profile web remove @hp-future/dsh-plugin-balance
```

## 前提条件

| 条件 | 原因 |
|---|---|
| dsh `0.2.x`（`^0.2.0-rc.2`） | 浏览器半边是针对该版本线的槽位与模块加载器契约编写的。 |
| **Web** profile | 插件要在 `webServer` 上注册路由，并渲染进 Web 槽位。 |
| **DeepSeek** 凭据 | 余额取自 `https://api.deepseek.com/user/balance`。 |

### 凭据

密钥优先通过宿主的 `credentials` 服务读取——与 DeepSeek 推理适配器读的是同一个引用（`DEEPSEEK_API_KEY`），所以已经配好聊天的密钥无需额外设置。若未挂载凭据存储，插件退回到启动环境变量，因此直接导出也可以：

```bash
export DEEPSEEK_API_KEY=sk-...   # PowerShell: $env:DEEPSEEK_API_KEY = 'sk-...'
```

没有密钥时，路由返回 `{"ok":false,"code":"no-credential",...}`，胶囊不渲染。

## 版本兼容

dsh 会拒绝安装或激活 `peerDependencies` 不接纳当前运行时的插件。本插件声明：

```json
"peerDependencies": { "@deepseek-ai/dsh": "^0.2.0-rc.2" }
```

它接纳整个 `0.2.x` 运行时（含预发布版，因为 dsh 用 `includePrerelease: true` 判定 peer），并拒绝 `0.3.0` 及以后。这个拒绝是刻意的：浏览器半边使用了不属于稳定公开契约的槽位与模块加载器 API，未经验证的运行时宁可拒绝，也不默认信任。

如果你明知风险仍要在范围外的运行时上使用，dsh 提供精确版本豁免，拒绝信息里会直接给出命令：

```bash
dsh plugin --profile web allow-version @hp-future/dsh-plugin-balance@1.0.0 \
  --dsh-version <运行时版本> --accept-risk
```

这等于把崩溃或数据丢失的风险交给使用者承担，并不构成兼容性承诺。

## 排错

| 现象 | 原因 |
|---|---|
| 没有胶囊，也没有报错 | 没解析到 DeepSeek 凭据，或 `GET /balance` 返回了非 OK 状态。看浏览器控制台与 `/balance` 的响应。 |
| 插件行存在但未激活 | profile 缺少 `webServer`、`connection`、`credentials`、`launchEnvironment` 之一。Cordis 在声明的服务缺失时会让插件保持 inactive，这不是崩溃。 |
| 胶囊出现后又消失 | 读取失败会发布 `phase: 'failed'`，此时不渲染任何东西；下一次成功轮询会恢复。 |

本插件不再写入 `window.__dshBalance`；早期的开发探针已在 1.0.0 移除。

## 开发

纯 JavaScript，无构建步骤、无运行时依赖。两个范围限定的校验脚本无需启动 harness 进程即可驱动两侧：

```bash
node verify/verify-host.mjs      # 注册路由并真实调用余额端点
node verify/verify-client.mjs    # 用槽位替身驱动浏览器半边
```

`verify/` 不随包发布（见 `package.json` 的 `files`）。

## 许可

[MIT](LICENSE)
