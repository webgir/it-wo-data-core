import { run as validateContracts } from './validate-contracts.mjs';
import { run as auditStructure } from './audit-structure.mjs';
import { run as auditSeo } from './audit-seo.mjs';
import { run as bcValidator } from './bc-validator.mjs';
import { run as dataSemver } from './data-semver.mjs';
import { run as integrity } from './integrity.mjs';

export async function importAllAudits() {
  return [
    validateContracts,
    auditStructure,
    auditSeo,
    bcValidator,
    dataSemver,
    integrity
  ];
}

export async function runAllAudits(options = {}) {
  const audits = await importAllAudits();
  const reports = [];
  
  for (const audit of audits) {
    const report = await audit(options);
    reports.push(report);
  }
  
  return reports;
}


