import fs from "fs";
import path from "path";
import * as eventBus from "./event-bus.mjs";
import * as instanceIdModule from "./instance-id.mjs";
import * as journal from "./journal.mjs";
import * as instanceDiscovery from "./instance-discovery.mjs";
import * as syncClient from "./sync-client.mjs";
import * as coordinatorState from "./coordinator-state.mjs";
import * as conflictResolution from "./conflict-resolution.mjs";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";
import * as perfTimer from "../tools/observability/perf-timer.mjs";
import { getVersionPath, getVersionMetaPath, getDataJsonPath } from "../utils/paths.mjs";
import { readJsonFile } from "../utils/file.mjs";

/**
 * Sync Engine IWDC v1.6
 * 
 * Синхронизация diff/snapshot между экземплярами IWDC с поддержкой quorum.
 */

/**
 * Активные предложения: Map<proposalId, { type, data, votes, proposer, timestamp }>
 */
const activeProposals = new Map();

/**
 * Инициализация Sync Engine
 */
export function initialize() {
  // Инициализируем метрики
  metricsRegistry.createCounter('distributed_sync_total', 'Total number of distributed sync operations', ['direction']);
  metricsRegistry.createCounter('distributed_sync_errors_total', 'Total number of distributed sync errors', ['type']);
  metricsRegistry.createCounter('distributed_snapshot_replication_total', 'Total number of snapshot replications', ['source']);
  metricsRegistry.createCounter('distributed_diff_replication_total', 'Total number of diff replications', ['source']);
  metricsRegistry.createCounter('distributed_quorum_skipped_total', 'Total number of operations skipped due to insufficient quorum', ['type']);
  metricsRegistry.createCounter('distributed_proposals_total', 'Total number of proposals', ['type']);
  metricsRegistry.createCounter('distributed_votes_total', 'Total number of votes', ['type']);
  metricsRegistry.createCounter('distributed_snapshot_apply_errors_total', 'Total number of snapshot apply errors');
  metricsRegistry.createCounter('distributed_diff_apply_errors_total', 'Total number of diff apply errors');
  metricsRegistry.createCounter('distributed_proposals_sent_total', 'Total number of proposals sent', ['type']);
  metricsRegistry.createCounter('distributed_proposals_failed_total', 'Total number of failed proposals', ['type', 'reason']);
  metricsRegistry.createCounter('distributed_api_errors_total', 'Total number of API errors', ['endpoint', 'status']);
  metricsRegistry.createCounter('distributed_cli_errors_total', 'Total number of CLI errors', ['command']);
  metricsRegistry.createHistogram('distributed_snapshot_apply_duration_seconds', 'Snapshot apply duration in seconds', [0.1, 0.5, 1, 2, 5, 10]);
  metricsRegistry.createHistogram('distributed_diff_apply_duration_seconds', 'Diff apply duration in seconds', [0.1, 0.5, 1, 2, 5, 10]);
  
  // Подписываемся на события
  eventBus.subscribe(eventBus.EVENT_TYPES.SNAPSHOT_CREATED, (event) => {
    onSnapshotCreated(event.payload);
  });

  eventBus.subscribe(eventBus.EVENT_TYPES.DIFF_CREATED, (event) => {
    onDiffCreated(event.payload);
  });

  eventLogger.log('info', 'Sync Engine initialized');
}

/**
 * Обработчик создания снапшота (локального)
 * @param {Object} snapshotData - данные снапшота { version, path, hash, signature }
 */
function onSnapshotCreated(snapshotData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'SNAPSHOT_BROADCAST', version: snapshotData.version });
  eventLogger.setTraceId(traceId);

  try {
    // Создаём событие для рассылки
    const event = eventBus.publish(eventBus.EVENT_TYPES.SNAPSHOT_CREATED, {
      version: snapshotData.version,
      hash: snapshotData.hash,
      signature: snapshotData.signature,
      timestamp: Date.now()
    });

    // Записываем в журнал
    journal.append(event);

    eventLogger.log('info', `Snapshot broadcast: ${snapshotData.version}`, {
      traceId,
      eventId: event.id
    });

    traces.addEvent(traceId, 'SNAPSHOT_BROADCAST', {
      version: snapshotData.version
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to broadcast snapshot: ${error.message}`);
  }
}

/**
 * Обработчик создания diff (локального)
 * @param {Object} diffData - данные diff { from, to, path, hash }
 */
function onDiffCreated(diffData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'DIFF_BROADCAST', from: diffData.from, to: diffData.to });
  eventLogger.setTraceId(traceId);

  try {
    // Создаём событие для рассылки
    const event = eventBus.publish(eventBus.EVENT_TYPES.DIFF_CREATED, {
      from: diffData.from,
      to: diffData.to,
      hash: diffData.hash,
      timestamp: Date.now()
    });

    // Записываем в журнал
    journal.append(event);

    eventLogger.log('info', `Diff broadcast: ${diffData.from} → ${diffData.to}`, {
      traceId,
      eventId: event.id
    });

    traces.addEvent(traceId, 'DIFF_BROADCAST', {
      from: diffData.from,
      to: diffData.to
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to broadcast diff: ${error.message}`);
  }
}

/**
 * Предлагает снапшот для применения (quorum-based)
 * @param {Object} snapshotData - данные снапшота { version, hash, signature }
 * @returns {Promise<Object>} результат предложения { proposalId, quorum }
 */
export async function proposeSnapshot(snapshotData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'SNAPSHOT_PROPOSAL', version: snapshotData.version });
  eventLogger.setTraceId(traceId);

  try {
    // Проверяем quorum
    const quorum = await checkQuorum();
    if (!quorum.sufficient) {
      logger.logWarning(`Insufficient quorum for snapshot proposal: ${quorum.healthy}/${quorum.total} (need ${quorum.required})`);
      metricsRegistry.inc('distributed_quorum_skipped_total', 1, { type: 'snapshot' });
      
      eventBus.publish(eventBus.EVENT_TYPES.SKIPPED_QUORUM, {
        type: 'snapshot',
        version: snapshotData.version,
        quorum: quorum
      });

      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return {
        success: false,
        reason: 'insufficient_quorum',
        quorum
      };
    }

    const proposalId = `snapshot-${snapshotData.version}-${Date.now()}`;
    const proposer = instanceIdModule.getInstanceId();

    // Создаём предложение
    const proposal = {
      id: proposalId,
      type: 'snapshot',
      data: snapshotData,
      proposer,
      timestamp: Date.now(),
      votes: new Map()
    };

    activeProposals.set(proposalId, proposal);
    metricsRegistry.inc('distributed_proposals_total', 1, { type: 'snapshot' });

    // Публикуем событие предложения
    eventBus.publish('SNAPSHOT_PROPOSAL', {
      proposalId,
      version: snapshotData.version,
      proposer
    });

    // Отправляем предложение другим инстансам
    const instances = instanceDiscovery.listInstances();
    const localInstanceId = instanceIdModule.getInstanceId();
    const remoteInstances = instances.filter(inst => inst.id !== localInstanceId);

    let sent = 0;
    for (const instance of remoteInstances) {
      try {
        await sendProposalToInstance(instance, proposal);
        sent++;
      } catch (error) {
        logger.logWarning(`Failed to send proposal to ${instance.id}: ${error.message}`);
      }
    }

    // Добавляем голос от себя
    collectVote(proposalId, proposer, 'accept');

    traces.addEvent(traceId, 'SNAPSHOT_PROPOSAL_SENT', {
      proposalId,
      version: snapshotData.version,
      sent,
      quorum
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();

    return {
      success: true,
      proposalId,
      quorum
    };
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to propose snapshot: ${error.message}`);
    throw error;
  }
}

/**
 * Предлагает diff для применения (quorum-based)
 * @param {Object} diffData - данные diff { from, to, hash }
 * @returns {Promise<Object>} результат предложения { proposalId, quorum }
 */
export async function proposeDiff(diffData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'DIFF_PROPOSAL', from: diffData.from, to: diffData.to });
  eventLogger.setTraceId(traceId);

  try {
    // Проверяем quorum
    const quorum = await checkQuorum();
    if (!quorum.sufficient) {
      logger.logWarning(`Insufficient quorum for diff proposal: ${quorum.healthy}/${quorum.total} (need ${quorum.required})`);
      metricsRegistry.inc('distributed_quorum_skipped_total', 1, { type: 'diff' });
      
      eventBus.publish(eventBus.EVENT_TYPES.SKIPPED_QUORUM, {
        type: 'diff',
        from: diffData.from,
        to: diffData.to,
        quorum: quorum
      });

      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return {
        success: false,
        reason: 'insufficient_quorum',
        quorum
      };
    }

    const proposalId = `diff-${diffData.from}-${diffData.to}-${Date.now()}`;
    const proposer = instanceIdModule.getInstanceId();

    // Создаём предложение
    const proposal = {
      id: proposalId,
      type: 'diff',
      data: diffData,
      proposer,
      timestamp: Date.now(),
      votes: new Map()
    };

    activeProposals.set(proposalId, proposal);
    metricsRegistry.inc('distributed_proposals_total', 1, { type: 'diff' });

    // Публикуем событие предложения
    eventBus.publish('DIFF_PROPOSAL', {
      proposalId,
      from: diffData.from,
      to: diffData.to,
      proposer
    });

    // Отправляем предложение другим инстансам
    const instances = instanceDiscovery.listInstances();
    const localInstanceId = instanceIdModule.getInstanceId();
    const remoteInstances = instances.filter(inst => inst.id !== localInstanceId);

    let sent = 0;
    for (const instance of remoteInstances) {
      try {
        await sendProposalToInstance(instance, proposal);
        sent++;
      } catch (error) {
        logger.logWarning(`Failed to send proposal to ${instance.id}: ${error.message}`);
      }
    }

    // Добавляем голос от себя
    collectVote(proposalId, proposer, 'accept');

    traces.addEvent(traceId, 'DIFF_PROPOSAL_SENT', {
      proposalId,
      from: diffData.from,
      to: diffData.to,
      sent,
      quorum
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();

    return {
      success: true,
      proposalId,
      quorum
    };
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to propose diff: ${error.message}`);
    throw error;
  }
}

/**
 * Собирает голос по предложению
 * @param {string} proposalId - ID предложения
 * @param {string} voterId - ID голосующего
 * @param {string} vote - голос ('accept' | 'reject')
 * @returns {Object} результат { proposalId, vote, quorumReached }
 */
export function collectVote(proposalId, voterId, vote) {
  const proposal = activeProposals.get(proposalId);
  
  if (!proposal) {
    return {
      success: false,
      reason: 'proposal_not_found'
    };
  }

  // Добавляем голос
  proposal.votes.set(voterId, {
    vote,
    timestamp: Date.now()
  });

  metricsRegistry.inc('distributed_votes_total', 1, { type: proposal.type });

  // Проверяем, достигнут ли quorum
  const quorumReached = checkQuorumForProposal(proposal);

  if (quorumReached) {
    logger.logInfo(`Quorum reached for proposal ${proposalId}`);
    
    // Применяем предложение
    if (proposal.type === 'snapshot') {
      applySnapshot(proposal.data).catch(error => {
        logger.logError(`Failed to apply snapshot: ${error.message}`);
      });
    } else if (proposal.type === 'diff') {
      applyDiff(proposal.data).catch(error => {
        logger.logError(`Failed to apply diff: ${error.message}`);
      });
    }

    // Удаляем предложение
    activeProposals.delete(proposalId);
  }

  return {
    success: true,
    proposalId,
    vote,
    quorumReached,
    votesCount: proposal.votes.size
  };
}

/**
 * Проверяет, достигнут ли quorum для предложения
 * @param {Object} proposal - предложение
 * @returns {boolean} true если quorum достигнут
 */
function checkQuorumForProposal(proposal) {
  const participants = coordinatorState.getParticipants();
  const total = participants.length + 1; // +1 для локального инстанса
  const required = Math.ceil(total / 2); // >= 50%

  // Считаем голоса "accept"
  let acceptVotes = 0;
  for (const vote of proposal.votes.values()) {
    if (vote.vote === 'accept') {
      acceptVotes++;
    }
  }

  return acceptVotes >= required;
}

/**
 * Проверяет quorum для применения операций
 * @returns {Promise<Object>} информация о quorum
 */
async function checkQuorum() {
  const participants = coordinatorState.getParticipants();
  const total = participants.length + 1; // +1 для локального инстанса
  const healthy = coordinatorState.getHealthyParticipantsCount() + 1; // +1 для локального инстанса
  const required = Math.ceil(total / 2); // >= 50%

  return {
    total,
    healthy,
    required,
    sufficient: healthy >= required
  };
}

/**
 * Получает информацию о quorum
 * @returns {Promise<Object>} информация о quorum
 */
export async function getQuorumInfo() {
  return await checkQuorum();
}

/**
 * Отправляет предложение на удалённый инстанс
 * @param {Object} instance - конфигурация инстанса
 * @param {Object} proposal - предложение
 */
async function sendProposalToInstance(instance, proposal) {
  try {
    const http = await import('http');
    const https = await import('https');
    const { URL } = await import('url');
    
    const url = instance.url.replace('/distributed/sync', '/api/v1/distributed/propose-' + proposal.type);
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const postData = JSON.stringify({
      version: proposal.type === 'snapshot' ? proposal.data.version : undefined,
      from: proposal.type === 'diff' ? proposal.data.from : undefined,
      to: proposal.type === 'diff' ? proposal.data.to : proposal.data.version,
      hash: proposal.data.hash,
      signature: proposal.data.signature || null
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    throw new Error(`Failed to send proposal: ${error.message}`);
  }
}

/**
 * Применяет снапшот локально
 * @param {Object} snapshotData - данные снапшота
 */
async function applySnapshot(snapshotData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'SNAPSHOT_APPLY', version: snapshotData.version });
  eventLogger.setTraceId(traceId);
  perfTimer.start('snapshot_apply');

  try {
    // TODO: Реализовать применение снапшота
    // 1. Проверить подпись
    // 2. Скопировать данные из версии в data/json
    // 3. Обновить метаданные

    const duration = perfTimer.end('snapshot_apply');
    metricsRegistry.observe('distributed_snapshot_apply_duration_seconds', duration / 1000);
    
    logger.logInfo(`Snapshot ${snapshotData.version} applied`);
    eventLogger.log('info', `Snapshot applied: ${snapshotData.version}`, { traceId, duration });

    // Публикуем событие принятия
    eventBus.publish('SNAPSHOT_ACCEPT', {
      version: snapshotData.version,
      timestamp: Date.now()
    });

    traces.addEvent(traceId, 'SNAPSHOT_APPLIED', {
      version: snapshotData.version,
      duration
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    perfTimer.end('snapshot_apply');
    metricsRegistry.inc('distributed_snapshot_apply_errors_total', 1);
    eventLogger.log('error', `Failed to apply snapshot: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'SNAPSHOT_APPLY_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    throw error;
  }
}

/**
 * Применяет diff локально
 * @param {Object} diffData - данные diff
 */
async function applyDiff(diffData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'DIFF_APPLY', from: diffData.from, to: diffData.to });
  eventLogger.setTraceId(traceId);
  const timer = perfTimer.start('diff_apply');

  try {
    // TODO: Реализовать применение diff
    // 1. Проверить подпись
    // 2. Применить изменения к data/json
    // 3. Обновить метаданные

    const duration = perfTimer.end('diff_apply');
    metricsRegistry.observe('distributed_diff_apply_duration_seconds', duration / 1000);
    
    logger.logInfo(`Diff ${diffData.from} → ${diffData.to} applied`);
    eventLogger.log('info', `Diff applied: ${diffData.from} → ${diffData.to}`, { traceId, duration });

    // Публикуем событие принятия
    eventBus.publish('DIFF_ACCEPT', {
      from: diffData.from,
      to: diffData.to,
      timestamp: Date.now()
    });

    traces.addEvent(traceId, 'DIFF_APPLIED', {
      from: diffData.from,
      to: diffData.to,
      duration
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    perfTimer.end('diff_apply');
    metricsRegistry.inc('distributed_diff_apply_errors_total', 1);
    eventLogger.log('error', `Failed to apply diff: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'DIFF_APPLY_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    throw error;
  }
}

/**
 * Применяет входящий снапшот (без quorum, для прямой синхронизации)
 * @param {Object} snapshotData - данные снапшота
 */
export async function applyIncomingSnapshot(snapshotData) {
  return await applySnapshot(snapshotData);
}

/**
 * Применяет входящий diff (без quorum, для прямой синхронизации)
 * @param {Object} diffData - данные diff
 */
export async function applyIncomingDiff(diffData) {
  return await applyDiff(diffData);
}

/**
 * Получает активные предложения
 * @returns {Array<Object>} массив предложений
 */
export function getActiveProposals() {
  return Array.from(activeProposals.values()).map(proposal => ({
    id: proposal.id,
    type: proposal.type,
    proposer: proposal.proposer,
    timestamp: proposal.timestamp,
    votesCount: proposal.votes.size
  }));
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  proposeSnapshot,
  proposeDiff,
  collectVote,
  getQuorumInfo,
  applyIncomingSnapshot,
  applyIncomingDiff,
  getActiveProposals
};

