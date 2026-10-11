import { createLogger } from '@jobscale/create-logger';

const { LOG_LEVEL, CF_AT_TOKEN } = process.env;

const logger = createLogger({ level: LOG_LEVEL });
const API = 'https://api.cloudflare.com/client/v4';

export class Cloudflare {
  constructor() {
    if (!CF_AT_TOKEN) {
      const e = new Error('CF_AT_TOKEN required');
      logger.error(e.cause?.message ?? e.cause ?? e.message);
      throw e;
    }
    this.headers = { Authorization: `Bearer ${CF_AT_TOKEN}` };
    this.zoneCache = new Map();
  }

  async request(method, uri, { query, body, raw } = {}) {
    const url = new URL(`${API}${uri}`);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      method,
      headers: { ...this.headers, ...body ? { 'Content-Type': 'application/json' } : {} },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      return res.text();
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const errors = (json.errors || []).map(e => `[${e.code}] ${e.message}`).join(', ');
      throw new Error(`${method} ${uri} failed: ${res.status} ${errors || res.statusText}`);
    }
    return json;
  }

  async paginate(uri, query = {}) {
    const items = [];
    for (let page = 1; ; page++) {
      const { result, result_info: info } = await this.request('GET', uri, { query: { ...query, page, per_page: 100 } });
      items.push(...result);
      if (!info || page >= info.total_pages) return items;
    }
  }

  zones() {
    return this.paginate('/zones');
  }

  async zoneId(zone) {
    if (/^[0-9a-f]{32}$/.test(zone)) return zone;
    if (this.zoneCache.has(zone)) return this.zoneCache.get(zone);
    const { result } = await this.request('GET', '/zones', { query: { name: zone } });
    if (!result.length) throw new Error(`zone not found: ${zone}`);
    this.zoneCache.set(zone, result[0].id);
    return result[0].id;
  }

  async zoneName(zone) {
    if (!/^[0-9a-f]{32}$/.test(zone)) return zone;
    if (this.zoneCache.has(zone)) return this.zoneCache.get(zone);
    const { result } = await this.request('GET', `/zones/${zone}`);
    this.zoneCache.set(zone, result.name);
    return result.name;
  }

  async list(zone, { type, name } = {}) {
    return this.paginate(`/zones/${await this.zoneId(zone)}/dns_records`, { type, name });
  }

  async get(zone, id) {
    const { result } = await this.request('GET', `/zones/${await this.zoneId(zone)}/dns_records/${id}`);
    return result;
  }

  async create(zone, record) {
    const { result } = await this.request('POST', `/zones/${await this.zoneId(zone)}/dns_records`, { body: record });
    return result;
  }

  async update(zone, id, record) {
    const { result } = await this.request('PATCH', `/zones/${await this.zoneId(zone)}/dns_records/${id}`, { body: record });
    return result;
  }

  async upsert(zone, record) {
    const [existing] = await this.list(zone, { type: record.type, name: record.name });
    return existing ? this.update(zone, existing.id, record) : this.create(zone, record);
  }

  async delete(zone, id) {
    const { result } = await this.request('DELETE', `/zones/${await this.zoneId(zone)}/dns_records/${id}`);
    return result;
  }

  async export(zone) {
    return this.request('GET', `/zones/${await this.zoneId(zone)}/dns_records/export`, { raw: true });
  }
}
