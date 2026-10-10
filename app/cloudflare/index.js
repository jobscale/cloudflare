import CloudflareSDK from 'cloudflare';
import { createLogger } from '@jobscale/create-logger';

const { LOG_LEVEL, CF_AT_TOKEN } = process.env;

const logger = createLogger({ level: LOG_LEVEL });

export class Cloudflare {
  constructor() {
    if (!CF_AT_TOKEN) {
      const e = new Error('CF_AT_TOKEN required');
      logger.error(e.cause?.message ?? e.cause ?? e.message);
      throw e;
    }
    this.client = new CloudflareSDK({ apiToken: CF_AT_TOKEN });
    this.zoneCache = new Map();
  }

  // 1. ゾーン全件取得 (自動ページング対応)
  async zones() {
    const zonesPage = await this.client.zones.list();
    const items = [];
    for await (const zone of zonesPage) {
      items.push(zone);
    }
    return items;
  }

  // 2. ゾーン名からゾーンIDの取得
  async zoneId(zone) {
    if (/^[0-9a-f]{32}\$/.test(zone)) return zone;
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

  // 3. ゾーンIDからゾーン名の取得
  async zoneName(zone) {
    if (!/^[0-9a-f]{32}\$/.test(zone)) return zone;
    if (this.zoneCache.has(zone)) return this.zoneCache.get(zone);
    const res = await this.client.zones.get({ zone_id: zone });
    this.zoneCache.set(zone, res.name);
    return res.name;
  }

  // 4. DNS レコード一覧取得 (自動ページング対応)
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

  // 5. 特定のレコード単体取得
  async get(zone, id) {
    return this.client.dns.records.get(id, {
      zone_id: await this.zoneId(zone),
    });
  }

  // 6. レコード作成
  async create(zone, record) {
    return this.client.dns.records.create({
      zone_id: await this.zoneId(zone),
      ...record, // type, name, content などのオブジェクト
    });
  }

  // 7. レコード更新 (PATCH)
  async update(zone, id, record) {
    return this.client.dns.records.edit(id, {
      zone_id: await this.zoneId(zone),
      ...record,
    });
  }

  // 8. Upsert (※SDKにはupsertメソッドがないため、ロジックはそのまま維持)
  async upsert(zone, record) {
    const [existing] = await this.list(zone, { type: record.type, name: record.name });
    return existing ? this.update(zone, existing.id, record) : this.create(zone, record);
  }

  // 9. レコード削除
  async delete(zone, id) {
    return this.client.dns.records.delete(id, {
      zone_id: await this.zoneId(zone),
    });
  }

  // 10. BIND形式エクスポート (SDK v7時点では、export は別エンドポイントか未サポートの場合があるため、これだけ生の HTTP 呼び出しを残すか、または SDK 内の別メソッドを叩きます)
  async export(zone) {
    // SDK経由の場合:
    return this.client.dns.records.export({
      zone_id: await this.zoneId(zone),
    });
  }
}
