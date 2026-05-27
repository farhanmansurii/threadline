export function printPlan(plan) {
  console.log(`${plan.title}`);
  console.log(`Mode:    ${plan.mode}`);
  console.log(`Dry run: ${plan.dryRun ? 'yes' : 'no'}`);
  console.log('');
  for (const action of plan.actions) {
    console.log(`${action.type.toUpperCase().padEnd(6)} ${action.target}`);
    console.log(`       ${action.description}`);
  }
  if (plan.notes?.length) {
    console.log('');
    for (const note of plan.notes) console.log(`NOTE   ${note}`);
  }
  if (plan.results?.length) {
    console.log('');
    for (const result of plan.results) {
      console.log(`${result.changed ? 'CHANGED' : 'OK'.padEnd(7)} ${result.target}`);
    }
  }
}
