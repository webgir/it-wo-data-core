import * as coordinatorState from "./coordinator-state.mjs";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";

/**
 * Conflict Resolution Framework IWDC v1.6
 * 
 * Автоматическое разрешение конфликтов в распределённой системе.
 */

/**
 * Стратегии разрешения конфликтов
 */
export const RESOLUTION_STRATEGIES = {
  LAST_WRITE_WINS: 'last-write-wins',
  LEADER_WINS: 'leader-wins',
  REJECT_INCONSISTENT: 'reject-inconsistent'
};

/**
 * Инициализация Conflict Resolution
 */
export function initialize() {
  // Инициализируем метрики
  metricsRegistry.createCounter('distributed_conflict_resolutions_total', 'Total number of conflict resolutions', ['strategy', 'type']);
  
  eventLogger.log('info', 'Conflict Resolution Framework initialized');
}

/**
 * Разрешает конфликт параллельных снапшотов
 * @param {Array<Object>} snapshots - массив конфликтующих снапшотов
 * @param {string} [strategy] - стратегия разрешения
 * @returns {Object} результат разрешения
 */
export function resolveParallelSnapshots(snapshots, strategy = RESOLUTION_STRATEGIES.LAST_WRITE_WINS) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'CONFLICT_RESOLVE', type: 'parallel_snapshots', strategy });
  eventLogger.setTraceId(traceId);

  try {
    if (snapshots.length === 0) {
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return { resolved: false, reason: 'no_conflicts' };
    }

    let resolvedSnapshot = null;
    let resolutionReason = '';

    switch (strategy) {
      case RESOLUTION_STRATEGIES.LAST_WRITE_WINS:
        // Выбираем снапшот с самым поздним timestamp
        resolvedSnapshot = snapshots.reduce((latest, current) => {
          return current.timestamp > latest.timestamp ? current : latest;
        });
        resolutionReason = 'last-write-wins (latest timestamp)';
        break;

      case RESOLUTION_STRATEGIES.LEADER_WINS:
        // Выбираем снапшот от лидера
        const leader = coordinatorState.getLeader();
        if (leader) {
          resolvedSnapshot = snapshots.find(s => s.sourceInstance === leader.id);
          if (resolvedSnapshot) {
            resolutionReason = 'leader-wins';
          }
        }
        
        // Если не найден снапшот от лидера, используем last-write-wins
        if (!resolvedSnapshot) {
          resolvedSnapshot = snapshots.reduce((latest, current) => {
            return current.timestamp > latest.timestamp ? current : latest;
          });
          resolutionReason = 'leader-wins (fallback to last-write-wins)';
        }
        break;

      case RESOLUTION_STRATEGIES.REJECT_INCONSISTENT:
        // Проверяем хеши на совпадение
        const hashes = snapshots.map(s => s.payload.hash);
        const uniqueHashes = new Set(hashes);
        
        if (uniqueHashes.size > 1) {
          // Хеши не совпадают, отклоняем
          traces.addEvent(traceId, 'CONFLICT_REJECTED', {
            reason: 'hash_mismatch',
            hashes: Array.from(uniqueHashes)
          });
          traces.endTrace(traceId);
          eventLogger.clearTraceId();
          return {
            resolved: false,
            reason: 'hash_mismatch',
            hashes: Array.from(uniqueHashes)
          };
        }
        
        // Хеши совпадают, выбираем любой
        resolvedSnapshot = snapshots[0];
        resolutionReason = 'reject-inconsistent (hashes match)';
        break;

      default:
        throw new Error(`Unknown resolution strategy: ${strategy}`);
    }

    if (resolvedSnapshot) {
      metricsRegistry.inc('distributed_conflict_resolutions_total', 1, { strategy, type: 'parallel_snapshots' });
      
      traces.addEvent(traceId, 'CONFLICT_RESOLVED', {
        strategy,
        resolvedSnapshot: resolvedSnapshot.payload.version,
        reason: resolutionReason
      });
      traces.endTrace(traceId);
      eventLogger.clearTraceId();

      return {
        resolved: true,
        strategy,
        resolvedSnapshot,
        reason: resolutionReason
      };
    }

    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    return { resolved: false, reason: 'no_resolution' };
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to resolve parallel snapshots: ${error.message}`);
    throw error;
  }
}

/**
 * Разрешает конфликт конкурентных diff
 * @param {Array<Object>} diffs - массив конфликтующих diff
 * @param {string} [strategy] - стратегия разрешения
 * @returns {Object} результат разрешения
 */
export function resolveConcurrentDiffs(diffs, strategy = RESOLUTION_STRATEGIES.LAST_WRITE_WINS) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'CONFLICT_RESOLVE', type: 'concurrent_diffs', strategy });
  eventLogger.setTraceId(traceId);

  try {
    if (diffs.length === 0) {
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return { resolved: false, reason: 'no_conflicts' };
    }

    metricsRegistry.inc('distributed_conflicts_total', 1, { type: 'concurrent_diffs' });
    eventLogger.log('warn', 'Concurrent diffs conflict detected', { traceId, count: diffs.length });
    traces.addEvent(traceId, 'CONFLICT_DETECTED', { type: 'concurrent_diffs', count: diffs.length });

    let resolvedDiff = null;
    let resolutionReason = '';

    switch (strategy) {
      case RESOLUTION_STRATEGIES.LAST_WRITE_WINS:
        // Выбираем diff с самым поздним timestamp
        resolvedDiff = diffs.reduce((latest, current) => {
          return current.timestamp > latest.timestamp ? current : latest;
        });
        resolutionReason = 'last-write-wins (latest timestamp)';
        break;

      case RESOLUTION_STRATEGIES.LEADER_WINS:
        // Выбираем diff от лидера
        const leader = coordinatorState.getLeader();
        if (leader) {
          resolvedDiff = diffs.find(d => d.sourceInstance === leader.id);
          if (resolvedDiff) {
            resolutionReason = 'leader-wins';
          }
        }
        
        // Если не найден diff от лидера, используем last-write-wins
        if (!resolvedDiff) {
          resolvedDiff = diffs.reduce((latest, current) => {
            return current.timestamp > latest.timestamp ? current : latest;
          });
          resolutionReason = 'leader-wins (fallback to last-write-wins)';
        }
        break;

      case RESOLUTION_STRATEGIES.REJECT_INCONSISTENT:
        // Проверяем, что все diff ведут к одной версии
        const targetVersions = diffs.map(d => d.payload.to);
        const uniqueTargets = new Set(targetVersions);
        
        if (uniqueTargets.size > 1) {
          // Разные целевые версии, отклоняем
          traces.addEvent(traceId, 'CONFLICT_REJECTED', {
            reason: 'inconsistent_target_versions',
            targets: Array.from(uniqueTargets)
          });
          traces.endTrace(traceId);
          eventLogger.clearTraceId();
          return {
            resolved: false,
            reason: 'inconsistent_target_versions',
            targets: Array.from(uniqueTargets)
          };
        }
        
        // Целевые версии совпадают, выбираем любой
        resolvedDiff = diffs[0];
        resolutionReason = 'reject-inconsistent (target versions match)';
        break;

      default:
        throw new Error(`Unknown resolution strategy: ${strategy}`);
    }

    if (resolvedDiff) {
      metricsRegistry.inc('distributed_conflict_resolutions_total', 1, { strategy, type: 'concurrent_diffs' });
      
      traces.addEvent(traceId, 'CONFLICT_RESOLVED', {
        strategy,
        resolvedDiff: `${resolvedDiff.payload.from} → ${resolvedDiff.payload.to}`,
        reason: resolutionReason
      });
      traces.endTrace(traceId);
      eventLogger.clearTraceId();

      return {
        resolved: true,
        strategy,
        resolvedDiff,
        reason: resolutionReason
      };
    }

    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    return { resolved: false, reason: 'no_resolution' };
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to resolve concurrent diffs: ${error.message}`);
    throw error;
  }
}

/**
 * Разрешает конфликт общего типа
 * @param {string} conflictType - тип конфликта
 * @param {Array<Object>} conflicts - массив конфликтов
 * @param {string} [strategy] - стратегия разрешения
 * @returns {Object} результат разрешения
 */
export function resolveConflict(conflictType, conflicts, strategy = RESOLUTION_STRATEGIES.LAST_WRITE_WINS) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'CONFLICT_RESOLVE', type: conflictType, strategy });
  eventLogger.setTraceId(traceId);

  try {
    switch (conflictType) {
      case 'parallel_snapshots':
        const snapshots = conflicts.map(c => ({
          sourceInstance: c.instances[0],
          timestamp: Date.now(), // TODO: получить реальный timestamp из журнала
          payload: { version: c.version }
        }));
        return resolveParallelSnapshots(snapshots, strategy);

      case 'concurrent_diffs':
        const diffs = conflicts.map(c => ({
          sourceInstance: c.instances[0],
          timestamp: Date.now(), // TODO: получить реальный timestamp из журнала
          payload: { from: c.from, to: c.to }
        }));
        return resolveConcurrentDiffs(diffs, strategy);

      default:
        traces.endTrace(traceId);
        eventLogger.clearTraceId();
        return {
          resolved: false,
          reason: `unknown_conflict_type: ${conflictType}`
        };
    }
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to resolve conflict: ${error.message}`);
    throw error;
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  RESOLUTION_STRATEGIES,
  resolveParallelSnapshots,
  resolveConcurrentDiffs,
  resolveConflict
};

