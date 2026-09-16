# 测试记录

## 文档范围整理：2026-09-16

当前材料只介绍 FewToken 钱包做市、请 1inch review 代码，以及是否需要 Ring 前端 Aqua 页面。本轮没有修改运行代码、配置、类型、测试或依赖。[整理验收](evidence/scope-cleanup-2026-09-16.json)记录离线与实际安装包复验，以及历史 fork 源文件哈希比对。文档变更没有重跑主网 fork，下方历史报告保留原日期及当时的安装包校验值。

## 当前本地 0.2.1：安装交付复验，2026-09-11

本轮未修改策略及结算的运行代码，补充安装包范围、实际运行示例与合作方安装验收。[最新 fork 报告](evidence/repository-review-2026-09-11/fork-results.json)完成于北京时间 **2026-09-11 11:49:30**：**95 项通过，34 个源文件哈希和 lockfile 与本轮文件一致**。下方早先报告作为历史快照保留，不代表当前所有文件的哈希。

| 检查 | 结果 |
| --- | --- |
| 离线回归 | [69 项通过，无跳过](evidence/repository-review-2026-09-11/offline-tests.txt) |
| 实际安装包 | [Node 22.18.0](evidence/repository-review-2026-09-11/package-node-22.18.txt)及 [22.13.1](evidence/repository-review-2026-09-11/package-node-22.13.txt) 均通过：独立项目仅安装生产依赖、实际导出入口、USDC/WETH 示例、外部 TypeScript 调用 |
| 包内容 | 从 82 个文件减为 33 个，排除测试合约、历史证据、本地配置；安装后源码及许可内容与原文件逐项核对 |
| 类型、构建与格式 | 类型及格式通过，浏览器构建通过；运行代码未变，本轮没有重复真实浏览器执行，之前浏览器证据单独保留 |
| 依赖漏洞 | [报告 0 项](evidence/repository-review-2026-09-11/audit.json)，不等于安全审计 |
| 远端与发布 | GitHub 仓库仍 private，远端 main 为 e94ae6a；当前分支未推送。CI 配置已更新，不能称为本次远端 CI 已通过 |

初版示例因传入整个资产目录对象、包含 token 参数不允许的字段而失败。可运行示例和类型检查示例均已改为明确提取 address/decimals，没有放宽运行时校验。没有使用 API key、签名、主网写入或对外联系。生产执行与官方前端流量仍未验证。仓库交付判断及后续分工见[核对说明](OFFICIAL_REVIEW.zh.md#github-对照与仓库交付)。

## 较早的 0.2.1：官方源码复核，2026-09-11，提交 97ef4ea

**69 项离线测试、95 项主网 fork 测试全部通过**，包含原有回归。最终 fork 完成于北京时间 2026-09-11 11:26:22；[本轮报告](evidence/official-review-2026-09-11/fork-results.json)中的 31 个源文件哈希及 lockfile 哈希与测试代码一致。本地提交不代表发布或官方验收。[官方接法核对与升级注意](OFFICIAL_REVIEW.zh.md)。

| 检查 | 本轮结果 |
| --- | --- |
| 离线测试 | [69 passed，无跳过](evidence/official-review-2026-09-11/offline-tests.txt)；新增部署指令表、组合协议费顺序、官方参数解码和旧仓位身份关闭回归 |
| 主网 fork | [95 passed](evidence/official-review-2026-09-11/fork-results.json)；新增官方事件还原、重复身份、部分关闭、钱包身份、共享授权与跳过协议费等 7 项 |
| 真实浏览器 | [通过](evidence/official-review-2026-09-11/browser.json)；未签名建仓、关闭、包装计划，hash 与 Node 相同 |
| 最低 Node 版本 | [22.13.1 上 69 项离线测试通过](evidence/official-review-2026-09-11/node-22.13-tests.txt) |
| 全新安装及 TypeScript | [通过](evidence/official-review-2026-09-11/clean-install.json)；锁定安装、离线测试、类型检查和浏览器构建 |
| 格式及依赖 | 格式通过；本轮 `npm audit --audit-level=high` 报告 0 项漏洞，不等于安全审计 |
| 最新区块只读核对 | [通过](evidence/official-review-2026-09-11/latest-deployment.json)；三项官方部署、路由版本和九种 FewToken 绑定/精度一致 |

修正前的新增对照测试为 4 项通过、2 项失败，均指向同一处组合指令顺序差异；[失败摘要](evidence/official-review-2026-09-11/conformance-before-fix.json)与对应基准提交保留。修正后新增的 7 项离线测试全部通过。此前该组合成交测试通过，不能将这次编码对照差异描述为已发生交易失败。

本次也实测了官方 `ProtocolFeeSkipped`：费用未收取时，成交仍可能成功。预检保留费用储备不足的限制，收入必须核对真实到账。没有使用 1inch API key、发送主网交易、签名、部署生产合约、推送代码或联系官方。最新区块只读检查不验证赎回储备；fork 仍使用下文历史区块和本地合成库存。托管发现、执行方接受与真实前端流量仍未验证。

## 历史版本 0.2.0：2026-09-11，提交 d4ec1c8

当时 **62 项离线测试、88 项主网 fork 测试全部通过**。fork 完成于北京时间 2026-09-11 01:28:56；[报告](evidence/standard-interface-2026-09-11/fork-results.json)中的 27 个源文件 SHA-256 和 lockfile 哈希属于该版本。以下均为历史证据，不代表当前源码哈希或测试数量。

| 检查 | 结果与范围 |
| --- | --- |
| 离线测试 | [62 passed，无跳过](evidence/standard-interface-2026-09-11/offline-tests.txt)；覆盖旧配置兼容、官方指令编码、多资产参数、授权与关闭计划 |
| 主网 fork | [88 passed](evidence/standard-interface-2026-09-11/fork-results.json)；原有 38 项加多资产 50 项 |
| TypeScript | 消费方导入、构造调用和错误输入类型检查通过 |
| 真实浏览器 | [通过](evidence/standard-interface-2026-09-11/browser.json)；使用官方 SDK 构造 USDC/WETH 建仓、关闭、WETH 包装计划，策略 hash 与 Node 一致 |
| 最低 Node 版本 | [22.13.1 上 62 项离线测试通过](evidence/standard-interface-2026-09-11/node-22.13-tests.txt) |
| 全新目录安装 | [通过](evidence/standard-interface-2026-09-11/clean-install.json)；锁定依赖安装、离线测试、类型检查、浏览器打包均成功 |

多资产测试核验九种 FewToken 的真实合约绑定与精度，执行九种资产的包装/解包。代表性市场覆盖 USDC/WETH、WBTC/USDT、DAI/USDC、cbBTC/WBTC、weETH/WETH、UNI/WETH、wstETH/WETH，以及两组集中流动性配置。每组执行双向指定输入和指定输出的直接 FewToken 成交与原币完整成交；核对实际到账、退款、原有余额保留、授权清理、到期后关闭。另验证单边集中流动性预检与成交，以及滑点超限、解包失败、做市授权撤销时的原子回滚。

这批测试沿用下文的历史主网基础区块，**在本地补充合成库存并新包装资产**。它证明这些代码路径能执行，不证明当前主网赎回储备充足，不覆盖所有可能的代币组合，也不代表下文旧 v4 wrapper 报价失败已修复。原生 ETH 不在范围内，仅支持 ERC-20 WETH。

浏览器验证仅包含未签名计划构造，没有连接钱包或 RPC。CI 已配置离线测试、类型、浏览器构建、格式和依赖检查，但本次没有推送，也没有宣称 GitHub CI 已运行。实际合作方接口验收、生产执行器、安全审查与 1inch 普通币前端成交仍未验证。

## 历史接口扩展：2026-09-11，提交 cbe4970

当时的 **45 项离线测试、38 项主网 fork 测试全部通过**，包含原有回归。格式检查通过，`npm audit --audit-level=high` 报告 0 项漏洞。新增测试实际执行 SDK 包装和解包计划、双向及两种金额模式的完整兑换，并核对退款、原有余额保留、失败回滚和过期仓位关闭。[历史 fork 报告](evidence/integration-2026-09-11/fork-results.json)记录该版本源文件及测试执行器哈希；[离线结果](evidence/integration-2026-09-11/offline-tests.txt)一并保存。

## 基线：2026-09-10，提交 e94ae6a

独立仓库在基线提交跑完 **34 项离线测试、27 项主网 fork 测试，全部通过**。以下旧证据为该提交保留，其哈希不代表后续改动后的源文件。这证明本地策略编码和完整交易可以执行，不能证明 1inch 前端已经接入或生产资金已经安全。

Powered by SwapVM — © Degensoft Ltd 2025.

Powered by Aqua — © Degensoft Ltd 2025. [许可范围](LICENSE.md)。

## 证据与复现

- Node.js 22.18.0；SwapVM SDK 0.4.2；Aqua SDK 0.3.2；测试合约编译器 solc 0.8.30。
- 主网基础区块 25,926,940，hash 为 `0x4eef63526f5f907c0d0e0ca8e7c133cde7fcbc89f272e161e467b4fc9737715a`。这是历史快照，不是当前主网报价。
- 建仓、授权、资金模拟和成交都发生在本地 fork，无主网交易、真实钱包签名或生产合约部署。
- 本次完成时间：`2026-09-10T03:18:15.426Z`。[完整报告](evidence/fork-results.json)包含每项结果、基础区块、代码及 lockfile 的 SHA-256；运行后已逐项核对哈希。
- [未签名测试仓位](evidence/unsigned-fixture.json)、[预检结果](evidence/preflight.json)、[wrapper 报价向量](evidence/wrapper-source-vectors.json)一起保存。测试地址、salt、历史到期时间不能直接用于生产。

| 检查 | 结果 |
| --- | --- |
| `npm test` | 34 passed，无跳过 |
| `npm run test:fork` | 27 passed |
| `npm run format:check` | passed |
| `npm audit --audit-level=high` | 本次检查 0 vulnerabilities |
| 官方 SDK 指令兼容 | 相同部分字节一致，增加强制到期指令 |
| 完整 USDC ↔ USDT 路径 | 包装、Aqua 兑换、解包；双向 exact-in / exact-out 均成功 |
| 实际资金核对 | 1、5、25 单位档位及余额、virtual balance、协议费、授权消耗核对通过 |
| 失败保护 | 凭证缺失、错误 wrapper、余额或授权不足、超库存、过期、收紧 1 wei 限价均被拒绝或识别 |
| 关闭 | dock 并撤销授权后不可继续使用，maker 余额未被转出 |
| RPC / CLI | 禁止写 RPC，拒绝错误响应及过期快照，不覆盖已有输出文件 |

复现命令见 [README.zh.md](README.zh.md)。CI 运行离线检查；fork 需要本地提供 archive RPC 和 Anvil。测试与依赖检查不能代替外部安全审计。

## 本地到账与 gas

参数为 30 fwUSDC / 33 fwUSDT、A=300、maker fee 0.1 bps、protocol fee 0.025 bps。每项恢复同一个已建仓的本地快照。输入和到账按代币单位表示。

| 完整 exact-in 路径 | 输入 | 到账 | 本地 gas |
| --- | --- | --- | --- |
| USDC → USDT | 1 | 1.099956 | 350,044 |
| USDT → USDC | 1 | 0.909057 | 348,179 |
| USDC → USDT | 5 | 5.499162 | 350,044 |
| USDC → USDT | 25 | 27.473611 | 350,083 |
| USDT → USDC | 5 | 4.544821 | 348,179 |
| USDT → USDC | 25 | 22.708861 | 348,217 |

这是测试执行器的 gas，不是实际 1inch 订单总 gas。优惠由 maker 库存承担，多给交易者的资产不能算作协议利润。本次未对比同期生产报价，也未证明长期价格优势。

## 九个 wrapper

九项 canonical 绑定、decimals 和 PoolKey 校验通过，36 个报价向量中 30 个成功。USDC 和 USDT 的双向 exact-in / exact-out 均成功。

weETH、UNI、wstETH 的解包方向在该快照返回 `read_failed` 和 null；未写成零报价，也未认定都是余额不足。这些方向不属于本次 USDC/USDT 完整路线的验收范围，需分别核对赎回和执行可用性。

## 仍需完成

尚无外部审计、主网资金仓位、生产执行器部署或真实前端成交。需要 1inch 确认接口、评审方式和 Resolver 试点，再证明普通币订单在完整路线价格有竞争力时会选中并实际成交。仅建 Aqua 仓位、FewToken 报价成功或本地测试通过都不能替代该验收。
