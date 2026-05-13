// YouTube RSS フィードから @cap-yamamoto チャンネルの最新動画を取得し
// Shorts を除外した「長編のみ」を src/data/videos.json に焼き込むビルド時スクリプト。
//
// - API キー不要 (公式 RSS と /shorts/ エンドポイントのみ使用)
// - 取得できるのは最新 15 本まで (RSS 仕様)
// - Shorts 判別: /shorts/{id} に HEAD → 200 なら Short、303 なら長編 (YouTube は長編URLにリダイレクト)
// - 失敗してもビルドを止めないよう exit 0。長編が 0 本になる場合は既存 videos.json を維持する。
//
// 実行: npm run fetch:videos

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_ID = 'UCVQXiH_rvB4WeAhJgE3CbuQ'; // @cap-yamamoto
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const SHORTS_PROBE = (id) => `https://www.youtube.com/shorts/${id}`;
const PROBE_TIMEOUT_MS = 8000;

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(here, '../src/data/videos.json');

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pick(block, re) {
  const m = block.match(re);
  return m ? decodeEntities(m[1].trim()) : null;
}

function parseFeed(xml) {
  const videos = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const id = pick(block, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    const title = pick(block, /<title>([\s\S]*?)<\/title>/);
    const published = pick(block, /<published>([^<]+)<\/published>/);
    if (!id || !title) continue;
    videos.push({
      id,
      title,
      published,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }
  return videos;
}

// /shorts/{id} の HEAD で長編判定。
// 200 → Shorts (この URL で再生可能), 30x → 長編 (/watch?v=... へリダイレクト)
// 判定不能 (timeout / network error) は null を返す。呼び出し側で Short 扱いにする (保守的)。
async function isLongForm(videoId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(SHORTS_PROBE(videoId), {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    return res.status !== 200;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  console.log(`[fetch-youtube] fetching ${FEED_URL}`);
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const xml = await res.text();
  const allVideos = parseFeed(xml);
  if (!allVideos.length) throw new Error('Feed parsed but no videos found');

  console.log(`[fetch-youtube] parsed ${allVideos.length} videos, probing for Shorts...`);
  const probes = await Promise.all(
    allVideos.map(async (v) => ({ video: v, isLong: await isLongForm(v.id) }))
  );

  const longForm = probes.filter((p) => p.isLong === true).map((p) => p.video);
  const shorts = probes.filter((p) => p.isLong === false).length;
  const unknown = probes.filter((p) => p.isLong === null).length;
  console.log(`[fetch-youtube] long-form=${longForm.length}, shorts=${shorts}, unknown=${unknown}`);

  if (!longForm.length) {
    throw new Error('No long-form videos after filtering — keeping existing videos.json');
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const payload = {
    fetchedAt: new Date().toISOString(),
    channelId: CHANNEL_ID,
    videos: longForm,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[fetch-youtube] wrote ${longForm.length} long-form videos -> ${OUT_PATH}`);
}

run().catch((err) => {
  console.error('[fetch-youtube] failed:', err.message);
  if (!existsSync(OUT_PATH)) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(
      OUT_PATH,
      JSON.stringify({ fetchedAt: null, channelId: CHANNEL_ID, videos: [] }, null, 2) + '\n',
      'utf8'
    );
  }
  process.exit(0);
});
