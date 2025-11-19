#!/usr/bin/env node

import * as syncEngine from "../distributed/sync-engine.mjs";
import * as coordinatorState from "../distributed/coordinator-state.mjs";
import * as leaderElection from "../distributed/leader-election.mjs";
import * as lockService from "../distributed/lock-service.mjs";
import * as timeSync from "../distributed/time-sync.mjs";
import * as instanceIdModule from "../distributed/instance-id.mjs";
import * as logger from "../utils/logger.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";

/**
 * IWDC Distributed CLI IWDC v1.6
 * 
 * Команды для управления distributed layer.
 */

/**
 * Парсит аргументы командной строки
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value || true;
    }
  }

  return { command, options };
}

/**
 * Показывает состояние quorum
 */
async function showQuorum() {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'QUORUM_CHECK' });
  eventLogger.setTraceId(traceId);

  try {
    const quorum = await syncEngine.getQuorumInfo();
    
    traces.addEvent(traceId, 'QUORUM_CHECKED', { quorum });
    
    console.log('\n' + '='.repeat(60));
    console.log('IWDC QUORUM STATUS');
    console.log('='.repeat(60));
    console.log(`Total instances: ${quorum.total}`);
    console.log(`Healthy instances: ${quorum.healthy}`);
    console.log(`Required for quorum: ${quorum.required}`);
    console.log(`Quorum sufficient: ${quorum.sufficient ? '✅ YES' : '❌ NO'}`);
    console.log('='.repeat(60) + '\n');

    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    metricsRegistry.inc('distributed_cli_errors_total', 1, { command: 'quorum' });
    eventLogger.log('error', `Quorum check failed: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'QUORUM_CHECK_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Отправляет предложение snapshot
 */
async function proposeSnapshot(options) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'PROPOSE_SNAPSHOT' });
  eventLogger.setTraceId(traceId);

  try {
    const version = options.version || options.v;
    const hash = options.hash || options.h;

    if (!version || !hash) {
      console.error('❌ Error: --version and --hash are required');
      console.error('Usage: iwdc-distributed propose-snapshot --version=<ver> --hash=<hash> [--signature=<sig>]');
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      process.exit(1);
    }

    console.log(`📤 Proposing snapshot: ${version}...`);

    const result = await syncEngine.proposeSnapshot({
      version,
      hash,
      signature: options.signature || null
    });

    if (result.success) {
      metricsRegistry.inc('distributed_proposals_sent_total', 1, { type: 'snapshot' });
      traces.addEvent(traceId, 'PROPOSAL_SENT', { type: 'snapshot', proposalId: result.proposalId });
      eventLogger.log('info', `Snapshot proposal sent: ${version}`, { traceId, proposalId: result.proposalId });
      
      console.log('✅ Snapshot proposal sent');
      console.log(`   Proposal ID: ${result.proposalId}`);
      console.log(`   Quorum: ${result.quorum.healthy}/${result.quorum.total} (need ${result.quorum.required})`);
    } else {
      metricsRegistry.inc('distributed_proposals_failed_total', 1, { type: 'snapshot', reason: result.reason });
      traces.addEvent(traceId, 'PROPOSAL_FAILED', { type: 'snapshot', reason: result.reason });
      eventLogger.log('warn', `Snapshot proposal failed: ${result.reason}`, { traceId });
      
      console.error('❌ Failed to propose snapshot');
      console.error(`   Reason: ${result.reason}`);
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      process.exit(1);
    }

    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    metricsRegistry.inc('distributed_cli_errors_total', 1, { command: 'propose-snapshot' });
    eventLogger.log('error', `Snapshot proposal error: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'PROPOSAL_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Отправляет предложение diff
 */
async function proposeDiff(options) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'PROPOSE_DIFF' });
  eventLogger.setTraceId(traceId);

  try {
    const from = options.from || options.f;
    const to = options.to || options.t;
    const hash = options.hash || options.h;

    if (!from || !to || !hash) {
      console.error('❌ Error: --from, --to and --hash are required');
      console.error('Usage: iwdc-distributed propose-diff --from=<ver> --to=<ver> --hash=<hash>');
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      process.exit(1);
    }

    console.log(`📤 Proposing diff: ${from} → ${to}...`);

    const result = await syncEngine.proposeDiff({
      from,
      to,
      hash
    });

    if (result.success) {
      metricsRegistry.inc('distributed_proposals_sent_total', 1, { type: 'diff' });
      traces.addEvent(traceId, 'PROPOSAL_SENT', { type: 'diff', proposalId: result.proposalId });
      eventLogger.log('info', `Diff proposal sent: ${from} → ${to}`, { traceId, proposalId: result.proposalId });
      
      console.log('✅ Diff proposal sent');
      console.log(`   Proposal ID: ${result.proposalId}`);
      console.log(`   Quorum: ${result.quorum.healthy}/${result.quorum.total} (need ${result.quorum.required})`);
    } else {
      metricsRegistry.inc('distributed_proposals_failed_total', 1, { type: 'diff', reason: result.reason });
      traces.addEvent(traceId, 'PROPOSAL_FAILED', { type: 'diff', reason: result.reason });
      eventLogger.log('warn', `Diff proposal failed: ${result.reason}`, { traceId });
      
      console.error('❌ Failed to propose diff');
      console.error(`   Reason: ${result.reason}`);
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      process.exit(1);
    }

    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    metricsRegistry.inc('distributed_cli_errors_total', 1, { command: 'propose-diff' });
    eventLogger.log('error', `Diff proposal error: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'PROPOSAL_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Показывает справку
 */
function showHelp() {
  console.log(`
IWDC Distributed CLI v1.6

Usage: iwdc-distributed <command> [options]

Commands:
  quorum                    Show quorum status
  propose-snapshot          Propose snapshot for cluster acceptance
  propose-diff              Propose diff for cluster acceptance
  status                    Show distributed layer status
  leader                    Show current leader
  locks                     Show active locks
  drift                     Show time drift

Examples:
  iwdc-distributed quorum
  iwdc-distributed propose-snapshot --version=1.2.0 --hash=abc123
  iwdc-distributed propose-diff --from=1.1.0 --to=1.2.0 --hash=def456
`);
}

/**
 * Основная функция CLI
 */
async function main() {
  const { command, options } = parseArgs();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  switch (command) {
    case 'quorum':
      await showQuorum();
      break;

    case 'propose-snapshot':
      await proposeSnapshot(options);
      break;

    case 'propose-diff':
      await proposeDiff(options);
      break;

    case 'status':
      // TODO: Implement status command
      console.log('Status command not yet implemented');
      break;

    case 'leader':
      // TODO: Implement leader command
      console.log('Leader command not yet implemented');
      break;

    case 'locks':
      // TODO: Implement locks command
      console.log('Locks command not yet implemented');
      break;

    case 'drift':
      // TODO: Implement drift command
      console.log('Drift command not yet implemented');
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// Запускаем CLI
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

