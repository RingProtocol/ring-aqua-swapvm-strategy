# Ring Aqua SwapVM strategy

[English](README.md) · [接口](docs/integration.zh.md) · [官方源码对照](docs/compatibility.md) · [测试](docs/testing.zh.md)

这个 SDK 用于把做市钱包里的 FewToken 配置为 Aqua 仓位。它通过 1inch 官方 SDK 生成限额授权、建仓、关闭、包装和解包的未签名交易，也为执行方生成普通币完整兑换的操作步骤。

采用官方文档的 [Path B](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp)：组合现有 SwapVM 指令，在已部署的路由合约上登记仓位。当前定价功能不需要新增生产合约或 opcode。这个独立仓库供 1inch 审核，不代表已获官方认可。

## 支持范围

| 部分 | 当前能力 |
| --- | --- |
| 链与版本 | 以太坊，AquaSwapVMRouter v1.0.2；固定 SDK 版本及部署代码哈希 |
| FewToken | 对应 USDC、USDT、DAI、WETH、WBTC、cbBTC、weETH、UNI、wstETH |
| 做市操作 | 限额授权、建仓、关闭并撤销授权、ERC-20 与 FewToken 互换 |
| ETH | 独立的 ETH/WETH 转换；需要 fwWETH 时再做 WETH/fwWETH 转换 |
| 价格规则 | 官方恒定乘积、集中流动性和 pegged 指令；显式设置费率和有效期 |
| 接入工具 | Node/浏览器宿主入口、类型声明、只读检查、完整兑换步骤 |
| 不包含 | 钱包页面、签名广播、生产执行器、自动调价或库存管理 |

九币[目录](config/assets.json)只限制本 SDK 可构造的资产，不是链上白名单，也不是 1inch 官方上币名单。币留在做市钱包中；链上使用权限由钱包授权和具体仓位共同约束。多个仓位可能共用余额及授权。

## 本地运行

需要 Node.js 22.13.1 或更新版本。示例和离线检查不需要 API key、RPC、钱包或资金。

```sh
git clone https://github.com/RingProtocol/ring-aqua-swapvm-strategy.git
cd ring-aqua-swapvm-strategy
npm ci --ignore-scripts
npm run example:plans
npm test
npm run test:types
npm run test:package
```

[完整示例](examples/build-plans.mjs)通过公开接口生成 USDC/WETH 包装、建仓、报价/成交调用、兑换步骤、关闭和解包计划。示例使用虚拟参数，不得直接广播。安装包测试会在独立目录安装实际 tarball，运行示例并检查类型，不会发布 npm 包。`private: true` 防止误发 npm，不限制 GitHub 公开源码。

主网 fork 测试另需 [Anvil](https://getfoundry.sh/anvil/overview) 和环境变量 `ETH_RPC_URL` 中的 archive RPC，运行 `npm run test:fork`。所有交易只在本地 Anvil 执行，生成报告保存在被 Git 忽略的 `artifacts/fork/`。详见[测试说明](docs/testing.zh.md)、[接口](docs/integration.zh.md)和 [CLI](docs/cli.md)。

## 请 1inch 审核什么

我们希望在官方 Aqua 页面选择 FewToken，创建并管理仓位；普通币订单在完整路线有价格优势时，可以使用这些仓位：

`USDC → fwUSDC → Aqua 兑换 → fwUSDT → USDT`

本地 fork 已验证这条组合及反向成交，但还没有证明官方收录、自动选路或真实前端成交。请 review 现有代码，指出官方选币、仓位参数，以及执行方包装和结算还需要我们补什么。优先复用官方页面，不预设 Ring 必须另做页面；实现目标也不要求对方完整采用本 SDK。

完整路线输出是待执行方适配的操作步骤，不是可直接上线的最终交易。`test/` 内两份 Solidity 合约只用于测试，不能处理生产订单。真实试点前还要检查余额、即时赎回能力、费用和 gas；成交成功或配置了费率，都不等于项目已经获得收益。

## 目录与许可

- 根目录 `.mjs` / `.d.mts`：SDK、CLI、类型。
- `config/`：资产与部署配置、wrapper 元数据及示例参数。
- `examples/`：可运行的未签名示例。
- `test/`：离线、fork、安装包测试及固定回归样本。
- `docs/`：接口、CLI、兼容性、测试和[设计决定](docs/design.md)。

代码未经安全审计。使用前阅读 [SECURITY.md](SECURITY.md) 和[许可范围](LICENSE.md)。Ring 独立代码使用 MIT；上游 SDK 和生成的程序继续适用上游条款，不能整体宣称为无限制商用 MIT 项目。

Powered by SwapVM — © Degensoft Ltd 2025. Powered by Aqua — © Degensoft Ltd 2025.
