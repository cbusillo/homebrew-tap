import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  contextFromEnvironment, decode, FORMULA, LIMITS, makeArtifact, preparePayload,
  readArtifact, selectVersion, summarize, TAP_FORMULA, validateEdit, verifyRelease,
} from './updater-proposal.mjs';

const base = `class Example < Formula
  desc "CLI only; ünicode remains unchanged"
  url "https://github.com/example/upstream/archive/refs/tags/v1.9.9.tar.gz"
  sha256 "${'a'.repeat(64)}"
  livecheck do
    url :stable
    strategy :github_latest
  end
  depends_on "example-runtime"
  def install
    bin.install "example"
  end
  test do
    system bin/"example", "--help"
  end
end
`;
function candidate(version = '1.10.0') {
  return base.replace('v1.9.9.tar.gz', `v${version}.tar.gz`).replace('a'.repeat(64), 'b'.repeat(64));
}
const context = {
  repository: 'example/tap', base_sha: 'c'.repeat(40),
  workflow_ref: 'example/tap/.github/workflows/autobump.yml@refs/heads/main', run_id: '123', run_attempt: '2',
};
const artifact = () => makeArtifact(context, base, candidate(), '1.10.0');
const record = (latest = '1.10.0', outdated = true, ahead = false) => [{
  formula: TAP_FORMULA, version: { current: '1.9.9', latest, outdated, newer_than_upstream: ahead },
}];
const environment = {
  GITHUB_REPOSITORY: context.repository, GITHUB_SHA: context.base_sha, GITHUB_WORKFLOW_REF: context.workflow_ref,
  GITHUB_RUN_ID: context.run_id, GITHUB_RUN_ATTEMPT: context.run_attempt,
  DEFAULT_BRANCH: 'main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'schedule',
};

test('only a newer stable URL and checksum produce the exact full-file request', () => {
  const payload = preparePayload(artifact(), context, base);
  assert.deepEqual(payload.files, [{ path: FORMULA, content: candidate() }]);
  assert.equal(payload.repository, context.repository);
  assert.equal(payload.base_sha, context.base_sha);
  assert.match(payload.title, /1\.10\.0/);
  assert.equal(validateEdit(base, candidate('2.0.0')).version, '2.0.0');
  const crlfBase = base.replaceAll('\n', '\r\n'), crlfNext = candidate().replaceAll('\n', '\r\n');
  assert.equal(validateEdit(crlfBase, crlfNext).version, '1.10.0');
  assert.throws(() => validateEdit(crlfBase, candidate()), /Only the stable/);
});

test('no-update is a complete consistent livecheck result, never an empty or failed result', () => {
  assert.deepEqual(selectVersion(record('1.9.9', false), base), { update: false, latest: '1.9.9', ahead: false });
  assert.deepEqual(selectVersion(record('1.9.8', false, true), base), { update: false, latest: '1.9.8', ahead: true });
  assert.equal(selectVersion(record(), base).update, true);
  for (const data of [[], {}, [...record(), ...record()], [{ formula: TAP_FORMULA, status: 'error' }],
    record('1.9.9', true), record('1.10.0', false), record('1.9.8', false), record('1.10.0-rc1'),
    [{ ...record()[0], formula: 'other/tap/formula' }],
    [{ ...record()[0], version: { ...record()[0].version, current: '1.9.8' } }]]) {
    assert.throws(() => selectVersion(data, base));
  }
});

test('unsafe formula edits, source redirects, equal versions and downgrades refuse', () => {
  const bad = [base, candidate('1.9.9'), candidate('1.9.8'), candidate('1.8.20'), candidate('1.10.0-rc1'),
    candidate('1.10.0+build'), candidate('01.10.0'), candidate('1.10.0/evil'),
    candidate().replace('github.com', 'evil.example'), candidate().replace('example/upstream', 'other/upstream'),
    candidate().replace('class Example', 'class Other'), candidate().replace('example-runtime', 'evil-runtime'),
    candidate().replace('url :stable', 'url "https://evil.example"'),
    candidate().replace('bin.install "example"', 'system "evil"'),
    candidate().replace('"--help"', '"--evil"'), candidate() + 'system "evil"\n',
    candidate().replace('  sha256', '  sha256 "' + 'b'.repeat(64) + '"\n  sha256'),
    candidate().replace('b'.repeat(64), '#{system("evil")}'), candidate().trimEnd(),
    candidate().replace('v1.10.0.tar.gz', 'v1.10.0.tar.gz?redirect=evil')];
  for (const content of bad) assert.throws(() => validateEdit(base, content));
  assert.throws(() => decode(Buffer.from([0xc0, 0xaf])), /encoded data/);
  assert.throws(() => validateEdit(base, candidate() + '\ud800'), /UTF-8/);
});

test('unexpected provenance, schema, path, mode, content and fields cannot enter a payload', () => {
  const bad = [null, [], { ...artifact(), extra: 'injected' }, { ...artifact(), schema_version: 2 },
    ...Object.keys(context).map(key => ({ ...artifact(), [key]: 'another-run' })),
    ...['../Formula/bd-to-avp.rb', '/tmp/formula', 'Formula/other.rb', '.github/workflows/run.yml']
      .map(path => ({ ...artifact(), path })),
    { ...artifact(), mode: '100755' }, { ...artifact(), mode: '120000' },
    { ...artifact(), version: '2.0.0' }, { ...artifact(), content: null },
    { ...artifact(), files: [{ path: 'extra', content: 'code' }] }];
  const missing = artifact(); delete missing.run_attempt; bad.push(missing);
  for (const value of bad) assert.throws(() => preparePayload(value, context, base));
});

test('trusted context rejects a nondefault run, another workflow and invalid event or identity', () => {
  assert.deepEqual(contextFromEnvironment(environment), context);
  for (const changes of [{ DEFAULT_BRANCH: '' }, { GITHUB_REF: 'refs/heads/work/task' },
    { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_WORKFLOW_REF: 'example/tap/.github/workflows/other.yml@refs/heads/main' },
    { GITHUB_SHA: 'not-a-sha' }, { GITHUB_RUN_ATTEMPT: '0' }, { GITHUB_REPOSITORY: 'example/tap\ncode' }]) {
    assert.throws(() => contextFromEnvironment({ ...environment, ...changes }));
  }
});

test('byte budgets count UTF-8 and serialized JSON, accepting exact boundaries only', () => {
  const value = artifact(), payload = preparePayload(value, context, base);
  const change = Buffer.byteLength(base) + Buffer.byteLength(candidate());
  const body = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(change > base.length + candidate().length);
  assert.deepEqual(preparePayload(value, context, base, { change, body }), payload);
  assert.throws(() => preparePayload(value, context, base, { change: change - 1, body }), /Change exceeds/);
  assert.throws(() => preparePayload(value, context, base, { change, body: body - 1 }), /JSON limit/);
  assert.ok(change < LIMITS.change && body < LIMITS.body);
});

test('artifact adapter rejects extra entries, symlinks, directories, invalid UTF-8 and oversize', t => {
  const dir = mkdtempSync(join(tmpdir(), 'tap-updater-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = join(dir, 'candidate.json'), value = JSON.stringify(artifact());
  writeFileSync(data, value);
  assert.deepEqual(readArtifact(dir), artifact());
  assert.deepEqual(readArtifact(dir, Buffer.byteLength(value)), artifact());
  assert.throws(() => readArtifact(dir, Buffer.byteLength(value) - 1));
  writeFileSync(join(dir, 'extra'), 'unexpected');
  assert.throws(() => readArtifact(dir), /Unexpected artifact/);
  rmSync(join(dir, 'extra'));
  rmSync(data); mkdirSync(data);
  assert.throws(() => readArtifact(dir), /regular file/);
  rmSync(data, { recursive: true });
  symlinkSync('/does/not/exist', data);
  assert.throws(() => readArtifact(dir), /regular file/);
  rmSync(data); writeFileSync(data, Buffer.from([0xc0, 0xaf]));
  assert.throws(() => readArtifact(dir));
  writeFileSync(data, '{invalid json'); assert.throws(() => readArtifact(dir));
  const link = `${dir}-symlink`; symlinkSync(dir, link); t.after(() => rmSync(link));
  assert.throws(() => readArtifact(link), /directory/);
});

test('CLI binds the actual Git base, packages only the formula and emits no request for invalid data', t => {
  const dir = mkdtempSync(join(tmpdir(), 'tap-updater-cli-')), repo = join(dir, 'repository');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(repo); mkdirSync(join(repo, 'Formula'));
  // Synthetic Git objects avoid host identity/config and contain only fixture data.
  const git = (args, input) => execFileSync('git', args, { cwd: repo, input, encoding: 'utf8' }).trim();
  git(['init', '--quiet', '--initial-branch=main']);
  const blob = git(['hash-object', '-w', '--stdin'], base);
  const subtree = git(['mktree'], `100644 blob ${blob}\tbd-to-avp.rb\n`);
  const tree = git(['mktree'], `040000 tree ${subtree}\tFormula\n`);
  const sha = git(['hash-object', '-t', 'commit', '-w', '--stdin'],
    `tree ${tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nFixture\n`);
  git(['update-ref', 'refs/heads/main', sha]); git(['read-tree', '--reset', '-u', 'HEAD']);
  const livecheck = join(dir, 'livecheck.json'), output = join(dir, 'output'), summary = join(dir, 'summary');
  const cli = fileURLToPath(new URL('./updater-proposal.mjs', import.meta.url));
  const env = { ...process.env, ...environment, GITHUB_SHA: sha, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: repo, env, encoding: 'utf8' });
  writeFileSync(livecheck, JSON.stringify(record('1.9.9', false)));
  assert.equal(run('select', livecheck).status, 0);
  assert.match(readFileSync(output, 'utf8'), /update=false/);
  assert.match(readFileSync(summary, 'utf8'), /No proposal/);
  writeFileSync(livecheck, JSON.stringify(record()));
  writeFileSync(join(repo, FORMULA), candidate());
  const packaged = join(dir, 'candidate.json');
  assert.equal(run('package', livecheck, packaged).status, 0);
  assert.equal(JSON.parse(readFileSync(packaged)).base_sha, sha);
  writeFileSync(join(repo, 'unexpected'), 'extra source change');
  assert.notEqual(run('package', livecheck, join(dir, 'unexpected.json')).status, 0);
  rmSync(join(repo, 'unexpected')); writeFileSync(join(repo, FORMULA), base);
  const incoming = join(dir, 'incoming'); mkdirSync(incoming);
  writeFileSync(join(incoming, 'candidate.json'), JSON.stringify({ ...artifact(), base_sha: sha, run_id: 'another-run' }));
  const request = join(dir, 'request.json');
  const refused = run('prepare', incoming, request);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /exact run/);
  assert.equal(existsSync(request), false);
  env.GITHUB_SHA = '0'.repeat(40);
  assert.match(run('select', livecheck).stderr, /run SHA/);
});

test('stable release check reads only trusted upstream metadata and rejects unavailable/prerelease evidence', async () => {
  const release = { tag_name: 'v1.10.0', draft: false, prerelease: false, published_at: '2026-10-20T00:00:00Z' };
  const fake = value => async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/example/upstream/releases/tags/v1.10.0');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(value));
  };
  await verifyRelease(base, '1.10.0', fake(release));
  for (const changed of [{ prerelease: true }, { draft: true }, { tag_name: 'v2.0.0' }, { published_at: null }]) {
    await assert.rejects(verifyRelease(base, '1.10.0', fake({ ...release, ...changed })), /published stable/);
  }
  await assert.rejects(verifyRelease(base, '1.10.0', async () => new Response('{}', { status: 404 })), /HTTP 404/);
  await assert.rejects(verifyRelease(base, '1.10.0', async () => new Response('x'.repeat(64 * 1024 + 1))), /exceeds limit/);
  await assert.rejects(verifyRelease(base, '1.10.0', async () => { throw new Error('network unavailable'); }), /network unavailable/);
});

const response = disposition => ({
  status: 'ok', disposition, repository: context.repository,
  branch: `launchplane/updater/${'d'.repeat(64)}/${'e'.repeat(64)}`, head_sha: 'f'.repeat(40),
  pull_request_number: 42, pull_request_url: `https://github.com/${context.repository}/pull/42`,
});
test('actual response dispositions remain distinct, with closed replay and pending stated honestly', () => {
  for (const disposition of ['created', 'replayed', 'pending']) {
    const data = response(disposition), text = summarize(data, context.repository, '201', 'success');
    assert.ok(text.includes(data.pull_request_url)); assert.ok(text.includes(data.head_sha));
    assert.match(text, { created: /Created a proposal/, replayed: /does not imply.*open PR/, pending: /files were not applied/ }[disposition]);
  }
  for (const bad of [undefined, {}, { ...response('created'), disposition: 'applied' },
    { ...response('created'), repository: 'wrong/tap' }, { ...response('created'), head_sha: '<script>' },
    { ...response('created'), pull_request_number: '42' }, { ...response('created'), pull_request_url: 'https://evil.example' },
    { ...response('created'), branch: 'main\nInjected' }]) {
    assert.throws(() => summarize(bad, context.repository, '201', 'success'), /unconfirmed/);
  }
  for (const status of ['409', '403', '503', undefined, '201']) {
    assert.match(summarize(undefined, context.repository, status, 'failure'), /effect is unconfirmed/);
  }
});
