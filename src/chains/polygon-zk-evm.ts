import { defineChain } from 'viem';

import { MULTICALL } from '../constants';

export const polygonZkCardonaTestnet = defineChain({
  id: 2442,
  network: 'polygon-zkevm-cardona-testnet',
  name: 'Polygon zkEVM Cardona Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.cardona.zkevm-rpc.com'],
    },
    public: {
      http: ['https://rpc.cardona.zkevm-rpc.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'PolygonScan',
      url: 'https://cardona-zkevm.polygonscan.com/',
    },
  },
  contracts: {
    multicall3: {
      address: MULTICALL,
    },
  },
});
