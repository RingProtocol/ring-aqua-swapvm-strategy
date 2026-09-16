# 测试

[README](../README.zh.md) · [English](testing.md)

测试覆盖未签名 SDK 和本地以太坊主网 fork 的结算逻辑，不发送主网交易。当前包含 74 项离线测试、103 项 fork 用例；审核某个提交时应重新运行，不能只引用旧报告。

## 如何运行

需要 Node.js 22.13.1 或更新版本。

```sh
npm ci --ignore-scripts
npm run format:check
npm test
npm run test:types
npm run build:browser-smoke
npm run test:package
npm audit --audit-level=high

# 另需 PATH 中的 anvil，以及 ETH_RPC_URL（或 RPC_URL）中的 archive RPC。
npm run test:fork
```

通过本地秘密管理工具加载 RPC，CLI 不会自动读取 .env。不要提交凭据、私人 RPC 地址或包含它们的日志。

| 检查 | 验证内容 |
| --- | --- |
| 离线测试 | 参数、限额授权、过期、关闭、ETH 转换、两种入口一致性、旧版字节及官方 SDK 编码对照 |
| 类型和安装包 | 独立消费者安装实际 tarball，运行公开示例并编译 TypeScript，检查源码和许可 |
| 浏览器打包 | portable 入口和依赖兼容模块；不据此声明全部浏览器钱包可用 |
| fork | FewToken 直接成交及普通币完整兑换，双向指定输入/输出，实际余额、退款、回滚和权限 |
| 依赖检查 | 运行时已知的依赖漏洞；不等于代码安全审计 |

PR 和 main 的 CI 配置了格式、离线、类型、浏览器打包、安装包及依赖检查；不持有 RPC 凭据，不运行 fork。是否通过，以具体 PR 的检查结果为准。

## fork 验证范围

工具启动专用 `127.0.0.1:18569` Anvil，端口被占用就停止。上游 RPC 只提供链上数据；模拟账户、资金、授权、测试合约部署和兑换全部发生在本地，不需要真实私钥。

固定区块为 **25,926,940**，哈希记录在 [deployment.json](../config/deployment.json)。这保证合约行为可复现，不代表当前主网库存或价格。

覆盖九种 FewToken 的绑定、精度和包装/解包；有代表性的稳定币、波动资产及集中流动性交易对；ETH/WETH/fwWETH 各层转换；USDT 已有授权归零和无返回值行为；普通 ERC-20 UNI 转换。也检查过期、旧仓位身份、共享授权、调用者权限、未分配资产不可扣款，以及协议费跳过。

完整兑换检查实际到账、退款、已有余额保留和失败整体回滚。没有逐一测试九币的每个可能组合；测试执行器也没有实现完整的生产订单授权。

## 报告与固定样本

报告默认生成到被 Git 忽略的 `artifacts/fork/`。需要保留另一轮结果时：

```sh
RING_FORK_EVIDENCE_DIR=artifacts/local-rerun npm run test:fork
```

完成的 `fork-results.json` 记录区块、源码/lockfile 哈希、用例和时间。失败写入 `fork-attempt.json`，不覆盖上一次完整报告；引用前检查时间与哈希，其他辅助文件可能来自较新的失败尝试。

固定回归数据保存在 [test/fixtures](../test/fixtures/README.md)，测试不依赖日期报告目录。运行日志留在本地，审核需要时单独提供，不再反复提交到源码仓库。

本地通过仍不能证明官方选币、收录、执行方采用或真实前端订单。生产使用还需执行器适配、当前赎回能力与费用核查、许可确认及安全审查；本 SDK 不含自动调价、对冲或补充库存服务。
