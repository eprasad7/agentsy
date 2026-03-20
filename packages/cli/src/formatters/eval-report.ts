import type { ExperimentResult, ComparisonResult } from '@agentsy/eval';

// ── Table Format ────────────────────────────────────────────────────

export function formatTable(result: ExperimentResult): string {
  const graderNames = new Set<string>();
  for (const cr of result.caseResults) {
    for (const name of Object.keys(cr.scores)) {
      graderNames.add(name);
    }
  }

  const graders = [...graderNames];
  if (graders.length === 0) return 'No grader results.\n';

  // Column widths
  const caseColWidth = 12;
  const scoreColWidth = 12;

  // Header
  const header =
    pad('Case', caseColWidth) + graders.map((g) => pad(g, scoreColWidth)).join('');
  const separator =
    '-'.repeat(caseColWidth) + graders.map(() => '-'.repeat(scoreColWidth)).join('');

  // Rows
  const rows = result.caseResults.map((cr, i) => {
    const caseLabel = `Case ${i + 1}`;
    const scores = graders.map((g) => {
      const score = cr.scores[g];
      if (!score) return pad('-', scoreColWidth);
      const icon = score.score >= 0.5 ? '\u2713' : '\u2717';
      return pad(`${icon} ${score.score.toFixed(2)}`, scoreColWidth);
    });
    return pad(caseLabel, caseColWidth) + scores.join('');
  });

  // Average row
  const avgRow =
    pad('Average', caseColWidth) +
    graders
      .map((g) => {
        const avg = result.summaryScores[g];
        return pad(avg !== undefined ? avg.toFixed(2) : '-', scoreColWidth);
      })
      .join('');

  const passed = result.passedCases;
  const total = result.totalCases;
  const cost = result.totalCostUsd.toFixed(3);
  const duration = (result.totalDurationMs / 1000).toFixed(1);

  const summary = `${passed}/${total} cases passed | $${cost} total cost | ${duration}s`;

  return [header, separator, ...rows, separator, avgRow, '', summary, ''].join('\n');
}

// ── JSON Format ─────────────────────────────────────────────────────

export function formatJson(result: ExperimentResult): string {
  return JSON.stringify(result, null, 2);
}

// ── Markdown Format (PR Comment) ────────────────────────────────────

export function formatMarkdown(result: ExperimentResult): string {
  const graderNames = new Set<string>();
  for (const cr of result.caseResults) {
    for (const name of Object.keys(cr.scores)) {
      graderNames.add(name);
    }
  }

  const graders = [...graderNames];
  const lines: string[] = [];

  lines.push('## Eval Results');
  lines.push('');

  // Summary
  lines.push(
    `**${result.passedCases}/${result.totalCases}** cases passed | ` +
      `$${result.totalCostUsd.toFixed(3)} cost | ` +
      `${(result.totalDurationMs / 1000).toFixed(1)}s`,
  );
  lines.push('');

  // Table header
  lines.push('| Case | ' + graders.join(' | ') + ' |');
  lines.push('|------|' + graders.map(() => '---').join('|') + '|');

  // Rows
  for (let i = 0; i < result.caseResults.length; i++) {
    const cr = result.caseResults[i]!;
    const scores = graders.map((g) => {
      const score = cr.scores[g];
      if (!score) return '-';
      return score.score >= 0.5 ? `\u2705 ${score.score.toFixed(2)}` : `\u274c ${score.score.toFixed(2)}`;
    });
    lines.push(`| Case ${i + 1} | ${scores.join(' | ')} |`);
  }

  // Average
  lines.push(
    '| **Average** | ' +
      graders
        .map((g) => {
          const avg = result.summaryScores[g];
          return avg !== undefined ? `**${avg.toFixed(2)}**` : '-';
        })
        .join(' | ') +
      ' |',
  );

  return lines.join('\n');
}

// ── Comparison Format ───────────────────────────────────────────────

export function formatComparison(comparison: ComparisonResult): string {
  const lines: string[] = [];

  lines.push('Experiment Comparison');
  lines.push('=====================');
  lines.push('');

  // Summary
  lines.push(
    `Improved: ${comparison.improved} | Regressed: ${comparison.regressed} | Unchanged: ${comparison.unchanged}`,
  );
  lines.push('');

  // Summary deltas
  lines.push('Summary Score Deltas:');
  for (const [grader, delta] of Object.entries(comparison.summaryDeltas)) {
    const sign = delta > 0 ? '+' : '';
    lines.push(`  ${grader}: ${sign}${delta.toFixed(4)}`);
  }
  lines.push('');

  // Per-case diffs
  if (comparison.caseDiffs.length > 0) {
    lines.push('Per-Case Changes:');
    for (const diff of comparison.caseDiffs) {
      if (diff.classification === 'unchanged') continue;
      const icon = diff.classification === 'improved' ? '\u2191' : '\u2193';
      const deltaStr = Object.entries(diff.deltas)
        .map(([g, d]) => `${g}: ${d > 0 ? '+' : ''}${d.toFixed(4)}`)
        .join(', ');
      lines.push(`  ${icon} Case ${diff.caseIndex + 1} (${diff.classification}): ${deltaStr}`);
    }
  }

  return lines.join('\n');
}

function pad(str: string, width: number): string {
  return str.padEnd(width);
}
