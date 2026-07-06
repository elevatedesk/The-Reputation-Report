import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getDomain(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function buildDateRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 8);
  const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  return `cdr:1,cd_min:${fmt(start)},cd_max:${fmt(end)}`;
}

async function serpSearch({ q, num = 10, tbs = '' }) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_KEY is missing in Railway variables.');
  }
  const params = new URLSearchParams({
    engine: 'google',
    q,
    api_key: apiKey,
    num: String(num)
  });
  if (tbs) params.set('tbs', tbs);

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `SerpAPI request failed with status ${response.status}`);
  }
  return data;
}

function normalizeResults(data, mentionType = 'Search result') {
  const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
  return organic.map((item) => ({
    date: item.date || '',
    source: item.source || getDomain(item.link) || 'Unknown source',
    title: item.title || 'Untitled result',
    link: item.link || '',
    snippet: item.snippet || '',
    mentionType,
    status: 'Found',
    reputationValue: buildReputationValue(item, mentionType)
  }));
}

function buildReputationValue(item, mentionType) {
  const source = item.source || getDomain(item.link) || 'This source';
  if (/linkedin/i.test(source)) return 'First-page identity signal that connects the name to a professional profile.';
  if (/medium|authority|interview/i.test(`${source} ${item.title}`)) return 'Third-party editorial signal that can strengthen authority and AI confidence.';
  if (/daily record|award|ranking|best|top/i.test(`${source} ${item.title}`)) return 'Recognition signal that can support credibility, nominations, and search trust.';
  if (/clutch|designrush|manifest|directory/i.test(`${source} ${item.title}`)) return 'Directory or ranking signal that supports professional credibility.';
  if (mentionType === 'Recent mention') return 'Recent third-party mention that may support reputation momentum.';
  return 'Search visibility signal that should be reviewed for accuracy, relevance, and authority.';
}

function makeScore(results, hasKnowledgePanel) {
  const count = results.length;
  let score = 55 + Math.min(25, count * 3);
  if (hasKnowledgePanel) score += 10;
  return Math.min(95, score);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'EVG Snapshot API' });
});

app.post('/api/scan', async (req, res) => {
  try {
    const { fullName, analyzeName, linkedin, website, organization } = req.body || {};
    const name = (analyzeName || fullName || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const websiteDomain = getDomain(website);
    const tbs = buildDateRange();
    const exactQuery = `"${name}"`;
    const siteQuery = websiteDomain ? `"${name}" site:${websiteDomain}` : `"${name}" ${organization || ''}`.trim();
    const recentQuery = `"${name}" ${organization ? `OR "${organization}"` : ''} -site:linkedin.com -site:facebook.com -site:instagram.com`;

    const [exact, site, recent] = await Promise.all([
      serpSearch({ q: exactQuery, num: 10 }),
      serpSearch({ q: siteQuery, num: 10 }),
      serpSearch({ q: recentQuery, num: 10, tbs })
    ]);

    const exactResults = normalizeResults(exact, 'Identity / Google result');
    const siteResults = normalizeResults(site, 'Website / bio signal');
    const recentResults = normalizeResults(recent, 'Recent mention');

    const byLink = new Map();
    [...exactResults, ...siteResults, ...recentResults].forEach((result) => {
      if (result.link && !byLink.has(result.link)) byLink.set(result.link, result);
    });
    const mentions = [...byLink.values()].slice(0, 20);

    const kg = exact.knowledge_graph || exact.answer_box || null;
    const hasKnowledgePanel = Boolean(exact.knowledge_graph);

    res.json({
      ok: true,
      name,
      searchedAt: new Date().toISOString(),
      score: makeScore(mentions, hasKnowledgePanel),
      google: {
        exactQuery,
        websiteQuery: siteQuery,
        recentQuery,
        firstPage: exactResults.slice(0, 10),
        mentionsLast8Months: recentResults.slice(0, 12),
        allMentions: mentions
      },
      knowledgePanel: {
        detected: hasKnowledgePanel,
        title: kg?.title || '',
        type: kg?.type || kg?.subtitle || '',
        description: kg?.description || ''
      },
      aiVisibility: {
        status: 'Needs review',
        summary: 'AI visibility requires testing in ChatGPT, Gemini, Perplexity and Google AI results. This backend now gathers source material those tools may use.'
      },
      actionPlan: [
        'Confirm first-page Google results match the correct person.',
        'Review recent third-party mentions from the last 8 months.',
        'Check Knowledge Panel details for accuracy and ownership opportunities.',
        'Use strong mentions as bio proof points and nomination support.'
      ]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Scan failed.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`EVG Snapshot API running on port ${PORT}`);
});
