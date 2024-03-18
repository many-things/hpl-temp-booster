import { Mailbox__factory } from '@hyperlane-xyz/core';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path, { basename, extname } from 'path';
import {
  Address,
  Hex,
  ReadContractParameters,
  concat,
  encodeFunctionData,
  pad,
  toHex,
  zeroAddress,
} from 'viem';

import {
  DEFAULT_GAS_ADJUSTMENT,
  DEFAULT_GAS_PER_FLUSH_CALL,
  DOMAIN_SEPOLIA,
} from './constants';
import { HPL_DATA_PATH, TARGET_DOMAINS, YAME_DATA_PATH } from './env';
import { providers } from './provider';
import { retryMulticall, toChunk } from './utils';

type Save = {
  lastProcessed: Record<number, number>;
};

type Yame = {
  sender: Address;
  destination: number;
  recipient: Hex;
  message: Hex;
  messageId: Hex;
  timestamp: number;
};

type Checkpoint = {
  value: {
    checkpoint: {
      merkle_tree_hook_address: Hex;
      mailbox_domain: number;
      root: Hex;
      index: number;
    };
    message_id: Hex;
  };
  signature: {
    r: Hex;
    s: Hex;
    v: number;
  };
  serialized_signature: Hex;
};

function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const pathToNum = (path: string): number => {
  const fileName = basename(path);
  return parseInt(
    fileName.replace(extname(fileName), '').replace('_with_id', ''),
  );
};

const L1L2_RET_PATH = path.join(YAME_DATA_PATH, 'l1l2_ret.json');
const L1L2_SAVE_PATH = path.join(YAME_DATA_PATH, 'l1l2_save.json');
const L2L1_RET_PATH = path.join(YAME_DATA_PATH, 'l2l1_ret.json');
const L2L1_SAVE_PATH = path.join(YAME_DATA_PATH, 'l2l1_save.json');

const MAILBOX_PATH = (hyperlaneId: string) =>
  path.join(YAME_DATA_PATH, hyperlaneId);

const DISPATCH_LOG = (messageId: string, hyperlaneId: string) =>
  path.join(MAILBOX_PATH(hyperlaneId), messageId + '.json');
const CHECKPOINT_PATH = (hyperlaneId: string) =>
  path.join(HPL_DATA_PATH, `${hyperlaneId}/checkpoint`);

function processor(
  domain: number,
  hash: Hex,
): ReadContractParameters<typeof Mailbox__factory.abi, 'processor'> {
  return {
    abi: Mailbox__factory.abi,
    address: providers[domain].mailbox,
    functionName: 'processor',
    args: [hash],
  };
}

const toMetadata = (cp: Checkpoint) =>
  concat([
    '0x00000010', // fixed
    '0x00000095', // fixed
    '0x0000000000000000', // pad
    cp.value.checkpoint.merkle_tree_hook_address, // merkle tree hook address
    cp.value.checkpoint.root, // merkle root
    pad(toHex(cp.value.checkpoint.index), { size: 4 }), // merkle index
    cp.serialized_signature,
  ]);

function loadCheckpoints(
  checkpointPath: string,
  provider: (typeof providers)[number],
  startFrom: number = 0,
) {
  return (
    readdirSync(checkpointPath)
      // list all checkpoint files
      .map((v) => path.join(checkpointPath, v))
      .filter((v) => v.endsWith('with_id.json'))
      // merge with checkpoint data
      .map((v) => ({ path: v, num: pathToNum(v) }))
      .filter((v) => startFrom <= v.num)
      .map((v) => ({ ...v, ...readJSON<Checkpoint>(v.path) }))
      // merge with yame
      .map((v) => ({
        ...v,
        yame: DISPATCH_LOG(v.value.message_id, provider.hyperlaneId),
      }))
      .filter((v) => existsSync(v.yame))
      .map((v) => ({ ...v, yame: readJSON<Yame>(v.yame) }))
      .sort((a, b) => (a.num < b.num ? -1 : 1))
  );
}

export async function flushL1L2() {
  const localProvider = providers[DOMAIN_SEPOLIA];
  const checkpointPath = CHECKPOINT_PATH(localProvider.hyperlaneId);

  let saved: Save = existsSync(L1L2_SAVE_PATH)
    ? JSON.parse(readFileSync(L1L2_SAVE_PATH, 'utf-8'))
    : { lastProcessed: {} };
  console.log('load saved context.', `path=${L1L2_SAVE_PATH}`);
  Object.entries(saved.lastProcessed).forEach(([k, v]) =>
    console.log(`[${k}]`, v),
  );

  const checkpoints = loadCheckpoints(
    checkpointPath,
    localProvider,
    Object.values(saved.lastProcessed).length > 0
      ? Math.max(...Object.values(saved.lastProcessed))
      : undefined,
  ).filter((v) => TARGET_DOMAINS.includes(v.yame.destination));
  const filterProcessed =
    (k: string | number) => (i: (typeof checkpoints)[number]) =>
      saved.lastProcessed[Number(k)] < i.num;

  const groupedByDestDomain = checkpoints.reduce(
    (acc, v) => ({
      ...acc,
      [v.yame.destination]: acc[v.yame.destination]
        ? [...acc[v.yame.destination], v]
        : [v],
    }),
    {} as Record<number, typeof checkpoints>,
  );
  console.log('groupped', `[${Object.keys(groupedByDestDomain).join(',')}]`);
  Object.entries(groupedByDestDomain).forEach(([k, v]) => {
    console.log(`[${k}]`, 'lastProcessed=', saved.lastProcessed[Number(k)]);
    console.log('=> total:', v.length);
    console.log('=> targets:', v.filter(filterProcessed(k)).length);
  });

  const ret: [
    string,
    { unprocessed: typeof checkpoints; lastProcessed: number },
  ][] = await Promise.all(
    Object.entries(groupedByDestDomain).map(async ([k, cps]) => {
      const domain = parseInt(k);
      const remoteProvider = providers[domain];

      let unprocessed: typeof checkpoints = [];

      const targets = cps.filter(filterProcessed(k));
      if (targets.length === 0)
        return [k, { unprocessed, lastProcessed: cps[cps.length - 1].num }];

      const chunks = toChunk(targets, remoteProvider.batchSize.query);
      for (const i in chunks) {
        const cp = chunks[i];
        const resp = await remoteProvider.query.multicall({
          contracts: cp.map((v) => processor(domain, v.value.message_id)),
        });
        console.log(
          `[${k}]`,
          'received processor query response.',
          `len=${resp.length}`,
          `chunk=[${Number(i) + 1}/${chunks.length}]`,
        );

        unprocessed = [
          ...unprocessed,
          ...resp
            .map((v, j) => ({ checkpoint: cp[j], resp: v }))
            .filter((v) => v.resp.result === zeroAddress)
            .map((v) => v.checkpoint),
        ];
        if (unprocessed.length > 0) {
          console.log(
            `[${k}]`,
            'unprocessed item found.',
            `count=${cp[0].num}`,
          );
          unprocessed = [...unprocessed, ...chunks.slice(Number(i) + 1).flat()];
          break;
        }
      }

      unprocessed = unprocessed.sort((a, b) => (a.num < b.num ? -1 : 1));

      console.log(`[${k}]`, 'unprocessed=', unprocessed.length);
      if (unprocessed.length === 0)
        return [k, { unprocessed, lastProcessed: cps[cps.length - 1].num }];

      let lastProcessed = unprocessed[0].num;

      for (const chunk of toChunk(
        unprocessed,
        remoteProvider.batchSize.execute,
      )) {
        const calls = chunk.map((cp) => {
          const metadata = toMetadata(cp);
          const message = cp.yame.message;

          const calldata = encodeFunctionData({
            abi: Mailbox__factory.abi,
            functionName: 'process',
            args: [metadata, message],
          });

          return {
            target: remoteProvider.mailbox,
            callData: calldata,
            allowFailure: true,
          };
        });

        const txHash = await retryMulticall(remoteProvider, calls, {
          gas:
            remoteProvider.query.chain.id === 2442
              ? BigInt(
                  remoteProvider.batchSize.execute *
                    DEFAULT_GAS_PER_FLUSH_CALL *
                    DEFAULT_GAS_ADJUSTMENT,
                )
              : undefined,
        });
        console.log(`[${domain}]`, txHash, chunk.length);
        await remoteProvider.query.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
        });

        lastProcessed = chunk[chunk.length - 1].num;
      }

      return [k, { unprocessed, lastProcessed }];
    }),
  );

  saved = {
    lastProcessed: Object.fromEntries(
      ret.map(([k, { lastProcessed }]) => [Number(k), lastProcessed]),
    ),
  };

  writeFileSync(
    L1L2_RET_PATH,
    JSON.stringify(Object.fromEntries(ret), null, 2),
  );
  writeFileSync(L1L2_SAVE_PATH, JSON.stringify(saved, null, 2));
}

export async function flushL2L1() {
  const remoteProvider = providers[DOMAIN_SEPOLIA];

  let save: { lastProcessedMessageId?: Hex } = existsSync(L2L1_SAVE_PATH)
    ? readJSON<{ lastProcessedMessageId?: Hex }>(L2L1_SAVE_PATH)
    : {};
  if (save.lastProcessedMessageId)
    console.log('context loaded.', `path=${L2L1_SAVE_PATH}`);

  const checkpoints = (() => {
    const cps = Object.keys(providers)
      .map((v) => Number(v))
      .map((v) => [v, CHECKPOINT_PATH(providers[v].hyperlaneId)] as const)
      .flatMap(([v, p]) => loadCheckpoints(p, providers[v]))
      .filter(
        (v) =>
          v.yame.destination === DOMAIN_SEPOLIA &&
          TARGET_DOMAINS.includes(v.value.checkpoint.mailbox_domain),
      )
      .sort((a, b) => (a.yame.timestamp < b.yame.timestamp ? -1 : 1));

    if (save.lastProcessedMessageId) {
      const idx = cps.findIndex(
        (v) => v.value.message_id === save.lastProcessedMessageId,
      );
      if (idx) return cps.slice(idx + 1);
    }

    return cps;
  })();

  console.log('prunning unprocessed items.');
  let unprocessed: typeof checkpoints = [];

  const chunks = toChunk(checkpoints, remoteProvider.batchSize.query);
  for (const i in chunks) {
    const cp = chunks[i];
    const resp = await remoteProvider.query.multicall({
      contracts: cp.map((v) =>
        processor(v.yame.destination, v.value.message_id),
      ),
    });
    console.log(
      '- received processor query response.',
      `len=${resp.length}`,
      `chunk=[${i}/${chunks.length}]`,
    );

    unprocessed = [
      ...unprocessed,
      ...resp
        .map((v, j) => ({ checkpoint: cp[j], resp: v }))
        .filter((v) => v.resp.result === zeroAddress)
        .map((v) => v.checkpoint),
    ];
    if (unprocessed.length > 0) {
      unprocessed = [...unprocessed, ...chunks.slice(Number(i) + 1).flat()];
      console.log(
        '=> unprocessed items found',
        'consider left items as unprocessed.',
        `total=${checkpoints.length}`,
        `unprocessed=${unprocessed.length}`,
      );
      break;
    }
  }

  for (const i in unprocessed) {
    console.log(
      'processing',
      `count=[${i}/${unprocessed.length}]`,
      `id=${unprocessed[i].value.message_id}`,
    );
    const txHash = await remoteProvider.execute.writeContract({
      abi: Mailbox__factory.abi,
      address: remoteProvider.mailbox,
      functionName: 'process',
      args: [toMetadata(unprocessed[i]), unprocessed[i].yame.message],
    });
    console.log('=>', `txHash=${txHash}`);
    await remoteProvider.query.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });
  }
  return;

  for (const chunks of toChunk(unprocessed, remoteProvider.batchSize.execute)) {
    console.log('processing batch');

    const chunkResp = await remoteProvider.query.multicall({
      contracts: chunks.map((v) =>
        processor(v.yame.destination, v.value.message_id),
      ),
    });

    const cps = chunks.filter((_, i) => chunkResp[i].result === zeroAddress);
    console.log(`=> filtered ${chunks.length - cps.length} items.`);
    if (cps.length === 0) {
      console.log('=> no more unprocessed items.');
      continue;
    }

    const calls = cps.map((cp) => {
      const metadata = toMetadata(cp);
      const message = cp.yame.message;

      const calldata = encodeFunctionData({
        abi: Mailbox__factory.abi,
        functionName: 'process',
        args: [metadata, message],
      });

      return {
        target: remoteProvider.mailbox,
        callData: calldata,
        allowFailure: true,
      };
    });
    const batchTxHash = await retryMulticall(remoteProvider, calls);

    console.log('=> batchTxHash:', batchTxHash);
    console.log('=> start:', cps[0].value.message_id);
    console.log('=> end:', cps[cps.length - 1].value.message_id);

    await remoteProvider.query.waitForTransactionReceipt({
      hash: batchTxHash,
      confirmations: 1,
    });

    save.lastProcessedMessageId = chunks[chunks.length - 1].value.message_id;
  }

  writeFileSync(L2L1_RET_PATH, JSON.stringify(unprocessed, null, 2));
  writeFileSync(L2L1_SAVE_PATH, JSON.stringify(save, null, 2));
}
