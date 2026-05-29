import chalk from 'chalk';

export function splash(version = '0.1.0') {
	const art = [
		'',
		'   ▄    █                               █  ▀▀█      ▀',
		' ▄▄█▄▄  █ ▄▄    ▄ ▄▄   ▄▄▄    ▄▄▄    ▄▄▄█    █    ▄▄▄    ▄ ▄▄    ▄▄▄',
		'   █    █▀  █   █▀  ▀ █▀  █  ▀   █  █▀ ▀█    █      █    █▀  █  █▀  █',
		'   █    █   █   █     █▀▀▀▀  ▄▀▀▀█  █   █    █      █    █   █  █▀▀▀▀',
		'   ▀▄▄  █   █   █     ▀█▄▄▀  ▀▄▄▀█  ▀█▄██    ▀▄▄  ▄▄█▄▄  █   █  ▀█▄▄▀',
		'',
	].join('\n');
	const rule = '  ·──────────────────────────────────────────────────────────·';
	return [
		chalk.cyan(art),
		chalk.cyan.dim(rule),
		chalk.white.bold('  Portable memory for agentic coding.'),
		chalk.dim(`  Any agent resumes where the last one left off.  ·  v${version}`),
		'',
	].join('\n');
}

export function miniSplash() {
	return chalk.bold.cyan('◆ Threadline');
}

export function stepLabel(current, total, label) {
	const indicator = chalk.dim(`[${current}/${total}]`);
	return `${indicator} ${label}`;
}

export function statusOk(text) {
	return `${chalk.green('✓')}  ${text}`;
}

export function statusSkip(text) {
	return `${chalk.dim('◌')}  ${text}`;
}

export function statusWarn(text) {
	return `${chalk.yellow('⚠')}  ${text}`;
}

export function statusError(text) {
	return `${chalk.red('✗')}  ${text}`;
}

export function statusInfo(text) {
	return `${chalk.cyan('→')}  ${text}`;
}

export function divider(width = 50) {
	return chalk.dim('─'.repeat(width));
}

export function sectionTitle(text) {
	return chalk.bold.white(text);
}

export function muted(text) {
	return chalk.dim(text);
}

export function highlight(text) {
	return chalk.cyan.bold(text);
}

export function code(text) {
	return chalk.yellow(text);
}

export function renderTable(rows, { gap = 2 } = {}) {
	const maxLabel = Math.max(...rows.map((r) => (r.label || '').length));
	return rows
		.map(({ label, value, indent = 0 }) => {
			const prefix = ' '.repeat(indent);
			const padded = (label || '').padEnd(maxLabel + gap);
			return `${prefix}${chalk.dim(padded)}${value}`;
		})
		.join('\n');
}

export function renderRuntimeList(runtimes) {
	return runtimes
		.map((r) => {
			const icon = r.installed ? chalk.green('●') : chalk.dim('○');
			const name = r.installed ? chalk.white(r.name) : chalk.dim(r.name);
			const hint = r.signals.length ? chalk.dim(`  (${r.signals.join(', ')})`) : '';
			return `   ${icon}  ${name}${hint}`;
		})
		.join('\n');
}
