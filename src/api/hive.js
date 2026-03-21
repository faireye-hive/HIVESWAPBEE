export const DEFAULT_HIVE_RPC = 'https://api.deathwing.me';

export function getHiveRpc() {
  return localStorage.getItem('hiveswapbee_hive_rpc') || DEFAULT_HIVE_RPC;
}

export function setHiveRpc(url) {
  localStorage.setItem('hiveswapbee_hive_rpc', url);
}

/**
 * Generic Hive API call using condensing_api or bridge
 */
export async function hiveCall(method, params = []) {
  const rpc = getHiveRpc();
  const body = {
    jsonrpc: '2.0',
    id: Math.floor(Date.now() / 1000),
    method,
    params,
  };

  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Hive RPC Error');
  return json.result;
}

/** Get mainnet HIVE balance for an account */
export async function getHiveBalance(account) {
  const result = await hiveCall('condenser_api.get_accounts', [[account]]);
  if (!result || result.length === 0) return null;
  return result[0].balance; // e.g. "10.000 HIVE"
}

/** Get ranked posts from the bridge API for a tag (tribe) */
export async function getRankedPosts(sort = 'created', tag = '', limit = 20) {
  return hiveCall('bridge.get_ranked_posts', {
    sort,
    tag,
    observer: '',
  });
}

const SCOT_API_URL = "https://smt-api.enginerpc.com";

export const getHivePosts = async (
  token = 'CENT',
  sort = 'created',
  limit = 20,
  start_author = null,
  start_permlink = null
) => {
  const query = new URLSearchParams({
    limit: limit.toString(),
    token: token.toUpperCase(),
  });

  if (start_author) query.append('start_author', start_author);
  if (start_permlink) query.append('start_permlink', start_permlink);

  try {
    const response = await fetch(`${SCOT_API_URL}/get_discussions_by_${sort}?${query.toString()}`);
    const data = await response.json();

    if (Array.isArray(data)) {
      return data;
    }
    return [];
  } catch (error) {
    console.error("Scot API Error:", error);
    return [];
  }
};

export const getScotPost = async (author, permlink, token = 'CENT') => {
  try {
    const response = await fetch(`${SCOT_API_URL}/@${author}/${permlink}?token=${token}`);
    const rawData = await response.json();

    let data = rawData;
    if (rawData && rawData[token]) {
      data = rawData[token];
    }

    if (data && data.author) {
      if (!data.vote_rshares || Number(data.vote_rshares) === 0) {
        try {
          const feedRes = await fetch(`${SCOT_API_URL}/get_discussions_by_author?token=${token}&author=${author}&limit=50`);
          const feedData = await feedRes.json();
          if (Array.isArray(feedData)) {
            const found = feedData.find(p => p.permlink === permlink);
            if (found) {
              return found;
            }
          }
        } catch (e) { }
      }
      return data;
    }
    return null;
  } catch (error) {
    console.error("Scot Single Post Error:", error);
    return null;
  }
};

export const getPostContent = async (author, permlink) => {
  try {
    const body = {
      jsonrpc: "2.0",
      method: "condenser_api.get_content",
      params: [author, permlink],
      id: 1,
    };

    const response = await fetch(getHiveRpc(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error("Hive Content Error:", error);
    return null;
  }
};
