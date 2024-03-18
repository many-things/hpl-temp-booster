import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Context } from 'mocha';
import path from 'path';
import { GetBlockReturnType, keccak256, parseAbiItem } from 'viem';

import { YAME_DATA_PATH } from './env';
import { providers } from './provider';
import { sleep, toChunk } from './utils';

const dispatchEvent = parseAbiItem(
  'event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)',
);

const MAILBOX_PATH = (hyperlaneId: string) =>
  path.join(YAME_DATA_PATH, hyperlaneId);
const CONTEXT_PATH = (hyperlaneId: string) =>
  path.join(MAILBOX_PATH(hyperlaneId), 'context.json');

export async function sync(domain: number) {
  console.log('sync', domain);
  const provider = providers[domain];

  const mailboxPath = MAILBOX_PATH(provider.hyperlaneId);
  const contextPath = CONTEXT_PATH(provider.hyperlaneId);
  if (!existsSync(mailboxPath)) mkdirSync(mailboxPath, { recursive: true });

  const latest = await provider.query.getBlockNumber();

  const ctx: Context = existsSync(contextPath)
    ? JSON.parse(readFileSync(contextPath, 'utf-8'))
    : { lastSyncedBlock: provider.mailboxDeployedAt };
  console.log('lastSyncedBlock :', ctx.lastSyncedBlock);
  console.log('latest          :', latest);

  let { lastSyncedBlock: fromBlock } = ctx;
  let internal = 10000;

  while (fromBlock < latest) {
    const toBlock = Math.min(Number(latest), fromBlock + internal);

    const logs = await provider.query.getLogs({
      address: provider.mailbox,
      event: dispatchEvent,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });

    const logNotExists = logs
      .map((v) => ({ log: v, messageId: keccak256(v.args.message!) }))
      .filter(
        (v) => !existsSync(path.join(mailboxPath, `${v.messageId}.json`)),
      );

    let blocks: GetBlockReturnType[] = [];

    for (const chunk of toChunk(
      logNotExists.reduce(
        (acc, v) => [...acc, v.log.blockNumber.toString()],
        [] as string[],
      ),
      provider.batchSize.query,
    )) {
      blocks = [
        ...blocks,
        ...(await Promise.all(
          chunk.map((v) => provider.query.getBlock({ blockNumber: BigInt(v) })),
        )),
      ];
      await sleep(200);
    }

    let blockTimes = Object.fromEntries(
      blocks.map((v) => [v.number.toString(), { timestamp: v.timestamp }]),
    );

    for (const { log, messageId } of logNotExists) {
      writeFileSync(
        path.join(mailboxPath, `${messageId}.json`),
        JSON.stringify(
          {
            ...log.args,
            messageId,
            timestamp: Number(blockTimes[log.blockNumber.toString()].timestamp),
          },
          null,
          2,
        ),
      );
      console.log(`[${domain}]`, messageId);
    }

    console.log(
      `[${domain}]`,
      'fromBlock=',
      fromBlock.toString(),
      'toBlock=',
      toBlock.toString(),
    );

    fromBlock = toBlock;
  }

  writeFileSync(
    contextPath,
    JSON.stringify({ lastSyncedBlock: fromBlock }, null, 2),
  );
}
