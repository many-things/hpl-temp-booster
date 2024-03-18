import path from 'path';
import { Hex, isHex } from 'viem';

import { DOMAIN_ARBITRUM, DOMAIN_CARDONA, DOMAIN_OPTIMISM } from './constants';

const checkUndefinedAndEmpty = (v: string | undefined) =>
  v === undefined || v === '';

const RAW_PK = process.env.BST_PK;
if (!RAW_PK) throw new Error('PK not found');
if (!isHex(RAW_PK)) throw new Error('PK is not hex');

const PK = RAW_PK as Hex;
const BASE_PATH = process.env.BST_BASE_PATH || process.cwd();

const HPL_DATA_PATH =
  process.env.BST_HPL_DATA_PATH || path.join(BASE_PATH, '/data/validator');
const YAME_DATA_PATH =
  process.env.BST_YAME_DATA_PATH || path.join(BASE_PATH, '/data/yame');

const PLG_SEP_URL = process.env.BST_PLG_SEP_URL;
const ARB_SEP_URL = process.env.BST_ARB_SEP_URL;
const SEP_URL = process.env.BST_SEP_URL;
const OP_SEP_URL = process.env.BST_OP_SEP_URL;

const SUPPORTED_DOMAINS = [DOMAIN_ARBITRUM, DOMAIN_CARDONA, DOMAIN_OPTIMISM];
const TARGET_DOMAINS = process.env.BST_TARGET_DOMAINS
  ? process.env.BST_TARGET_DOMAINS.split(',')
      .map(Number)
      .filter((v) => SUPPORTED_DOMAINS.includes(v))
  : [];
if (TARGET_DOMAINS.length === 0) throw new Error('No target domains specified');

const DISABLE_L1L2 = !checkUndefinedAndEmpty(process.env.BST_DISABLE_L1L2);
const DISABLE_L2L1 = !checkUndefinedAndEmpty(process.env.BST_DISABLE_L2L1);

const SENTRY_DSN = process.env.SENTRY_DSN;

export {
  // credentials
  PK,
  // paths
  BASE_PATH,
  HPL_DATA_PATH,
  YAME_DATA_PATH,
  // endpoints
  PLG_SEP_URL,
  ARB_SEP_URL,
  SEP_URL,
  OP_SEP_URL,
  // domains
  SUPPORTED_DOMAINS,
  TARGET_DOMAINS,
  // flags
  DISABLE_L1L2,
  DISABLE_L2L1,
  // monitoring
  SENTRY_DSN,
};
