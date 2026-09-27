#!/usr/bin/env node
// The platform console, such as it is.
//
//   node licence-cli.mjs list
//   node licence-cli.mjs show    UPOINT
//   node licence-cli.mjs trial   UPOINT --days 14 --email boss@company.com
//   node licence-cli.mjs grant   UPOINT BUSINESS yearly
//   node licence-cli.mjs grant   UPOINT BUSINESS lifetime
//   node licence-cli.mjs extend  UPOINT 30
//   node licence-cli.mjs suspend UPOINT "chargeback"
//   node licence-cli.mjs resume  UPOINT
//   node licence-cli.mjs seats   UPOINT
//
// Takes a join code or a workspace id -- a customer quotes their code, never
// a workspace id, and looking it up by hand every time is how the wrong
// company gets suspended.

import {
  list, get, grant, extend, suspend, resume, startTrial, findByCode, seatsUsed,
} from './licences.mjs';
import { PLANS, TERMS, TRIAL_DAYS, priceSen, ringgit } from './plans.mjs';

const [, , command, target, ...rest] = process.argv;

const flag = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 && rest[at + 1] ? rest[at + 1] : fallback;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));

const when = (millis) =>
  !millis ? '—' : new Date(millis).toISOString().slice(0, 10);

const daysLeft = (millis) =>
  !millis ? 'no end date' : `${Math.floor((millis - Date.now()) / 86_400_000)} days`;

/** Accepts either a join code or a raw workspace id. */
async function resolve(value) {
  if (!value) {
    console.error('Which company? Give a join code (UPOINT) or a workspace id.');
    process.exit(1);
  }
  const byCode = await findByCode(value);
  if (byCode) return { workspaceId: byCode.workspaceId, companyName: byCode.companyName, code: byCode.code };
  return { workspaceId: value, companyName: '', code: '' };
}

function print(licence) {
  if (!licence) return console.log('  (no licence document — treated as unprovisioned, which allows work)');
  const seats = licence.seats >= 1_000_000_000 ? 'unlimited' : licence.seats;
  console.log(`  plan        ${licence.plan}  (${seats} accounts)`);
  console.log(`  status      ${licence.status}`);
  console.log(`  started     ${when(licence.startedAt)}`);
  console.log(`  expires     ${when(licence.expiresAt)}  ${daysLeft(licence.expiresAt)}`);
  if (licence.supportUntil) console.log(`  support to  ${when(licence.supportUntil)}`);
  if (licence.companyName) console.log(`  company     ${licence.companyName}`);
  if (licence.contactEmail) console.log(`  contact     ${licence.contactEmail}`);
  if (licence.stripeSubscriptionId) console.log(`  stripe      ${licence.stripeSubscriptionId}`);
  if (licence.note) console.log(`  note        ${licence.note}`);
}

switch (command) {
  case 'list': {
    const all = await list();
    if (all.length === 0) {
      console.log('No licences yet.');
      break;
    }
    const now = Date.now();
    all.sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity));
    console.log(
      'WORKSPACE'.padEnd(22) + 'COMPANY'.padEnd(24) + 'PLAN'.padEnd(11) +
      'STATUS'.padEnd(10) + 'EXPIRES',
    );
    for (const l of all) {
      const dead = l.status !== 'ACTIVE' || (l.expiresAt && l.expiresAt <= now);
      const expires = l.expiresAt ? `${when(l.expiresAt)}  (${daysLeft(l.expiresAt)})` : 'lifetime';
      console.log(
        (dead ? '! ' : '  ') +
          l.workspaceId.slice(0, 20).padEnd(20) +
          (l.companyName || '—').slice(0, 22).padEnd(24) +
          l.plan.padEnd(11) +
          l.status.padEnd(10) +
          expires,
      );
    }
    console.log(`\n${all.length} compan${all.length === 1 ? 'y' : 'ies'}. Lines marked ! cannot start new counts.`);
    break;
  }

  case 'show': {
    const { workspaceId, companyName, code } = await resolve(target);
    console.log(`\n${companyName || workspaceId}${code ? `  [${code}]` : ''}`);
    print(await get(workspaceId));
    console.log();
    break;
  }

  case 'trial': {
    const { workspaceId, companyName } = await resolve(target);
    const licence = await startTrial(workspaceId, {
      companyName: flag('name', companyName),
      contactEmail: flag('email', ''),
      days: Number(flag('days', TRIAL_DAYS)),
    });
    console.log(`\nTrial started for ${workspaceId}`);
    print(licence);
    console.log();
    break;
  }

  case 'grant': {
    const { workspaceId, companyName } = await resolve(target);
    const plan = (positional[0] || '').toUpperCase();
    const term = (positional[1] || '').toLowerCase();
    if (!PLANS[plan] || !TERMS[term]) {
      console.error(`Usage: grant <code> <${Object.keys(PLANS).join('|')}> <${Object.keys(TERMS).join('|')}>`);
      process.exit(1);
    }
    const licence = await grant(workspaceId, plan, term, {
      companyName: flag('name', companyName) || undefined,
      contactEmail: flag('email', undefined),
      note: flag('note', undefined),
    });
    console.log(`\n${PLANS[plan].label} ${TERMS[term].label} — ${ringgit(priceSen(plan, term))}`);
    print(licence);
    console.log();
    break;
  }

  case 'extend': {
    const { workspaceId } = await resolve(target);
    const days = Number(positional[0]);
    if (!Number.isFinite(days) || days === 0) {
      console.error('Usage: extend <code> <days>');
      process.exit(1);
    }
    print(await extend(workspaceId, days, flag('note', undefined)));
    console.log();
    break;
  }

  case 'suspend': {
    const { workspaceId } = await resolve(target);
    print(await suspend(workspaceId, positional[0]));
    console.log();
    break;
  }

  case 'resume': {
    const { workspaceId } = await resolve(target);
    print(await resume(workspaceId, positional[0]));
    console.log();
    break;
  }

  case 'seats': {
    const { workspaceId, companyName } = await resolve(target);
    const licence = await get(workspaceId);
    const used = await seatsUsed(workspaceId);
    const allowed = licence?.seats ?? PLANS.TRIAL.seats;
    const over = used > allowed;
    console.log(`\n${companyName || workspaceId}`);
    console.log(`  ${used} active accounts of ${allowed >= 1_000_000_000 ? 'unlimited' : allowed}`);
    if (over) {
      console.log(`  OVER by ${used - allowed}.`);
      console.log('  Seat limits are not enforced by the security rules -- rules cannot');
      console.log('  count documents. This command is how an overage gets noticed.');
    }
    console.log();
    break;
  }

  default:
    console.log(`
StockCheck licences

  list                            every company, soonest expiry first
  show    <code>                  one company in full
  trial   <code> [--days ${TRIAL_DAYS}] [--email you@co.com] [--name "ACME Sdn Bhd"]
  grant   <code> <PLAN> <TERM>    PLAN: ${Object.keys(PLANS).join(' ')}
                                  TERM: ${Object.keys(TERMS).join(' ')}
  extend  <code> <days>           add time, keep the plan
  suspend <code> ["reason"]       stop new counts now
  resume  <code>
  seats   <code>                  accounts used against the limit

<code> is a join code (UPOINT) or a workspace id.

Price list:`);
    for (const [name, plan] of Object.entries(PLANS)) {
      if (name === 'TRIAL') continue;
      const seats = plan.seats >= 1_000_000_000 ? 'unlimited' : `${plan.seats} accounts`;
      console.log(
        `  ${plan.label.padEnd(10)} ${seats.padEnd(16)}` +
          `${ringgit(plan.monthlySen).padEnd(10)}/mo   ` +
          `${ringgit(plan.yearlySen).padEnd(11)}/yr   ` +
          `${ringgit(plan.lifetimeSen)} lifetime`,
      );
    }
    console.log();
}

process.exit(0);
