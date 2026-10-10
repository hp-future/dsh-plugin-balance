# dsh-plugin-balance

[English](README.md) | 中文 | [npm](https://www.npmjs.com/package/@hp-future/dsh-plugin-balance)

在 dsh 输入框状态栏显示 DeepSeek 账户余额，与 token、缓存两个胶囊并排。

## 安装

```
plugin_manager → install_bundle → @hp-future/dsh-plugin-balance
```

或在终端执行：

```bash
dsh plugin --profile web add @hp-future/dsh-plugin-balance
```

安装后刷新页面。卸载：

```bash
dsh plugin --profile web remove @hp-future/dsh-plugin-balance
```

## 配置

余额取自 `https://api.deepseek.com/user/balance`，使用与 DeepSeek 推理适配器相同的
`DEEPSEEK_API_KEY` 引用，因此已经配好聊天的密钥可以直接用。

如果没有凭据存储，就在启动 dsh 前导出环境变量：

```bash
export DEEPSEEK_API_KEY=sk-...          # PowerShell: $env:DEEPSEEK_API_KEY = 'sk-...'
```

通过凭据服务轮换密钥后，下一次读取即生效，无需重启。

## 环境要求

- dsh `0.2.x`
- Web profile
- DeepSeek API key

## 版本兼容

插件声明 peer 依赖 `"@deepseek-ai/dsh": "^0.2.0-rc.2"`，覆盖整个 `0.2.x`（含预发布版）。
dsh 会在安装前校验，因此你会看到明确的拒绝，而不是一个在未验证版本上勉强工作的插件。

在范围外使用是可行的，但不建议——它使用的输入框槽位 API 不属于稳定契约。如果仍要尝试，
拒绝信息里已经给出了豁免命令：

```bash
dsh plugin --profile web allow-version @hp-future/dsh-plugin-balance@1.0.0 \
  --dsh-version <运行时版本> --accept-risk
```

## 常见问题

**胶囊始终不出现。** 在浏览器开发者工具里查看 `GET /balance`。返回的 `code` 为
`no-credential` 表示没有找到密钥，其他 code 表示上游读取失败。

**胶囊显示过数值后消失。** 读取失败时会隐藏胶囊，而不是继续显示过期数值。下一次轮询成功
（60 秒内）就会恢复。

**插件显示已安装但未激活。** profile 缺少它依赖的宿主服务之一：`webServer`、`connection`、
`credentials`、`launchEnvironment`。dsh 会让这类插件保持 inactive，而不是直接报错。

## 开发

纯 JavaScript，无构建步骤、无运行时依赖。两侧都有无需启动 dsh 即可运行的校验脚本：

```bash
node verify/verify-host.mjs      # 注册路由并读取真实余额端点
node verify/verify-client.mjs    # 用槽位替身驱动浏览器半边
```

运行宿主校验前设置 `DEEPSEEK_API_KEY`，可以同时校验真实返回内容。

## 许可

MIT
