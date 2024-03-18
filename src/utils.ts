import { Address, Hex, WriteContractErrorType } from 'viem';

import { MulticallAbi } from './abi/Multicall';
import { MULTICALL } from './constants';
import { providers } from './provider';

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function toChunk<T>(arr: T[], size: number) {
  return Array.from(
    { length: Math.ceil(arr.length / size) },
    (_: any, i: number) => arr.slice(i * size, i * size + size),
  );
}

export type RetryMulticallOptions = {
  retryAfter?: number;
  gas?: bigint;
  gasPrice?: bigint;
  nonce?: number;
};

export async function retryMulticall(
  provider: (typeof providers)[number],
  calls: { target: Address; callData: Hex; allowFailure: boolean }[],
  {
    retryAfter = 1000,
    gas = undefined,
    gasPrice = undefined,
    nonce = undefined,
  }: RetryMulticallOptions = {},
): Promise<Hex> {
  try {
    const txHash = await provider.execute.writeContract({
      abi: MulticallAbi,
      address: MULTICALL,
      functionName: 'aggregate3',
      args: [calls],
      nonce,
      gas,
      gasPrice,
    });

    return txHash;
  } catch (e) {
    const error = e as WriteContractErrorType;

    console.error(
      `[${provider.execute.chain.id}]`,
      '[ERROR] Error ocurred while executing multicall contract.',
      `retry after ${retryAfter}ms`,
    );

    switch (error.name) {
      case 'TransactionExecutionError': {
        console.error('=> message:', error.shortMessage);
        console.error('=> details:', error.details);
        break;
      }
      case 'AbiFunctionNotFoundError':
      case 'AbiEncodingLengthMismatchError':
      case 'IntegerOutOfRangeError':
      case 'SizeExceedsPaddingSizeError':
      case 'InvalidDefinitionTypeError':
      case 'SizeOverflowError':
      case 'SliceOffsetOutOfBoundsError':
    }

    await sleep(retryAfter);
    return retryMulticall(provider, calls, {
      retryAfter: retryAfter + 1000,
      nonce,
      gas,
      gasPrice,
    });
  }
}
