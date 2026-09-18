export const NOW = 1788801743n;
export const MAKER = '0x0000000000000000000000000000000020260909';
export const OPERATOR = '0x0beea0e1f3d79cb55633530e291336dab9a7d82d';
export const USER = '0x0000000000000000000000000000000020260910';
export const config = {
  chainId: 1,
  maker: MAKER,
  fwUSDC: '30',
  fwUSDT: '33',
  amplification: '300',
  feeBps: '0.1',
  protocolFeeBps: '0.025',
  protocolFeeReceiver: '0x8063d4faf54bf8c898dc6ddc689c76ab12b4614a',
  expiry: String(NOW + 86400n),
  salt: '2026090901',
};
export const request = {
  direction: 'USDC_USDT',
  exactIn: true,
  amount: '1000000',
  threshold: '1',
  taker: OPERATOR,
  receiver: OPERATOR,
  deadline: String(NOW + 3600n),
};
