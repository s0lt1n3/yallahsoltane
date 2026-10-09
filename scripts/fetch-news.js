/**
 * Fetch multiple RSS feeds, dedupe, sort by pubDate and write data.json
 */
import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import fetch from 'node-fetch';

const parser = new Parser({
  requestOptions: {
    timeout: 15000
  }
});

const FEEDS = [
  'http://www.skysports.com/rss/12040',
  'https://www.espn.com/espn/rss/soccer/news',
  'https://www.beinsports.com/en/rss',
  'https://www.canalplus.com/rss.xml',
  'https://feeds.foxsports.com/fox-sports/football?format=xml'
];

async function parseFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    if (!feed || !feed.items) return [];
    return feed.items.map((i) => ({
      title: i.title || '',
      link: i.link || '',
      pubDate: i.pubDate ? new Date(i.pubDate).toISOString() : (i.isoDate || null),
      description: i.contentSnippet || i.content || i.summary || '',
      source: feed.title || url
    }));
  } catch (err) {
    try {
      const conv = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
      const res = await fetch(conv, { timeout: 15000 });
      const json = await res.json();
      if (!json || !Array.isArray(json.items)) return [];
      return json.items.map((i) => ({
        title: i.title || '',
        link: i.link || '',
        pubDate: i.pubDate ? new Date(i.pubDate).toISOString() : null,
        description: i.description || '',
        source: json.feed && json.feed.title ? json.feed.title : url
      }));
    } catch (e) {
      return [];
    }
  }
}

function dedupeAndSort(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = it.link || `${it.title}-${it.pubDate || ''}`;
    if (!map.has(key)) {
      map.set(key, it);
    } else {
      const existing = map.get(key);
      if (it.pubDate && (!existing.pubDate || new Date(it.pubDate) > new Date(existing.pubDate))) {
        map.set(key, it);
      }
    }
  });
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });
  return arr;
}

async function main() {
  console.log('Fetching', FEEDS.length, 'feeds...');
  const tasks = FEEDS.map((url) => parseFeed(url).catch(() => []));
  const results = await Promise.all(tasks);
  const merged = results.flat();
  const items = dedupeAndSort(merged).slice(0, 200);

  const out = {
    updatedAt: new Date().toISOString(),
    items: items.map((it) => ({
      title: it.title || '',
      link: it.link || '',
      pubDate: it.pubDate || null,
      description: it.description || '',
      source: it.source || ''
    }))
  };

  const filePath = path.resolve(process.cwd(), 'data.json');
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  const newContent = JSON.stringify(out, null, 2);

  if (existing && existing.trim() === newContent.trim()) {
    console.log('No changes to data.json');
    return;
  }

  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('Wrote data.json with', out.items.length, 'items');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
