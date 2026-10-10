#!/usr/bin/env node
// Cloudflare DNS API CLI
//
// 認証 (環境変数):
//   CF_AT_TOKEN                 API トークン (推奨, Zone.DNS 編集権限)
//
// 使い方:
//   app/cli.js zones
//   app/cli.js list   <zone> [--type A] [--name www.example.com]
//   app/cli.js get    <zone> <recordId>
//   app/cli.js create <zone> <type> <name> <content> [--ttl 1] [--proxied] [--priority 10] [--comment text]
//   app/cli.js update <zone> <recordId> [--type A] [--name x] [--content y] [--ttl 1] [--proxied|--no-proxied] [--comment text]
//   app/cli.js upsert <zone> <type> <name> <content> [--ttl 1] [--proxied] [--priority 10] [--comment text]
//   app/cli.js delete <zone> <recordId>
//   app/cli.js export <zone>                     BIND 形式でエクスポート
//
// <zone> はゾーン名 (example.com) またはゾーン ID のどちらでも指定可能。
// <name> に "@" を指定するとゾーン名になり、"www" のような相対名は自動で FQDN に補完される。

import fs from 'fs';
import { createLogger } from '@jobscale/create-logger';
import { Cloudflare } from './cloudflare/index.js';

const { LOG_LEVEL } = process.env;

const logger = createLogger({ level: LOG_LEVEL });

const parseArgs = argv => {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--no-')) {
      opts[arg.slice(5)] = false;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opts[key] = true;
      else opts[key] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, opts };
};

const fqdn = (name, zoneName) => {
  if (name === undefined) return undefined;
  if (name === '@') return zoneName;
  if (name === zoneName || name.endsWith(`.${zoneName}`)) return name;
  return `${name}.${zoneName}`;
};

const buildRecord = (fields, opts, zoneName) => {
  const record = {
    type: fields.type?.toUpperCase(),
    name: fqdn(fields.name, zoneName),
    content: fields.content,
    ttl: Number.parseInt(opts.ttl, 10) || undefined,
    proxied: typeof opts.proxied === 'boolean' ? opts.proxied : undefined,
    priority: opts.priority !== undefined ? Number.parseInt(opts.priority, 10) : undefined,
    comment: opts.comment,
  };
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined));
};

const printRecords = records => {
  logger.table(records.map(r => ({
    id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied,
  })));
};

const usage = () => {
  const lines = fs.readFileSync(import.meta.filename, 'utf8').split('\n');
  logger.error(lines.slice(1, lines.indexOf('')).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(1);
};

const main = async () => {
  const { positional: [cmd, zone, ...args], opts } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === 'help' || opts.help) usage();
  const cf = new Cloudflare();
  const json = opts.json === true;
  const out = data => logger.log(JSON.stringify(data, null, 2));

  if (cmd === 'zones') {
    const zones = await cf.zones();
    if (json) return out(zones);
    return logger.table(zones.map(z => ({ id: z.id, name: z.name, status: z.status })));
  }
  if (!zone) usage();
  const zoneName = await cf.zoneName(zone);

  switch (cmd) {
  case 'list': {
    const records = await cf.list(zone, { type: opts.type?.toUpperCase(), name: fqdn(opts.name, zoneName) });
    return json ? out(records) : printRecords(records);
  }
  case 'get':
    if (!args[0]) usage();
    return out(await cf.get(zone, args[0]));
  case 'create':
  case 'upsert': {
    const [type, name, content] = args;
    if (!type || !name || !content) usage();
    const record = buildRecord({ type, name, content }, { ...opts }, zoneName);
    return out(await cf[cmd](zone, record));
  }
  case 'update': {
    if (!args[0]) usage();
    const record = buildRecord(opts, opts, zoneName);
    return out(await cf.update(zone, args[0], record));
  }
  case 'delete':
    if (!args[0]) usage();
    return out(await cf.delete(zone, args[0]));
  case 'export':
    return process.stdout.write(await cf.export(zone));
  default:
    return usage();
  }
};

main().catch(e => {
  logger.error(e.message);
  process.exit(1);
});
