import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'limit-probe',
  firestore: { rules: readFileSync('limit-probe.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});
await env.clearFirestore();

// Make all 15 probe docs exist so burn() would return true if it ran to completion.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (let i = 1; i <= 15; i++) await setDoc(doc(db, `probe/a${i}`), { n: i });
});

const db = env.authenticatedContext('u1').firestore();
try {
  await setDoc(doc(db, 'target/t1'), { x: 1 });
  console.log('RESULT: ALLOWED  -> emulator did NOT enforce the 10-access limit');
} catch (e) {
  console.log('RESULT: DENIED   -> emulator DID enforce it:', String(e.message).split('\n')[0].slice(0, 140));
}
await env.cleanup();
