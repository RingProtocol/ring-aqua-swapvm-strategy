# Ring Aqua SwapVM 策略

[English](README.md) · [接入接口](INTEGRATION.zh.md) · [测试记录](VALIDATION.zh.md) · [许可范围](LICENSE.md)

本仓库用于把钱包里的 FewToken 接入 Aqua 做市：生成未签名的限额授权、建仓和关闭交易，并检查链上状态。Ring 基于官方 SDK 和已有 SwapVM 指令实现这些功能，无须为当前策略新增生产合约。目标是在完整路线价格有竞争力时，让 1inch 的订单使用这些 FewToken 仓位。

完整的 `USDC → fwUSDC → Aqua → fwUSDT → USDT` 由本地测试执行器显式组合。它证明可以执行，不能证明 1inch 前端已经会选这条路线。下一步请 1inch review 现有实现，指出还需要补哪些开发；同时确认 Ring 是否需要在自己的前端增加类似 Barker 的 Aqua 仓位页面。当前没有这个页面，也没有假定它是必需条件。

0.2.2 提供九种资产的包装和解包、独立的 ETH/WETH 转换、通用建仓、凭仓位身份关闭、标准报价/成交调用、TypeScript 类型，以及供执行方适配的完整兑换步骤。采用官方 ABI 和 SDK，接口写法参考 Barker，保留 Ring 原有业务和安全约束；不依赖 Barker 的活动后台。详见[接入接口](INTEGRATION.zh.md)及[官方接法核对](OFFICIAL_REVIEW.zh.md)。本轮不含前端页面或新增生产合约。

`ETH ↔ WETH` 与 `WETH ↔ fwWETH` 是两层转换；原生 ETH 不直接进入 Aqua 仓位。九种代币的目录只限制工具包，不是链上全局白名单；链上由做市钱包的授权和已发布仓位控制用币范围。详见[代币列表与链上权限](INTEGRATION.zh.md#代币列表与链上权限)。

Powered by SwapVM — © Degensoft Ltd 2025.

Powered by Aqua — © Degensoft Ltd 2025.

本项目未获 1inch 背书，也未获生产路由支持确认。Ring 独立编写的代码与 SDK、生成程序分别适用各自条款，不能将整个项目都称为 MIT；详见 [许可范围](LICENSE.md)。

## 范围与版本

| 项目 | 本次范围 |
| --- | --- |
| 网络 / Router | Ethereum mainnet；官方 AquaSwapVMRouter v1.0.2 |
| SDK | `@1inch/swap-vm-sdk 0.4.2`、`@1inch/aqua-sdk 0.3.2`，独立 lockfile |
| 曲线 | 官方常数乘积、集中流动性与 pegged；策略参数由配置明确提供 |
| Maker 策略 | 九种 canonical FewToken，覆盖 6/8/18 位精度；具体资产见接入说明 |
| 用户成交保护 | exact-in 最少到账；exact-out 最多支付；非零期限 |
| 权限 | 保留官方 `tx.origin` KycNFT 检查；无签名、广播或私钥入口 |
| 流量 | 官方发现、路径组合、前端成交均未验证 |

`strategy-core.mjs` 使用官方 `PeggedSwapArgs.fromTokens` 和 `AquaProgramBuilder`，`strategy.mjs` 保留原 Node 入口。与高层 `AquaPeggedAmmStrategy` 的区别是增加强制到期指令，并用整数编码费率，避免 JavaScript 浮点转换。测试比较了两种 builder 的相同指令部分。

`config/deployment.json` 锁定地址、Router 版本和参考代码哈希。链上检查遇到不同代码、错误链或 wrapper 绑定不一致时失败。代码哈希检查并不等于审计，也不能覆盖可升级代币代理背后的全部实现风险。升级版本必须重新核对兼容性和 fork 证据，不能只改地址。

## 本地运行

需要 Node.js 22.13.1 或以上版本。主网 fork 还需要 `anvil` 在 PATH 中，并通过 `ETH_RPC_URL`（或 `RPC_URL`）提供支持历史状态的 Ethereum RPC。CLI 不会自动读取 `.env` 文件。

```sh
git clone https://github.com/RingProtocol/ring-aqua-swapvm-strategy.git
cd ring-aqua-swapvm-strategy
npm ci --ignore-scripts
npm test
npm run test:types
npm run example:plans
npm run test:package
npm audit --audit-level=high
# 通过本地安全配置向环境提供 ETH_RPC_URL；不要写入仓库文件
npm run test:fork
```

最后一条命令启动专用 loopback Anvil，拒绝复用被占用的端口。RPC 只用于读取主网；资金模拟、账号 impersonation、合约部署和所有交易都在本地。报告在 `evidence/fork-results.json`，执行失败写入被忽略的 `fork-attempt.json`，不覆盖已完成的报告。

CI 自动执行离线测试和依赖检查；不在 CI 中放 RPC 或自动运行主网交易。

## 合作方安装与示例

`npm run example:plans` 通过正式导出入口运行 [USDC/WETH 示例](examples/build-plans.mjs)，生成包装、建仓、报价/成交调用数据、完整兑换步骤、关闭和解包计划。示例使用占位地址与模拟库存，不调用 RPC、不签名、不广播；生成报价调用数据不等于已经获取报价。`leg.token` 只传目录中的 `address`、`decimals` 和可选 `symbol`，不能直接传含额外元数据的整个资产对象。

`npm run test:package` 将实际 npm 压缩包安装到独立临时项目，仅装生产依赖，再运行示例、比较 Node/portable 输出并编译外部 TypeScript 调用。不会发布 npm 包。压缩包不包含测试合约、历史证据或本地配置；文档中的源码审查链接对应完整 Git 仓库。保留 `private: true` 防止误发布，公开仓库前还需落实 [安全问题私下报告入口](SECURITY.md)。

## 生成可审查的交易数据（保留的稳定币旧格式）

1. 复制 `config/example.json` 为 `config/maker.local.json`。
2. 填入专用 maker 地址、明确的未来到期时间（Unix 秒）和未使用过的 salt；核对库存、费率和协议费收款地址。
3. 运行：

```sh
node cli.mjs build config/maker.local.json maker-unsigned.local.json
```

只生成文件，不连接钱包或发送交易；输出文件已存在时拒绝覆盖。

`open` 的顺序是：清零 fwUSDC 对 Aqua 的旧授权、授权指定 fwUSDC 额度、清零 fwUSDT 旧授权、授权指定 fwUSDT 额度、`ship` 两种币。输出包含 maker、chainId、to、data、value 和完整 strategyHash，可用 SDK 独立解码。

Maker 在执行上述建仓步骤前必须持有配置中的 FewToken。可用独立 `wrap` 接口构造明确数量的包装交易，但不会自动筹资、签名或广播。授权上限以原始代币单位记录，禁止无限授权。示例的 30 fwUSDC / 33 fwUSDT 仅用于复现约 63 美元的测试配置，不是资金建议。

`close` 是 `dock` 两种币，再分别 `approve(Aqua, 0)`。关闭不会把余额转给其他地址。若已有 `dock` 导致再次 dock 失败，仍需分别执行撤销授权；不能因为第一笔失败就放弃撤销。关闭后的 hash 不能重新 ship，必须使用新 salt。不同策略共享钱包的 ERC-20 allowance，故试点应使用专用钱包。

## 旧格式参数及限制

| 参数 | 示例 | 含义 / 限制 |
| --- | --- | --- |
| `fwUSDC` / `fwUSDT` | `"30"` / `"33"` | 人类单位字符串；最多 6 位小数，原始数量大于 0 且小于 2^96 |
| `amplification` | `"300"` | 官方曲线的线性宽度系数，范围 `(0, 5000]`，以 1e27 编码 |
| `feeBps` | `"0.1"` | Maker 费率；0.1 bps = 0.001%，最多 5 位小数 |
| `protocolFeeBps` | `"0.025"` | 协议费率；0.025 bps = 0.00025%，与收款地址一起交官方确认 |
| `expiry` | 当前时间 + 86400 | 必须为未来 uint40 秒数，不支持永久有效 |
| `salt` | 唯一正整数 | 生成独立策略身份；不能重用已 ship / dock 的策略 |

费率合计必须小于 100%；这是编码合法性限制，绝不表示接近上限的费率适合做市。储备、放大系数和费率改变后都必须重新报价，不能把测试参数当作长期定价策略。本模块没有外部价格 oracle、自动对冲或自动补仓。

示例 30/33 的初始库存比例会形成约 1.10 USDT/USDC 的价格。这是刻意给出的价格优惠；交易者多拿到的资产来自 maker 库存价值变化，不能算协议利润。全部授权资产均有合约风险，不能把 3 美元库存差描述为最大损失。

## 只读预检和报价

`preflight` 输入为 `{ "strategy": <上述配置>, "quote": <请求> }`。示例请求：

```json
{
  "direction": "USDC_USDT",
  "exactIn": true,
  "amount": "1000000",
  "threshold": "990000",
  "taker": "实际具备 KycNFT 的 Resolver 地址",
  "receiver": "本次报价的接收地址",
  "deadline": "未来且不晚于策略到期的 Unix 秒数"
}
```

`amount`、`threshold` 都是 FewToken 原始单位。反向使用 `USDT_USDC`。exact-out 的 threshold 是最多输入，不是最少输出。示例阈值只是格式演示，实际必须由订单约束和最新报价决定。

```sh
# 通过本地安全配置向环境提供 ETH_RPC_URL；不要写入仓库文件
node cli.mjs preflight preflight-input.local.json preflight-result.local.json
```

读取同一个 canonical block hash 上的代码、FewFactory 绑定、decimals、maker 真实余额、ERC-20 allowance、Aqua virtual balance 和 Resolver 凭证，再分别做 `quote` 与 `swap` 的 `eth_call`。结束时复查区块和链，拒绝超过 180 秒的快照。RPC 不支持按区块哈希查询时失败，不悄悄降级为混用 latest。

`available` 表示所请求检查在该快照通过；`insufficient` 表示已确认未激活、余额/授权等约束；`read_failed` 表示无法取得或验证完整结果；`stale` 表示快照过期或区块改变。未知失败不当作余额为零。任何结果中的 `executionAllowed` 都是 false。

`swap` 模拟检验的是显式 FewToken 交易，尚未替实际 Resolver 的完整用户订单做模拟。换区块、换 taker / receiver / 阈值后必须重新检查。可用额度是余额、allowance、virtual balance 的较小值；反向收到代币不会恢复已经消耗的 ERC-20 授权。

## 九个 wrapper 的接入材料

`config/wrapper-sources.json` 提供九个 Uniswap v4 wrapper 的 PoolKey、poolId、FewToken、underlying、decimals 和公开允许名单来源。ETH 池的输入是原生 ETH，fwWETH 的底层绑定是 WETH，不能混写。

```sh
node cli.mjs sources config/example.json wrapper-check.local.json
```

该命令要求提供 JSON 输入文件，但清单来自固定的 `config/wrapper-sources.json`，不会由该输入文件覆盖。

`sources.mjs` 重新查询 canonical 绑定、即时赎回余额、hook 代码哈希，并通过 V4Quoter 产生双向 exact-in / exact-out 报价向量。不会把 1:1 当作永远可执行的静态报价。单个方向失败保留 null，其余资产继续检查。输出仍需逐项看 `quotes[].status`，顶层 available 只表示清单和快照核验完成。

这是 Ring 的接入数据格式，尚不是 1inch 承诺接受的 Pathfinder 插件格式。Resolver 接入必须核对 wrapper 的返回 delta、输入结算顺序、输出资金可用性、用户限价和实际 gas；Uniswap 的公开允许名单不能替代 1inch 收录。

## 来源与安全范围

- [官方 Path B：组合已有 opcodes](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp)
- [官方访问与路由边界](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder)
- [官方 SDK 源码](https://github.com/1inch/sdks/tree/master/typescript/swap-vm)

官方 SDK 及链上协议采用各自许可条款；不将其称为 MIT/Apache。SDK 生成的指令和测试输出保留上游许可及署名，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。没有复制 Aqua/SwapVM Solidity 实现。`test/RouteHarness.sol` 只用于本地组合验证，不能直接部署用于接单，未包含生产执行器所需的全面路由绑定、用户授权模型、重入和 dust 安全设计。
