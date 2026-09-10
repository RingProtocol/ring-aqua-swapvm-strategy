# 测试记录

## 接口扩展：2026-09-11

扩展后的 **45 项离线测试、38 项主网 fork 测试全部通过**，包含原有回归。格式检查通过，`npm audit --audit-level=high` 报告 0 项漏洞。新增测试实际执行 SDK 包装和解包计划、双向及两种金额模式的完整兑换，并核对退款、原有余额保留、失败回滚和过期仓位关闭。[本轮 fork 报告](evidence/integration-2026-09-11/fork-results.json)记录当前源文件及测试执行器哈希；[离线结果](evidence/integration-2026-09-11/offline-tests.txt)一并保存。真实合作方运行环境适配与前端成交仍未验证。

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
