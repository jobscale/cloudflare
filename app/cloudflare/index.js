import CloudflareSDK from 'cloudflare';
import { createLogger } from '@jobscale/create-logger';

const { LOG_LEVEL } = process.env;

const logger = createLogger({ level: LOG_LEVEL });

export class Cloudflare {
  constructor() {
    const { env } = process;
    if (!env.CF_AT_TOKEN) {
      const e = new Error('CF_AT_TOKEN required', { cause: new Error('miss match environment') });
      logger.error(e.cause?.message ?? e.cause ?? e.message);
      throw e;
    }
    this.client = new CloudflareSDK({ apiToken: env.CF_AT_TOKEN });
    this.zoneCache = new Map();
  }

  async zones() {
    const zonesPage = await this.client.zones.list();
    const items = [];
    for await (const zone of zonesPage) {
      items.push(zone);
    }
    return items;
  }

  async zoneId(zone) {
    if (/^[0-9a-f]{32}$/.test(zone)) return zone;
    if (this.zoneCache.has(zone)) return this.zoneCache.get(zone);
    const zonesPage = await this.client.zones.list({ name: zone });
    for await (const z of zonesPage) {
      if (z.name === zone) {
        this.zoneCache.set(zone, z.id);
        return z.id;
      }
    }
    throw new Error(`zone not found: ${zone}`);
  }

  async zoneName(zone) {
    if (!/^[0-9a-f]{32}$/.test(zone)) return zone;
    if (this.zoneCache.has(zone)) return this.zoneCache.get(zone);
    const res = await this.client.zones.get({ zone_id: zone });
    this.zoneCache.set(zone, res.name);
    return res.name;
  }

  async list(zone, { type, name } = {}) {
    const recordsPage = await this.client.dns.records.list({
      zone_id: await this.zoneId(zone),
      type,
      name,
    });
    const items = [];
    for await (const record of recordsPage) {
      items.push(record);
    }
    return items;
  }

  async get(zone, id) {
    return this.client.dns.records.get(id, {
      zone_id: await this.zoneId(zone),
    });
  }

  async create(zone, record) {
    return this.client.dns.records.create({
      zone_id: await this.zoneId(zone),
      ...record,
    });
  }

  async update(zone, id, record) {
    return this.client.dns.records.edit(id, {
      zone_id: await this.zoneId(zone),
      ...record,
    });
  }

  async upsert(zone, record) {
    const [existing] = await this.list(zone, { type: record.type, name: record.name });
    return existing ? this.update(zone, existing.id, record) : this.create(zone, record);
  }

  async delete(zone, id) {
    return this.client.dns.records.delete(id, {
      zone_id: await this.zoneId(zone),
    });
  }

  async export(zone) {
    return this.client.dns.records.export({
      zone_id: await this.zoneId(zone),
    });
  }
}
