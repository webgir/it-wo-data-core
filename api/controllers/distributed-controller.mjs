import * as syncEngine from "../../distributed/sync-engine.mjs";
import * as coordinatorState from "../../distributed/coordinator-state.mjs";
import * as instanceIdModule from "../../distributed/instance-id.mjs";
import * as logger from "../../utils/logger.mjs";
import * as traces from "../../tools/observability/traces.mjs";
import * as metricsRegistry from "../../tools/observability/metrics-registry.mjs";
import * as eventLogger from "../../tools/observability/event-logger.mjs";

/**
 * Distributed Controller IWDC v1.6
 * 
 * API контроллер для distributed layer endpoints.
 */

/**
 * Обрабатывает GET /distributed/quorum
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
export async function getQuorum(req, res) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'QUORUM_API' });
  eventLogger.setTraceId(traceId);
  
  try {
    const quorum = await syncEngine.getQuorumInfo();
    
    traces.addEvent(traceId, 'QUORUM_RETRIEVED', { quorum });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    
    res.writeHead(200, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
    res.end(JSON.stringify({
      success: true,
      data: quorum,
      meta: {
        timestamp: Date.now(),
        traceId
      }
    }));
  } catch (error) {
    metricsRegistry.inc('distributed_api_errors_total', 1, { endpoint: 'quorum', status: '500' });
    eventLogger.log('error', `Failed to get quorum: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'QUORUM_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    
    logger.logError(`Failed to get quorum: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
    res.end(JSON.stringify({
      success: false,
      error: error.message,
      meta: {
        timestamp: Date.now(),
        traceId
      }
    }));
  }
}

/**
 * Обрабатывает POST /distributed/propose-snapshot
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
export async function proposeSnapshot(req, res) {
  const traceId = traces.generateTraceId();
  
  try {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.version || !data.hash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Missing required fields: version, hash',
            meta: { timestamp: Date.now(), traceId }
          }));
          return;
        }

        const result = await syncEngine.proposeSnapshot({
          version: data.version,
          hash: data.hash,
          signature: data.signature || null
        });

        res.writeHead(200, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
        res.end(JSON.stringify({
          success: result.success,
          data: result,
          meta: {
            timestamp: Date.now(),
            traceId
          }
        }));
      } catch (parseError) {
        logger.logError(`Failed to parse request body: ${parseError.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON',
          meta: { timestamp: Date.now(), traceId }
        }));
      }
    });
  } catch (error) {
    logger.logError(`Failed to propose snapshot: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message,
      meta: {
        timestamp: Date.now(),
        traceId
      }
    }));
  }
}

/**
 * Обрабатывает POST /distributed/propose-diff
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
export async function proposeDiff(req, res) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'PROPOSE_DIFF_API' });
  eventLogger.setTraceId(traceId);
  
  try {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.from || !data.to || !data.hash) {
          metricsRegistry.inc('distributed_api_errors_total', 1, { endpoint: 'propose-diff', status: '400' });
          traces.addEvent(traceId, 'PROPOSAL_VALIDATION_ERROR', { error: 'Missing required fields' });
          traces.endTrace(traceId);
          eventLogger.clearTraceId();
          
          res.writeHead(400, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
          res.end(JSON.stringify({
            success: false,
            error: 'Missing required fields: from, to, hash',
            meta: { timestamp: Date.now(), traceId }
          }));
          return;
        }

        const result = await syncEngine.proposeDiff({
          from: data.from,
          to: data.to,
          hash: data.hash
        });

        if (result.success) {
          metricsRegistry.inc('distributed_proposals_sent_total', 1, { type: 'diff' });
          traces.addEvent(traceId, 'PROPOSAL_SENT', { type: 'diff', proposalId: result.proposalId });
        } else {
          metricsRegistry.inc('distributed_proposals_failed_total', 1, { type: 'diff', reason: result.reason });
          traces.addEvent(traceId, 'PROPOSAL_FAILED', { type: 'diff', reason: result.reason });
        }

        traces.endTrace(traceId);
        eventLogger.clearTraceId();

        res.writeHead(200, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
        res.end(JSON.stringify({
          success: result.success,
          data: result,
          meta: {
            timestamp: Date.now(),
            traceId
          }
        }));
      } catch (parseError) {
        metricsRegistry.inc('distributed_api_errors_total', 1, { endpoint: 'propose-diff', status: '400' });
        eventLogger.log('error', `Failed to parse request body: ${parseError.message}`, { traceId });
        traces.addEvent(traceId, 'PARSE_ERROR', { error: parseError.message });
        traces.endTrace(traceId);
        eventLogger.clearTraceId();
        
        logger.logError(`Failed to parse request body: ${parseError.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON',
          meta: { timestamp: Date.now(), traceId }
        }));
      }
    });
  } catch (error) {
    metricsRegistry.inc('distributed_api_errors_total', 1, { endpoint: 'propose-diff', status: '500' });
    eventLogger.log('error', `Failed to propose diff: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'PROPOSAL_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    
    logger.logError(`Failed to propose diff: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json', 'x-trace-id': traceId });
    res.end(JSON.stringify({
      success: false,
      error: error.message,
      meta: {
        timestamp: Date.now(),
        traceId
      }
    }));
  }
}

/**
 * Экспорт для использования в router
 */
export default {
  getQuorum,
  proposeSnapshot,
  proposeDiff
};

