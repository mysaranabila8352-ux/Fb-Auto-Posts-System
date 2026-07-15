const fetch = require('node-fetch');

const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION || 'v20.0';
const PAGE_ID = process.env.FB_PAGE_ID;
const ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// Mock mode simulates successful Facebook posts without ever calling the real
// Graph API. It kicks in automatically when no Page ID/token is configured,
// or can be forced on with MOCK_MODE=true in .env (useful for testing even
// if real credentials are present).
const MOCK_MODE = process.env.MOCK_MODE === 'true' || !PAGE_ID || !ACCESS_TOKEN;

function isMockMode() {
  return MOCK_MODE;
}

/**
 * Publishes a post to the configured Facebook Page.
 * If imageUrl is provided, posts a photo with caption; otherwise a plain text/link post.
 * Returns { success: boolean, fbPostId?: string, error?: string, mock?: boolean }
 */
async function publishPost({ content, imageUrl }) {
  if (MOCK_MODE) {
    // Simulate network latency briefly so the UI/logs behave realistically.
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      success: true,
      fbPostId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      mock: true
    };
  }

  const endpoint = imageUrl
    ? `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/photos`
    : `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/feed`;

  const body = imageUrl
    ? { url: imageUrl, caption: content, access_token: ACCESS_TOKEN }
    : { message: content, access_token: ACCESS_TOKEN };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const errMsg = data.error ? `${data.error.message} (code ${data.error.code})` : `HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    // /feed returns { id }, /photos returns { id, post_id }
    const fbPostId = data.post_id || data.id;
    return { success: true, fbPostId };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown network error' };
  }
}

module.exports = { publishPost, isMockMode };
