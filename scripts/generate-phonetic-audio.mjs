import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  'en-GB': process.env.AZURE_SPEECH_VOICE_EN_GB || 'en-GB-SoniaNeural',
  'en-US': process.env.AZURE_SPEECH_VOICE_EN_US || 'en-US-JennyNeural',
};

const duplicateIds = phonemes
  .map((phoneme) => phoneme.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length) throw new Error(`音标音频 ID 重复：${[...new Set(duplicateIds)].join(', ')}`);

for (const phoneme of phonemes) {
  for (const accent of supportedAccents) {
    if (!phoneme.speech?.[accent]) throw new Error(`${phoneme.id} 缺少 ${accent} 的 IPA 映射。`);
  }
}

const jobs = accents.flatMap((accent) =>
  phonemes.map((phoneme) => ({
    accent,
    voice: voices[accent],
    phoneme,
    outputPath: path.join(outputRoot, accent, `${phoneme.id}.mp3`),
  })),
);

if (dryRun) {
  console.log(`配置校验通过：${phonemes.length} 个音标，${jobs.length} 个音频任务。`);
  for (const accent of accents) console.log(`${accent}: ${voices[accent]} → public/audio/phonetics/${accent}/`);
  process.exit(0);
}

const speechKey = process.env.AZURE_SPEECH_KEY || process.env.SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION || process.env.SPEECH_REGION;

if (!speechKey || !speechRegion) {
  throw new Error(
    '缺少 Azure Speech 凭据。请在 .env 中配置 AZURE_SPEECH_KEY 和 AZURE_SPEECH_REGION，或使用同名环境变量。',
  );
}

const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
const outputFormat = 'audio-16khz-128kbitrate-mono-mp3';

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const makeSsml = ({ accent, voice, phoneme }) => `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(accent)}">
  <voice name="${escapeXml(voice)}">
    <break time="180ms" />
    <prosody rate="-15%"><phoneme alphabet="ipa" ph="${escapeXml(phoneme.speech[accent])}">${escapeXml(phoneme.word)}</phoneme></prosody>
    <break time="260ms" />
  </voice>
</speak>`;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const synthesize = async (job) => {
  if (!force) {
    try {
      const existing = await stat(job.outputPath);
      if (existing.size > 256) return { status: 'skipped', job };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  await mkdir(path.dirname(job.outputPath), { recursive: true });
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': outputFormat,
          'User-Agent': 'KiteAidan-Phonetics-Generator',
        },
        body: makeSsml(job),
      });

      if (!response.ok) {
        const detail = (await response.text()).trim();
        const error = new Error(`Azure Speech 返回 ${response.status}${detail ? `：${detail}` : ''}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length <= 256) throw new Error('Azure Speech 返回的音频文件异常小。');
      const temporaryPath = `${job.outputPath}.tmp`;
      await writeFile(temporaryPath, bytes);
      await rename(temporaryPath, job.outputPath);
      return { status: 'generated', job, bytes: bytes.length };
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === 3) break;
      await sleep(500 * (2 ** (attempt - 1)));
    }
  }

  throw new Error(`${job.accent} /${job.phoneme.ipa}/ 生成失败：${lastError?.message || lastError}`);
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
  provider: 'Azure Speech',
  generatedAt: new Date().toISOString(),
  outputFormat,
  accents: Object.fromEntries(accents.map((accent) => [accent, { voice: voices[accent], count: phonemes.length }])),
};

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const generatedCount = results.filter((result) => result.status === 'generated').length;
console.log(`完成：生成 ${generatedCount} 个，复用 ${results.length - generatedCount} 个。`);
