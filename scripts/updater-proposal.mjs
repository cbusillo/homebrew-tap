import { execFileSync } from 'node:child_process';
import { appendFileSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FORMULA = 'Formula/bd-to-avp.rb';
export const TAP_FORMULA = 'cbusillo/tap/bd-to-avp';
// Compatible with the deployed whole-file route, independently of LP4271.
export const LIMITS = Object.freeze({ artifact: 512 * 1024, change: 512 * 1024, body: 1024 * 1024 });
const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}

function exactKeys(value, keys) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'), 'Unexpected data fields');
}

export function decode(bytes) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

function regularBytes(path, limit) {
  const stat = lstatSync(path);
  requireThat(stat.isFile() && stat.size <= limit, 'Expected a bounded regular file');
  const bytes = readFileSync(path);
  requireThat(bytes.length <= limit, 'File exceeds byte limit');
  return bytes;
}

export function readArtifact(directory, limit = LIMITS.artifact) {
  requireThat(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'Invalid artifact directory');
  const entries = readdirSync(directory);
  requireThat(entries.length === 1 && entries[0] === 'candidate.json', 'Unexpected artifact files');
  return JSON.parse(decode(regularBytes(join(directory, 'candidate.json'), limit)));
}

export function contextFromEnvironment(env) {
  const context = {
    repository: env.GITHUB_REPOSITORY, base_sha: env.GITHUB_SHA,
    workflow_ref: env.GITHUB_WORKFLOW_REF, run_id: env.GITHUB_RUN_ID, run_attempt: env.GITHUB_RUN_ATTEMPT,
  };
  requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository ?? '')
    && SHA.test(context.base_sha ?? '') && /^[1-9]\d*$/.test(context.run_id ?? '')
    && /^[1-9]\d*$/.test(context.run_attempt ?? ''), 'Invalid trusted run context');
  requireThat(typeof env.DEFAULT_BRANCH === 'string' && env.DEFAULT_BRANCH.length > 0
    && env.GITHUB_REF === `refs/heads/${env.DEFAULT_BRANCH}`
    && context.workflow_ref === `${context.repository}/.github/workflows/autobump.yml@${env.GITHUB_REF}`
    && ['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME), 'Expected the default-branch updater workflow');
  return context;
}

function git(...args) {
  return execFileSync('git', args, { maxBuffer: LIMITS.body, encoding: 'buffer' });
}

function trustedBase(context) {
  requireThat(decode(git('rev-parse', 'HEAD')).trim() === context.base_sha, 'Checkout does not match the run SHA');
  requireThat(/^100644 blob [0-9a-f]{40}\tFormula\/bd-to-avp\.rb\0$/.test(
    decode(git('ls-tree', '-z', context.base_sha, '--', FORMULA))), 'Expected the existing nonexecutable formula');
  return decode(git('show', `${context.base_sha}:${FORMULA}`));
}

function sourceFields(content) {
  requireThat(typeof content === 'string' && decode(Buffer.from(content)) === content, 'Invalid UTF-8 content');
  const urls = [...content.matchAll(/^  url "([^"\r\n]+)"\r?$/gm)];
  const hashes = [...content.matchAll(/^  sha256 "([0-9a-f]{64})"\r?$/gm)];
  requireThat(urls.length === 1 && hashes.length === 1, 'Expected one stable URL and checksum');
  const archive = /^(https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/archive\/refs\/tags\/v)([^/]+)\.tar\.gz$/.exec(urls[0][1]);
  requireThat(archive !== null && VERSION.test(archive[2]), 'Unsupported stable archive URL');
  return { url: urls[0][1], checksum: hashes[0][1], prefix: archive[1], version: archive[2] };
}

function compareVersions(a, b) {
  requireThat(VERSION.test(a) && VERSION.test(b), 'Expected a stable numeric version');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}

export function validateEdit(base, candidate) {
  const old = sourceFields(base), next = sourceFields(candidate);
  requireThat(old.prefix === next.prefix && compareVersions(next.version, old.version) > 0, 'Expected a newer stable version of the same upstream');
  const reconstructed = base.replace(`  url "${old.url}"`, `  url "${next.url}"`)
    .replace(`  sha256 "${old.checksum}"`, `  sha256 "${next.checksum}"`);
  requireThat(reconstructed === candidate, 'Only the stable URL and checksum may change');
  return next;
}

export function selectVersion(records, base) {
  requireThat(Array.isArray(records) && records.length === 1, 'Expected one complete livecheck record');
  const record = records[0], current = sourceFields(base).version;
  requireThat(record?.formula === TAP_FORMULA && !Object.hasOwn(record, 'status')
    && record.version !== null && typeof record.version === 'object', 'Livecheck is unavailable or unsupported');
  const { current: reported, latest, outdated, newer_than_upstream: ahead } = record.version;
  requireThat(reported === current && typeof latest === 'string'
    && typeof outdated === 'boolean' && typeof ahead === 'boolean', 'Invalid livecheck versions');
  const order = compareVersions(latest, current);
  requireThat(outdated === (order > 0) && ahead === (order < 0), 'Inconsistent livecheck result');
  return { update: outdated, latest, ahead };
}

export function makeArtifact(context, base, content, version) {
  requireThat(validateEdit(base, content).version === version, 'Calculation version mismatch');
  return { schema_version: 1, ...context, path: FORMULA, mode: '100644', version, content };
}

export function preparePayload(artifact, context, base, limits = LIMITS) {
  exactKeys(artifact, ['schema_version', ...Object.keys(context), 'path', 'mode', 'version', 'content']);
  requireThat(artifact.schema_version === 1 && Object.entries(context).every(([key, value]) => artifact[key] === value), 'Artifact does not belong to this exact run');
  requireThat(artifact.path === FORMULA && artifact.mode === '100644', 'Unexpected formula path or mode');
  const next = validateEdit(base, artifact.content);
  requireThat(artifact.version === next.version, 'Artifact version mismatch');
  requireThat(Buffer.byteLength(base) + Buffer.byteLength(artifact.content) <= limits.change, 'Change exceeds route byte limit');
  const payload = {
    repository: context.repository, base_sha: context.base_sha,
    title: `bd-to-avp ${next.version}`,
    body: `Homebrew calculated and audited this stable URL/checksum update.\n\nCalculation: https://github.com/${context.repository}/actions/runs/${context.run_id}/attempts/${context.run_attempt}\n\nOrdinary formula CI, review and Launchplane train admission still apply.`,
    files: [{ path: FORMULA, content: artifact.content }],
  };
  requireThat(Buffer.byteLength(JSON.stringify(payload)) <= limits.body, 'Request exceeds route JSON limit');
  return payload;
}

// Only fixed upstream metadata is read here. Archives and formula code stay out of the OIDC job.
export async function verifyRelease(base, version, fetcher = fetch) {
  const upstream = /^https:\/\/github\.com\/([^/]+\/[^/]+)\//.exec(sourceFields(base).url)[1];
  requireThat(VERSION.test(version), 'Invalid release version');
  const response = await fetcher(`https://api.github.com/repos/${upstream}/releases/tags/v${version}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  requireThat(response.ok, `Upstream release lookup failed: HTTP ${response.status}`);
  let bytes = Buffer.alloc(0);
  for await (const chunk of response.body) {
    bytes = Buffer.concat([bytes, chunk]);
    requireThat(bytes.length <= 64 * 1024, 'Upstream release metadata exceeds limit');
  }
  const release = JSON.parse(decode(bytes));
  requireThat(release.tag_name === `v${version}` && release.draft === false && release.prerelease === false
    && typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at)), 'Expected a published stable upstream release');
}

export function summarize(response, repository, status, outcome) {
  if (outcome !== 'success' || !/^2\d\d$/.test(status)) {
    return `Submission failed or its effect is unconfirmed (HTTP ${/^\d{3}$/.test(status) ? status : 'unknown'}). Preserve request/response evidence. A stale-base conflict needs a fresh default-branch calculation; a denied action stops at that refusal; an unknown provider effect needs reconciliation of the original request. No alternate publisher was used.\n`;
  }
  requireThat(response?.status === 'ok' && response.repository === repository
    && ['created', 'replayed', 'pending'].includes(response.disposition)
    && SHA.test(response.head_sha ?? '') && Number.isSafeInteger(response.pull_request_number) && response.pull_request_number > 0
    && response.pull_request_url === `https://github.com/${repository}/pull/${response.pull_request_number}`
    && /^launchplane\/updater\/[0-9a-f]{64}\/[0-9a-f]{64}$/.test(response.branch ?? ''), 'Malformed updater response; effect is unconfirmed');
  const result = response.disposition === 'pending'
    ? 'Pending: this run’s new candidate files were not applied. The existing proposal needs ordinary review.'
    : response.disposition === 'replayed'
      ? 'Replayed existing proposal history. This does not imply a new commit, an open PR or a reopened PR.'
      : 'Created a proposal. Ordinary CI, review and train admission remain required.';
  return `${result}\n\n${response.pull_request_url}\n\nReturned head: \`${response.head_sha}\`\n`;
}

function output(name, value) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main([command, ...args]) {
  const context = contextFromEnvironment(process.env);
  if (command === 'summary') {
    let response;
    if (process.env.SUBMIT_OUTCOME === 'success') response = JSON.parse(decode(regularBytes(args[0], LIMITS.body)));
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summarize(response, context.repository, process.env.SUBMIT_STATUS, process.env.SUBMIT_OUTCOME));
    return;
  }
  const base = trustedBase(context);
  if (command === 'select') {
    requireThat(git('status', '--porcelain=v1', '--untracked-files=all', '-z').length === 0, 'Calculation checkout is not clean');
    const result = selectVersion(JSON.parse(decode(regularBytes(args[0], LIMITS.artifact))), base);
    output('update', result.update);
    output('latest', result.latest);
    if (!result.update) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.ahead
      ? 'No proposal: the formula is ahead of the upstream stable release.\n'
      : 'No proposal: the formula already matches the upstream stable release.\n');
  } else if (command === 'package') {
    requireThat(decode(git('status', '--porcelain=v1', '--untracked-files=all', '-z')) === ` M ${FORMULA}\0`, 'Unexpected calculation changes');
    requireThat((lstatSync(FORMULA).mode & 0o111) === 0, 'Formula mode changed');
    const content = decode(regularBytes(FORMULA, LIMITS.change));
    const result = selectVersion(JSON.parse(decode(regularBytes(args[0], LIMITS.artifact))), base);
    requireThat(result.update, 'No update to package');
    const artifact = makeArtifact(context, base, content, result.latest);
    preparePayload(artifact, context, base);
    const serialized = JSON.stringify(artifact);
    requireThat(Buffer.byteLength(serialized) <= LIMITS.artifact, 'Artifact exceeds limit');
    writeFileSync(args[1], serialized, { flag: 'wx' });
  } else if (command === 'prepare') {
    requireThat(git('status', '--porcelain=v1', '--untracked-files=all', '-z').length === 0, 'Trusted checkout is not clean');
    const artifact = readArtifact(args[0]);
    const payload = preparePayload(artifact, context, base);
    await verifyRelease(base, artifact.version);
    writeFileSync(args[1], JSON.stringify(payload), { flag: 'wx' });
  } else throw new Error('Expected select, package, prepare or summary');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Updater stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
