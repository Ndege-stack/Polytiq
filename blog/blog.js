/**
 * blog.js — The Polytiq
 * Handles both the blog listing page (/blog/) and the post detail page (/blog/post.html?id=…)
 * All Notion API calls go through /api/blog — the secret never touches the browser.
 */

const API = '/api/blog';

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function richTextToHtml(richTextArr = []) {
  return richTextArr.map(({ plain_text, annotations, href }) => {
    let text = plain_text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (annotations?.bold)          text = `<strong>${text}</strong>`;
    if (annotations?.italic)        text = `<em>${text}</em>`;
    if (annotations?.code)          text = `<code>${text}</code>`;
    if (annotations?.strikethrough) text = `<s>${text}</s>`;
    if (href)                       text = `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
    return text;
  }).join('');
}

// Convert Notion blocks → HTML string
function blocksToHtml(blocks) {
  let html = '';
  let listBuffer = { type: null, items: [] };

  const flushList = () => {
    if (!listBuffer.items.length) return;
    const tag = listBuffer.type === 'bulleted_list_item' ? 'ul' : 'ol';
    html += `<${tag}>${listBuffer.items.join('')}</${tag}>`;
    listBuffer = { type: null, items: [] };
  };

  for (const block of blocks) {
    const { type } = block;
    const content = block[type];

    // Handle lists — buffer consecutive items
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      if (listBuffer.type && listBuffer.type !== type) flushList();
      listBuffer.type = type;
      listBuffer.items.push(`<li>${richTextToHtml(content?.rich_text)}</li>`);
      continue;
    }
    flushList();

    switch (type) {
      case 'paragraph':
        html += `<p>${richTextToHtml(content?.rich_text) || '&nbsp;'}</p>`;
        break;
      case 'heading_1':
        html += `<h2>${richTextToHtml(content?.rich_text)}</h2>`;
        break;
      case 'heading_2':
        html += `<h2>${richTextToHtml(content?.rich_text)}</h2>`;
        break;
      case 'heading_3':
        html += `<h3>${richTextToHtml(content?.rich_text)}</h3>`;
        break;
      case 'quote':
        html += `<blockquote>${richTextToHtml(content?.rich_text)}</blockquote>`;
        break;
      case 'code':
        html += `<pre><code>${richTextToHtml(content?.rich_text)}</code></pre>`;
        break;
      case 'divider':
        html += `<hr>`;
        break;
      case 'image': {
        const src = content?.external?.url ?? content?.file?.url ?? '';
        const caption = content?.caption?.[0]?.plain_text ?? '';
        html += `<figure style="margin:32px 0;">
          <img src="${src}" alt="${caption}" style="width:100%;border-radius:4px;">
          ${caption ? `<figcaption style="font-size:0.8rem;opacity:0.5;margin-top:8px;">${caption}</figcaption>` : ''}
        </figure>`;
        break;
      }
      case 'callout': {
        const icon = content?.icon?.emoji ?? '💡';
        html += `<div style="background:rgba(0,0,0,0.04);border-radius:6px;padding:16px 20px;margin:24px 0;display:flex;gap:12px;">
          <span>${icon}</span>
          <span>${richTextToHtml(content?.rich_text)}</span>
        </div>`;
        break;
      }
      default:
        // Silently skip unsupported block types
        break;
    }
  }
  flushList();
  return html;
}

// ─── Blog Listing Page (/blog/index.html) ────────────────────────────────────

async function renderBlogList() {
  const list = document.getElementById('blog-list');
  if (!list) return;

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const { posts } = await res.json();

    if (!posts || posts.length === 0) {
      list.innerHTML = '<p class="empty-state">No posts published yet — check back soon.</p>';
      return;
    }

    list.innerHTML = posts.map((post) => `
      <a class="post-card" href="post.html?id=${post.id}">
        <div class="post-meta">
          <span>${formatDate(post.date)}</span>
          ${post.tags.map(t => `<span class="post-tag">${t}</span>`).join('')}
        </div>
        <p class="post-title">${post.title}</p>
        ${post.excerpt ? `<p class="post-excerpt">${post.excerpt}</p>` : ''}
      </a>
    `).join('');

  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="error-state">Unable to load posts at this time. Please try again shortly.</p>';
  }
}

// ─── Post Detail Page (/blog/post.html?id=…) ─────────────────────────────────

async function renderPost() {
  const titleEl  = document.getElementById('post-title');
  const metaEl   = document.getElementById('post-meta');
  const bodyEl   = document.getElementById('post-body');
  const coverEl  = document.getElementById('post-cover');
  if (!titleEl || !bodyEl) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    titleEl.textContent = 'Post not found.';
    bodyEl.innerHTML = '<p>No post ID was provided.</p>';
    return;
  }

  try {
    const res = await fetch(`${API}?id=${id}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const { meta, blocks } = await res.json();

    const props  = meta.properties;
    const title  = props.Title?.title?.[0]?.plain_text ?? 'Untitled';
    const date   = props.Date?.date?.start ?? null;
    const tags   = props.Tags?.multi_select?.map(t => t.name) ?? [];
    const cover  = meta.cover?.external?.url ?? meta.cover?.file?.url ?? null;

    // Update page title
    document.title = `${title} | The Polytiq`;

    // Render cover
    if (cover && coverEl) {
      coverEl.src = cover;
      coverEl.style.display = 'block';
    }

    // Render meta
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${formatDate(date)}</span>
        ${tags.map(t => `<span class="post-tag">${t}</span>`).join('')}
      `;
    }

    // Render title
    titleEl.textContent = title;

    // Render body
    bodyEl.innerHTML = blocksToHtml(blocks);

  } catch (err) {
    console.error(err);
    titleEl.textContent = 'Failed to load post.';
    bodyEl.innerHTML = '<p>Something went wrong. Please try again.</p>';
  }
}

// ─── Router: detect which page we're on ──────────────────────────────────────

if (document.getElementById('blog-list')) {
  renderBlogList();
} else if (document.getElementById('post-body')) {
  renderPost();
}
