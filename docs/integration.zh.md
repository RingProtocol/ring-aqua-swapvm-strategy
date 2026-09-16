# FewToken Aqua 接入接口

0.2.2 将 FewToken 策略、做市资金准备和普通币兑换步骤整理成可供前端或执行方调用的 SDK，并提供独立的 ETH/WETH 转换。底层复用 1inch 官方 Aqua/SwapVM，不新增生产合约，不依赖 Barker 的活动后台。[官方接法核对与升级注意](compatibility.md)。

本次范围是钱包里的 FewToken 通过 Aqua 做市。参考 Barker 的公开做法，应用可负责市场配置、钱包和仓位体验，官方 Aqua/SwapVM 负责策略与成交；Ring 提供 FewToken 包装、解包和普通币完整路线。建仓输入参考通用 `legs` 写法，交易使用官方 ABI，保留 Ring 的协议费、有效期、限额授权与资金接收约束。是否在 Ring 前端增加类似 Barker 的页面，留待 1inch 评审时确认；没有声称对方已接受当前代码。

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025. [许可范围](../LICENSE.md)。

## 仓库提供的功能

| 接口 | 功能 |
| --- | --- |
| `ASSETS`、`getAsset` | 获取链、FewToken、原币地址和精度；当前目录含九种资产 |
| `buildAquaShipPlan` | 构造两种 FewToken 的官方策略，返回策略身份、建仓调用，以及完整限额授权顺序 |
| `buildAquaDockPlan` | 使用已发布仓位的 hash 和代币列表关闭，不需要重新填原始金额或定价参数；也兼容旧配置输入 |
| `buildAquaQuoteCall`、`buildAquaSwapCall` | 按代币地址构造官方报价、成交调用，包含输入/输出限额和有效期 |
| `buildMakerWrapPlan`、`buildMakerUnwrapPlan` | 构造原币和 FewToken 的明确数量转换，资金始终回到同一做市钱包 |
| `buildNativeWrapPlan`、`buildNativeUnwrapPlan` | 构造 ETH/WETH 转换；调用 WETH 的 `deposit` 或 `withdraw`，不做 ERC-20 授权 |
| `buildUnderlyingRoute` | 构造普通币 → FewToken → Aqua → FewToken → 普通币的原子执行步骤，按实际成交结果解包和退款 |
| `preflight` | 在同一个区块检查官方部署、代币绑定、精度、库存、授权、仓位和执行方资格，并模拟报价与直接 FewToken 成交 |

代币目录为 `config/assets.json`，独立于 Uniswap hook 清单。当前原币为 **USDC、USDT、DAI、WETH、WBTC、cbBTC、weETH、UNI、wstETH**，其 FewToken 使用 6/8/18 位精度。新增资产需要核验链上绑定、代币行为并补测试，不要求先有 Uniswap hook。目录不是 1inch 的收录名单。

ETH 与 WETH 分两层处理：`ETH ↔ WETH ↔ fwWETH`。原生转换接口只负责第一层，`buildMakerWrapPlan({asset: 'WETH', ...})` 和对应解包接口负责第二层。原生 ETH 不是第十种 FewToken，不能放进 Aqua 的 ERC-20 `legs` 或当成 `asset: 'ETH'` 传给 FewToken 转换接口。不会仅根据代币名称把不同资产按 1:1 定价。

## ETH、WETH 和 ERC-20 的转换

| 当前持有的币 | 包装 | 反向解包 |
| --- | --- | --- |
| ETH | WETH `deposit()`，交易 `value` 等于包装数量 | WETH `withdraw(amount)`，交易 `value` 为 0 |
| WETH | fwWETH `wrapTo(amount, maker)` | fwWETH `unwrapTo(amount, maker)` |
| USDT | 先清零旧授权，再限额授权 fwUSDT、调用 `wrapTo`，最后清零授权 | fwUSDT `unwrapTo(amount, maker)` |
| 普通 ERC-20，例如 UNI | 对 fwUNI 限额授权、调用 `wrapTo` 并清理授权 | fwUNI `unwrapTo(amount, maker)` |

```js
const native = { chainId: 1, maker, amount: '1000000000000000' }; // 0.001 ETH，单位 wei
const ethToWeth = buildNativeWrapPlan(native);
const wethToFew = buildMakerWrapPlan({ ...native, asset: 'WETH' });
const fewToWeth = buildMakerUnwrapPlan({ ...native, asset: 'WETH' });
const wethToEth = buildNativeUnwrapPlan(native);
```

以上是分别供钱包确认的做市资金准备/退出计划，不是一次原子成交。包装时先确认 ETH/WETH 转换成功，再包装成 FewToken；退出时先关闭仓位并撤销授权，再按最新余额决定解包数量。每个计划都有明确数量和固定收款人，ETH 包装需另留 gas。交易中途失败不会撤销此前已确认的交易，仍需检查并清理授权。WETH9 的 `withdraw` 把 ETH 发回调用钱包，合约钱包需验证接收 ETH 的兼容性。

`buildUnderlyingRoute` 仍以 ERC-20 为输入/输出边界；若执行方要让交易用户直接付 ETH 或收 ETH，需要在其原子执行器中接好 WETH 的 deposit/withdraw、实际到账、退款和原生余额保护。上述做市接口不能代替这部分接单开发。参考 [WETH9 源码](https://github.com/gnosis/canonical-weth/blob/master/contracts/WETH9.sol)。

## 代币列表与链上权限

| 层级 | 谁决定 | 实际限制 |
| --- | --- | --- |
| 工具包支持列表 | 有权合并、发布代码的 Ring 仓库维护者 | 当前版本可构造哪些币的计划；修改 `config/assets.json` 并核验绑定、精度与代币行为后发布 |
| 钱包的链上仓位 | 做市钱包签名 | 授权给 Aqua 的代币与额度，以及 `ship` 登记的 app、策略、代币和虚拟数量 |
| 官方订单采用 | 1inch 路由服务和执行方 | 是否发现仓位、组合 FewToken 路线并在有价格优势时成交 |

**当前没有 Ring 的全局链上代币白名单，也没有 addToken/removeToken 管理员。** Aqua 不会读取我们的 JSON。别人绕过 SDK 可以为自己的钱包登记其他代币，但不能因此改掉我们钱包的仓位或使用我们的资金。官方注册表按 `(maker, app, strategyHash, token)` 分开记录额度；仅有 ERC-20 授权而没有该仓位的代币额度，不能通过这份仓位转出该币。

例如，团队用 `fwWETH/fwUSDT` 做市：团队钱包分别限额授权 Aqua，再发布这两种币的策略；执行方只能按该策略及其额度成交。要停止，团队钱包关闭仓位并撤销授权。改工具包目录不等于改链上仓位，也不会自动停止已经发布的仓位；关闭接口支持保存的原仓位身份，不要求代币仍在新版本目录里。

若以后要求“链上强制所有 Ring 入口只允许指定币”，需另行设计并审查执行校验；不能把当前 JSON 当作这个安全保证。本次没有新增该合约或管理权限。参见 [Aqua 源码](https://github.com/1inch/aqua/blob/main/src/Aqua.sol)与[官方仓位流程](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/strategy-lifecycle)。

## 标准交易格式与参数

报价和成交调用返回 `{chainId, from, to, data, value}`。建仓和关闭计划同时提供这个 `transaction`，以及包括授权操作的 `transactions`。`transaction` 只是一笔调用，不能替代完整授权顺序；传给钱包时使用调用对象，不要把整个计划对象原样发送。

通用策略输入包括：

- `chainId`、`maker`：当前仅以太坊。
- `legs`：两种 FewToken 的地址、精度和金额，按地址升序排列，金额随对应代币移动。
- `shape`：全范围常数乘积，或 pegged 曲线；集中流动性通过全范围分支加 `concentrate` 参数表达。
- `feeRateE9`：十亿分之一为单位的 LP 手续费；可另传明确的 `protocolFee` 和接收地址。
- `expiry`、`salt`：有效期和不重复的策略标识。通用格式的 salt 为非零 uint64。

通用金额使用原始单位整数字符串或 bigint，不能传浮点数；输出可直接序列化为 JSON。原始数量小于 2^96。区间价格是“地址较大代币的原始单位 / 地址较小代币的原始单位 × 1e18”，必须正确处理两种币的精度。完整类型、数值限制和调用示例见[英文接口说明](integration.md)及 `index.d.mts`。

旧 USDC/USDT 配置和方向字符串继续可用，保留原来的单位、策略编码和 hash。旧格式的 `fwUSDC/fwUSDT` 是人类可读数量，新格式 `legs[].amount` 是原始单位，不可混用。

0.2.1 将“集中流动性 + 协议费”的组合指令顺序改为与官方高层 SDK 一致，该组合的 hash 会变。关闭 0.2.0 已有仓位时使用保存的仓位身份，不要用新版本重算旧 hash。官方 v1.0.2 可能跳过无法划转的协议费并继续成交，收入应核对实际到账与 `ProtocolFeeSkipped` 事件，不能只看配置费率。

## 做市与普通币成交

做市流程为：读取实际余额 → 按需包装 → 限额授权并建仓 → 读取仓位 → 关闭并撤销授权 → 按当前余额解包。原始存入金额不一定等于成交后的余额。若包装失败，之前成功的授权可能仍在，需要单独撤销；若仓位已经关闭，核对状态后只做撤销授权即可。

不同仓位可能共用同一钱包的 ERC-20 授权，新增或撤销授权会影响其他仓位；SDK 不会自动管理多仓位共享库存。试点应使用独立做市钱包。这里也没有自动价格管理、对冲或补充资金服务。

普通币完整路线保留如下业务逻辑，例如：

`USDC → fwUSDC → Aqua 兑换 → fwWETH → WETH`

`buildUnderlyingRoute` 生成的是执行步骤，不是一笔已经可广播的最终交易。实际执行方必须在同一笔 EVM 交易中完成包装、兑换、解包，按 SwapVM 的实际返回值处理到账与退款，保留原有零散余额并清理授权。任何步骤失败，整体回滚。它不能被拆成让普通用户分别签三笔交易来代替。

报价和成交由 Aqua FewToken 策略决定，库存来自做市钱包。吸引 1inch 普通币订单仍需要实际执行方接入这条组合路线，并在有价格优势时证明它被选中成交。

## 浏览器与本地测试

Node 默认入口和 `portable` 入口提供同样的构造结果，类型声明随包提供。`portable` 由宿主传入官方 SDK 实例，避免类身份不一致；官方依赖在浏览器中需要 `assert` 与 `process/browser.js` 兼容模块。`test/browser-build.mjs` 给出可复现的 esbuild 配置，历史版本在真实浏览器中验证过建仓、关闭和 WETH 包装；当前本地检查覆盖打包与两种入口的一致性，不据此声明全部浏览器钱包兼容。钱包连接、签名、交易确认和仓位 UI 仍由宿主应用负责，本仓库不包含前端页面。

本次测试覆盖九种资产的包装/解包，以及稳定币、波动资产、不同精度、集中流动性交易对的双向指定输入/指定输出成交。每笔检查实际到账、退款、授权残留、过期关闭和失败回滚。使用合成的本地做市库存和真实合约代码，不代表这些仓位已在主网上创建，也不代表每一种可能的代币组合均已单独验收。[最终测试记录](testing.md)。

本地运行 `npm test`、`npm run test:types`、`npm run build:browser-smoke`；主网 fork 另需 archive RPC 和 Anvil。设置 `RING_FORK_EVIDENCE_DIR=artifacts/local-rerun` 可保留已有报告。所有签名模拟、资金准备与成交只发生在工具启动的本地 Anvil 上。
