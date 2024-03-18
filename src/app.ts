import { DOMAIN_SEPOLIA } from './constants';
import { DISABLE_L1L2, DISABLE_L2L1, TARGET_DOMAINS } from './env';
import { flushL1L2, flushL2L1 } from './flush';
import { closeSentry, handleError, setupSentry } from './sentry';
import { sync } from './sync';

export async function app() {
  setupSentry();

  console.log('TARGET_DOMAINS: ', TARGET_DOMAINS);

  try {
    console.log('[======= SYNC =======]');
    await Promise.all([...TARGET_DOMAINS, DOMAIN_SEPOLIA].map(sync));

    if (!DISABLE_L2L1) {
      console.log('[======= FLUSH L2L1 =======]');
      await flushL2L1();
      console.log('[======= DONE =======]');
    } else {
      console.log('[======= L2L1 DISABLED =======]');
    }

    if (!DISABLE_L1L2) {
      console.log('[======= FLUSH L1L2 =======]');
      await flushL1L2();
      console.log('[======= DONE =======]');
    } else {
      console.log('[======= L1L2 DISABLED =======]');
    }
  } catch (e) {
    handleError(e);
  } finally {
    await closeSentry();
  }
}
