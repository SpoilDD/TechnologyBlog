import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'src', 'data', 'phonemes.json');
const outputRoot = path.join(rootDir, 'public', 'audio', 'phonetics');
const supportedAccents = ['en-GB', 'en-US'];
const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const accentArgumentIndex = args.indexOf('--accent');
const requestedAccent = accentArgumentIndex >= 0 ? args[accentArgumentIndex + 1] : null;

if (accentArgumentIndex >= 0 && !requestedAccent) {
  throw new Error('--accent 后需要填写 en-GB 或 en-US。');
}

if (requestedAccent && !supportedAccents.includes(requestedAccent)) {
  throw new Error(`不支持的口音 ${requestedAccent}，请使用 en-GB 或 en-US。`);
}

for (const filename of ['.env', '.env.local']) {
  try {
    const source = await readFile(path.join(rootDir, filename), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const sections = JSON.parse(await readFile(dataPath, 'utf8'));
const phonemes = sections.flatMap((section) => section.phonemes);
const accents = requestedAccent ? [requestedAccent] : supportedAccents;
const voices = {
  'en-GB': process.env.ESPEAK_VOICE_EN_GB || 'en-gb',
  'en-US': process.env.ESPEAK_VOICE_EN_US || 'en-us',
};
const speed = Number(process.env.ESPEAK_SPEED || 120);
const amplitude = Number(process.env.ESPEAK_AMPLITUDE || 170);

if (!Number.isFinite(speed) || speed < 80 || speed > 450) {
  throw new Error('ESPEAK_SPEED 必须是 80 到 450 之间的数字。');
}

if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > 200) {
  throw new Error('ESPEAK_AMPLITUDE 必须是 0 到 200 之间的数字。');
}

const duplicateIds = phonemes
  .map((phoneme) => phoneme.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length) throw new Error(`音标音频 ID 重复：${[...new Set(duplicateIds)].join(', ')}`);

for (const phoneme of phonemes) {
  for (const accent of supportedAccents) {
    if (!phoneme.espeak?.[accent]) throw new Error(`${phoneme.id} 缺少 ${accent} 的 eSpeak 音素映射。`);
  }
}

const jobs = accents.flatMap((accent) =>
  phonemes.map((phoneme) => ({
    accent,
    voice: voices[accent],
    phoneme,
    outputPath: path.join(outputRoot, accent, `${phoneme.id}.wav`),
  })),
);

if (dryRun) {
  console.log(`配置校验通过：${phonemes.length} 个音标，${jobs.length} 个离线音频任务。`);
  for (const accent of accents) console.log(`${accent}: ${voices[accent]} → public/audio/phonetics/${accent}/`);
  process.exit(0);
}

const executableCandidates = [
  process.env.ESPEAK_NG_PATH,
  process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'eSpeak NG', 'espeak-ng.exe') : null,
  process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'eSpeak NG', 'espeak-ng.exe') : null,
  'espeak-ng',
  'espeak',
].filter(Boolean);

let executable;
let version = '';

for (const candidate of [...new Set(executableCandidates)]) {
  try {
    const result = await execFileAsync(candidate, ['--version'], { windowsHide: true, encoding: 'utf8' });
    executable = candidate;
    const firstLine = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/)[0];
    version = firstLine.split(/\s+Data at:/i)[0];
    break;
  } catch {
    // Try the next common executable location.
  }
}

if (!executable) {
  throw new Error(
    '未找到 eSpeak NG。Windows 请先运行：winget install --id eSpeak-NG.eSpeak-NG --exact；也可以在 .env 中设置 ESPEAK_NG_PATH。',
  );
}

console.log(`使用 ${version || 'eSpeak NG'} 生成 WAV。`);

const synthesize = async (job) => {
  if (!force) {
    try {
      const existing = await stat(job.outputPath);
      if (existing.size > 44) return { status: 'skipped', job };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  await mkdir(path.dirname(job.outputPath), { recursive: true });
  const temporaryPath = `${job.outputPath}.${process.pid}.tmp.wav`;

  try {
    await execFileAsync(
      executable,
      [
        '-v', job.voice,
        '-s', String(speed),
        '-a', String(amplitude),
        '-p', '50',
        '-z',
        '-w', temporaryPath,
        `[[${job.phoneme.espeak[job.accent]}]]`,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );

    const generated = await stat(temporaryPath);
    if (generated.size <= 44) throw new Error('eSpeak NG 返回的 WAV 文件为空。');
    await rm(job.outputPath, { force: true });
    await rename(temporaryPath, job.outputPath);
    return { status: 'generated', job, bytes: generated.size };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    const detail = String(error?.stderr || error?.message || error).trim();
    throw new Error(`${job.accent} /${job.phoneme.ipa}/ 生成失败：${detail}`);
  }
};

const concurrency = 2;
const results = [];
let cursor = 0;

const worker = async () => {
  while (cursor < jobs.length) {
    const job = jobs[cursor];
    cursor += 1;
    const result = await synthesize(job);
    results.push(result);
    const marker = result.status === 'generated' ? '生成' : '跳过';
    console.log(`[${results.length}/${jobs.length}] ${marker} ${job.accent} /${job.phoneme.ipa}/`);
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

const manifest = {
  provider: 'eSpeak NG (offline)',
  generatedAt: new Date().toISOString(),
  version,
  outputFormat: 'WAV',
  speed,
  amplitude,
  accents: Object.fromEntries(accents.map((accent) => [accent, { voice: voices[accent], count: phonemes.length }])),
};

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const generatedCount = results.filter((result) => result.status === 'generated').length;
console.log(`完成：生成 ${generatedCount} 个，复用 ${results.length - generatedCount} 个。无需云服务或银行卡。`);
