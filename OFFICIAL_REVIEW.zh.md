# 官方接法核对与本地验收

2026-09-11 · 0.2.1 · 仅本地，不推送、不发布、不联系官方

**当前方向符合 1inch 官方支持的接法：用现有 SwapVM 指令创建 Aqua FewToken 策略。** 不需要为现有定价功能新增 opcode 或部署定价合约。此次逐项核对官方文档、SDK 和部署版本源码，修正了一处组合指令顺序差异；本地验收结果见[测试记录](VALIDATION.zh.md)。

## 核对结果

| 官方要求或行为 | Ring 当前实现与验收 |
| --- | --- |
| 优先使用能表达需求的现有指令 | 使用官方 `AquaProgramBuilder`，支持常数乘积、集中流动性、pegged 曲线；属于文档中的 Path B |
| SDK 与部署路由的指令表必须匹配 | 锁定 SwapVM SDK 0.4.2、Aqua SDK 0.3.2 和部署路由 v1.0.2；从该版本 Solidity 提取实际编号，不照抄 SDK 注释中的序号或新主分支 |
| 做市授权给 Aqua，成交输入授权给路由 | 两种授权对象分开，使用明确额度；包装需要的原币授权先清零，结束后清理 |
| 仓位由 `ship` 记录，事件包含完整策略 | 使用官方事件解码器还原仓位和订单，核对链上 hash、报价、成交事件及关闭事件 |
| 关闭必须由做市钱包提供完整代币列表 | 测试部分关闭、其他钱包关闭、重复建仓和已关闭身份重用被拒绝；新仓位使用新 salt |
| 成交需要指定金额模式、价格限制和时间限制 | 两种金额模式都有非零限价与有效期；保留 Ring 额外的策略到期指令，不使用原生 ETH 解包标志 |
| 同钱包多仓位共享真实资金和 ERC-20 授权 | 增加实际竞争及撤销授权测试；一仓有报价不代表它仍能成交，试点仍使用独立做市钱包 |
| 官方协议费是尽力收取，并非强制到账 | 增加 `ProtocolFeeSkipped` 测试；预检仍对费用储备不足报出限制，收入统计不能只根据配置费率计算 |

## 本次修正及升级注意

0.2.0 的“集中流动性 + 协议费”组合先执行集中流动性指令，再执行协议费指令；官方高层 SDK 的顺序相反。此前该组合的 fork 成交已通过，但字节对照测试没有覆盖组合情况。0.2.1 按官方顺序改为先协议费、再集中流动性，并增加回归。此发现不等于此前成交失败或发生资金损失。[修正前结果](evidence/official-review-2026-09-11/conformance-before-fix.json)。

**该组合在相同配置下的策略 hash 会改变。** 已创建的仓位应使用当时保存的 `maker + strategyHash + tokens` 关闭，不能用新版本重新生成旧 hash。该关闭方式已有回归；旧 USDC/USDT 配置的字节和 hash 未改变。没有修改已经发布的链上策略。

协议费方面，v1.0.2 在费用无法划转时可发出 `ProtocolFeeSkipped` 并继续成交，未付出的费用留在做市方。这是官方合约行为，不能把“报价、成交成功”写成“Ring 已收到协议费”。SDK 没有常驻收入监控服务，生产接入方需要读取成交回执、该事件和实际到账。

## 哪些仍需外部验证

本仓库是策略和交易构造工具包，没有完整前端、生产执行器、自动调价或补资金服务。原币包装 → FewToken Aqua 成交 → 原币解包的步骤仍需执行方在同一笔交易中实现。新 Aqua 仓位不自动调用已有 Ring Swap v2 池。

官方文档把做市建仓与订单执行分开：建仓可以自行完成，正式成交执行方有资格要求，仓位发现与订单选路还有独立的服务逻辑。本地 fork 可以验收合约调用和资金变化，不能验收托管发现服务或 1inch 前端真实流量。价格优势须在完整路线及执行成本上比较。

**本轮不需要 1inch API key。** 官方 SDK、GitHub、链上只读查询及本地 fork 已覆盖这轮任务。以后验证 1inch 托管报价或发现接口时才可能需要；API key 本身不等于执行资格或流量接入。不要把 key 写入代码、证据或文档。

开源发布、生产运行和联系官方分别决定。保留上游许可与署名，没有把官方代码或生成策略改成无条件 MIT 商用许可。本轮只准备本地可审查结果。

## GitHub 对照与仓库交付

**并非只剩联系 1inch。当前 repo 适合作为接入 SDK 交给技术方评审，但还不是上线即能获得订单的产品。** 本次不新增资金需求，不动主网资金。2026-09-11 通过 GitHub 身份验证查询确认：仓库仍为 private，远端只有 `main` 的旧基线；新版接口和本轮整理均在本地，尚未推送。

| 对照对象 | 可以借鉴什么 | 不照搬什么 |
| --- | --- | --- |
| [1inch 官方 SDK](https://github.com/1inch/sdks/tree/364e7155167957e6a24320c7beb90539e06c91eb/typescript)与 Path B 文档 | 版本固定、标准 ABI、程序与事件编码 | 没必要为了目录相同改成官方的多包仓库 |
| [官方 SDK 示例库](https://github.com/1inch/sdks-examples/tree/d87179cf8cf8518de1fe30dcd5a548fa636cfd05) | 安装后能独立运行的调用示例 | 该库主要是其他 1inch SDK 示例，不代表已接受我们的 Aqua 接口 |
| [官方 SwapVM 模板](https://github.com/1inch/swap-vm-template/tree/e9f8def43c7e8fbe5d8453df2e0a83e2be17c38b) | 源码、测试与操作说明分开 | 其自建合约和部署流程不适合直接套到已部署的 Path B 路由 |
| [Barker 公开实验仓库](https://github.com/barkermoney/barker-alm-engine/tree/7e208c9f2a8c60c51459122d1c6582d0aba4e0be) | 独立检验报价、可结算额度及资金变化 | README 说明旧 Aqua 活动代码在私有仓库；公开部分是新的收益型做市实验，不能当作活动页面完整实现或生产采用证明 |

Barker 的[开发反馈](https://github.com/barkermoney/barker-alm-engine/blob/7e208c9f2a8c60c51459122d1c6582d0aba4e0be/FEEDBACK-1INCH.md)也记录了部署 ABI 与主分支不同的问题。其早期实验仅压低输出储备，测试通过但仍改变了价格，后来才修正。因此保留独立的官方字节对照及真实资金变化验收，不以测试数量代替审查。其 Aqua 说明中的托管表述也与[官方资金模型](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder)冲突：建仓只记虚拟额度，币仍在 maker 钱包；我们以官方合约和实测为准，不复制该判断或代码。

本轮补齐安装包文件清单、USDC/WETH 可运行示例、独立项目安装及类型验证、CI 检查和安全报告说明。安装包文件从 **82 个减为 33 个**，不再带入测试合约和历史证据；完整 Git 仓库保留可复核记录。没有删除历史失败记录，也没有新增生产合约。最初示例把整个资产目录对象传给严格的 token 参数校验而失败，现已按接口提取允许字段，并让真实运行成为验收条件。

公开前仍需落实有人维护的私下安全报告入口；查询该 GitHub 功能返回 404，目前不能确认可用。仅增加 `SECURITY.md` 不等于已经启用入口。仓库内容整理、公开、npm 发布、审计及生产启用是不同状态；本轮没有发布。

## 接下来谁做什么

| 工作 | 当前有什么 | 下一步与完成标准 | 是否必须等 1inch |
| --- | --- | --- | --- |
| 合作方技术试用 | SDK、类型、示例、版本核验、本地 fork | 独立项目复现；确认其输入输出格式，只补应用适配层 | 本地交付可以自己做；接口接受需对方确认 |
| 仓位与收入监控 | 单次预检及事件解码测试 | 常驻读取余额、授权、可成交额度、关闭状态及实际费用到账 | 不需要，可继续独立开发 |
| 价格竞争力验证 | 完整路线执行和 gas 数据 | 同区块、金额及限价比较完整路线到账与成本；找出有优势的规模区间，不能把补贴当利润 | 本地比较可先做；托管报价可能用 API key |
| 前端钱包操作 | 未签名交易计划与可移植接口核心 | 余额/仓位显示、逐笔确认、失败恢复、撤销授权 | 我们或前端合作方可做 |
| 普通币生产执行 | 原子兑换步骤和仅测试用执行器 | 选定 Resolver 执行环境及用户授权接口，由我们写适配，双方复现与安全审查 | 需要执行方接口，不代表代码都让他们写 |
| 主网发现与流量 | 尚无本轮真实仓位/订单证据 | 经明确资金授权发布小仓位，查官方收录；合格 Resolver 在有价格优势时实际采用，完成普通币前端订单 | 建仓本身不需先获官方批准；托管选路、执行资格和最终联调需 1inch/Resolver |

优先把**仓位/实际费用监控与完整路线价格比较**做成可复用的只读验收工具，同步准备执行适配接口清单。当前不为形式上的合作新增自定义 opcode 或重写定价合约。官方已提供现有指令组合入口，常规 FewToken 策略不以向上游提交 PR 为建仓前提；通用修复、文档改善或新增协议能力才需要讨论上游贡献。

联合验收必须明确前端订单模式。[官方权限文档](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder)区分 Resolver 路由与 Classic Swap，不能用 Classic 报价有无结果替代 Aqua 流量验收。最终要求是用户支付原币、执行方实际经过 FewToken 仓位、用户收到目标原币，且回执与金额对应这条路线。API 返回成功或 fork 成功不能单独替代这一步。

## 来源与复现

- [官方 AquaApp 接法](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp)：现有指令组合及自建合约的区别。
- [官方 SDK 文档](https://business.1inch.com/portal/documentation/aqua/reference/sdk-overview)与 [SDK 源码](https://github.com/1inch/sdks/tree/364e7155167957e6a24320c7beb90539e06c91eb/typescript)：编码、调用和事件；文档部分版本示例较旧，以锁定包、部署版本及实际验证为准。
- [官方部署地址与版本说明](https://business.1inch.com/portal/documentation/aqua/reference/verified-contract-addresses)、[v1.0.2 指令表](https://github.com/1inch/swap-vm/blob/32c687c2b73101fc26549e48fa1ff8a4d73afbac/src/opcodes/AquaOpcodes.sol)和[费用源码](https://github.com/1inch/swap-vm/blob/32c687c2b73101fc26549e48fa1ff8a4d73afbac/src/instructions/Fee.sol)。
- [Aqua 注册与关闭源码](https://github.com/1inch/aqua/blob/9c5c42e5840e8741fba3597c48456c9510212b66/src/Aqua.sol)、[官方权限与选路说明](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder)。
- [OpenZeppelin 授权处理](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20-forceApprove-contract-IERC20-address-uint256-)与 [Uniswap 指定输出退款示例](https://developers.uniswap.org/docs/protocols/v3/guides/swapping/single-hop-swapping)：保留清零授权、金额限制及未使用输入退款；未复制其生产合约。

[官方源码清单](test/official-reference.json)记录 12 个文件的提交、路径和 SHA-256。[最新区块只读核对](evidence/official-review-2026-09-11/latest-deployment.json)验证三项官方部署和九种资产绑定，不代表当前赎回储备、市场价格或前端收录。运行方式见 [README](README.zh.md)，完整历史与本轮证据均保留。
