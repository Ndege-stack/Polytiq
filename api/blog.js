// api/blog.js — Vercel Serverless Function
// Proxies Notion API so the secret key is never exposed to the client.
// Set NOTION_SECRET and NOTION_DATABASE_ID in your Vercel environment variables.

module.exports = async function handler(req, res) {
  // CORS — allow your own origin only in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // cache 5 min on CDN

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { NOTION_SECRET, NOTION_DATABASE_ID } = process.env;

  if (!NOTION_SECRET || !NOTION_DATABASE_ID) {
    return res.status(500).json({ error: 'Notion credentials not configured.' });
  }

  // If ?id=PAGE_ID is passed, return the full page blocks (for post detail view)
  const pageId = req.query.id;

  try {
    if (pageId) {
      // Fetch full page content (blocks)
      const blocksRes = await fetch(
        `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
        {
          headers: {
            'Authorization': `Bearer ${NOTION_SECRET}`,
            'Notion-Version': '2022-06-28',
          },
        }
      );
      const blocksData = await blocksRes.json();
      if (!blocksRes.ok) return res.status(blocksRes.status).json(blocksData);

      // Also fetch page metadata (title, date etc.)
      const metaRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        headers: {
          'Authorization': `Bearer ${NOTION_SECRET}`,
          'Notion-Version': '2022-06-28',
        },
      });
      const metaData = await metaRes.json();

      return res.status(200).json({ meta: metaData, blocks: blocksData.results });
    }

    // Otherwise fetch the database (post list), sorted by Date descending
    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_SECRET}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            property: 'Status',
            select: { equals: 'Published' },
          },
          sorts: [
            { property: 'Date', direction: 'descending' },
          ],
          page_size: 50,
        }),
      }
    );

    const data = await notionRes.json();
    if (!notionRes.ok) return res.status(notionRes.status).json(data);

    // Shape the response — only expose what the frontend needs
    const posts = data.results.map((page) => {
      const props = page.properties;
      return {
        id: page.id,
        title: props.Title?.title?.[0]?.plain_text ?? 'Untitled',
        excerpt: props.Excerpt?.rich_text?.[0]?.plain_text ?? '',
        date: props.Date?.date?.start ?? null,
        tags: props.Tags?.multi_select?.map((t) => t.name) ?? [],
        coverUrl: page.cover?.external?.url ?? page.cover?.file?.url ?? null,
      };
    });

    return res.status(200).json({ posts });

  } catch (err) {
    console.error('Notion API error:', err);
    return res.status(500).json({ error: 'Failed to fetch from Notion.' });
  }
}
