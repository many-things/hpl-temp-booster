import {
  Account,
  Address,
  Chain,
  Transport,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, optimismSepolia, sepolia } from 'viem/chains';

import { polygonZkCardonaTestnet } from './chains/polygon-zk-evm';
import { ARB_SEP_URL, OP_SEP_URL, PK, PLG_SEP_URL, SEP_URL } from './env';

export const account = privateKeyToAccount(PK);

export const makeProvider = (
  chain: Chain,
  transport: Transport,
  confirmations: number = 0,
  walletAccount: Account = account,
) => ({
  query: createPublicClient({
    chain,
    transport,
  }),
  execute: createWalletClient({
    account: walletAccount,
    chain,
    transport,
  }),
  confirmations,
});

export const providers: {
  [domain: number]: ReturnType<typeof makeProvider> & {
    mailbox: Address;
    mailboxDeployedAt: number;
    hyperlaneId: string;
    batchSize: {
      query: number;
      execute: number;
    };
  };
} = {
  2442: {
    ...makeProvider(
      polygonZkCardonaTestnet,
      http(PLG_SEP_URL, { batch: true, timeout: 100_000 }),
    ),
    mailbox: '0xBA42Ee5864884C77a683E1dda390c6f6aE144167',
    mailboxDeployedAt: 629_016,
    hyperlaneId: 'polygonzkevmcardona',
    batchSize: {
      query: 100,
      execute: 20,
    },
  },
  421614: {
    ...makeProvider(
      arbitrumSepolia,
      http(ARB_SEP_URL, { batch: true, timeout: 100_000 }),
    ),
    mailbox: '0xBA42Ee5864884C77a683E1dda390c6f6aE144167',
    mailboxDeployedAt: 5_305_283,
    hyperlaneId: 'arbitrumsepolia',
    batchSize: {
      query: 50,
      execute: 20,
    },
  },
  11155111: {
    ...makeProvider(sepolia, http(SEP_URL, { batch: true, timeout: 100_000 })),
    mailbox: '0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766',
    mailboxDeployedAt: 4_558_491,
    hyperlaneId: 'sepolia',
    batchSize: {
      query: 50,
      execute: 50,
    },
  },
  11155420: {
    ...makeProvider(
      optimismSepolia,
      http(OP_SEP_URL, { batch: true, timeout: 100_000 }),
    ),
    mailbox: '0xF4761a6e174501A93c66BBfEe7090268eF0b8C96',
    mailboxDeployedAt: 8_171_532,
    hyperlaneId: 'optimismsepolia',
    batchSize: {
      query: 50,
      execute: 20,
    },
  },
};
