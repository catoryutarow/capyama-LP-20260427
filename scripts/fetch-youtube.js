// YouTube RSS フィードから @cap-yamamoto チャンネルの最新動画を取得し
// src/data/videos.json に焼き込むビルド時スクリプト。
//
// - API キー不要 (公式 RSS は公開エンドポイント)
// - 取得できるのは最新 15 本まで (RSS 仕様)
// - 失敗してもビルドを止めないよう exit 0 で抜ける (古い videos.json で継続)
//
// 実行: npm run fetch:videos

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_ID = 'UCVQXiH_rvB4WeAhJgE3CbuQ'; // @cap-yamamoto
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

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

async function run() {
  console.log(`[fetch-youtube] fetching ${FEED_URL}`);
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const xml = await res.text();
  const videos = parseFeed(xml);
  if (!videos.length) throw new Error('Feed parsed but no videos found');

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const payload = {
    fetchedAt: new Date().toISOString(),
    channelId: CHANNEL_ID,
    videos,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[fetch-youtube] wrote ${videos.length} videos -> ${OUT_PATH}`);
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
