import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';

const db = new PGlite();
before(async () => {
  // Minimal contract fixture: production authorization uses auth.uid() + profiles.
  await db.exec(`
    create role anon; create role authenticated;
    create schema private;
    create table public.profiles(id text primary key, role text, is_active boolean);
    insert into profiles values ('admin','admin',true),('inactive','admin',false),('customer','customer',true);
    create function private.is_admin() returns boolean language sql stable security definer set search_path='' as
    $$ select exists(select 1 from public.profiles where id=current_setting('request.jwt.claim.sub',true) and role='admin' and is_active) $$;
    create table public.orders(status text, created_at timestamptz, delivered_at timestamptz, total numeric);
  `);
  await db.exec(await readFile(new URL('../migrations/20261101190000_admin_order_metrics.sql', import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });
const identity = async (id) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
};
const snapshot = async () => (await db.query('select public.admin_order_metrics() as value')).rows[0].value;

test('active admin receives actual zeros for an empty database', async () => {
  await identity('admin');
  const result = await snapshot();
  assert.equal(result.orders_today, 0); assert.equal(result.delivered_amount_today, 0);
  assert.equal(result.timezone, 'America/La_Paz');
});
test('daily boundaries include Bolivia midnight and exclude next midnight; cancelled totals are excluded', async () => {
  await db.exec('reset role');
  await db.exec(`with bounds as (select date_trunc('day', now() at time zone 'America/La_Paz') at time zone 'America/La_Paz' as start)
    insert into orders(status,created_at,delivered_at,total)
    select 'delivered',start,start,100 from bounds union all
    select 'delivered',start-interval '1 second',start-interval '1 second',200 from bounds union all
    select 'delivered',start+interval '1 day',start+interval '1 day',300 from bounds union all
    select 'in_production',start,null,400 from bounds union all
    select 'cancelled',start,start,500 from bounds;`);
  await identity('admin');
  const result = await snapshot();
  assert.equal(result.orders_today, 3); assert.equal(result.in_production, 1);
  assert.equal(result.delivered_today, 1); assert.equal(result.delivered_amount_today, 100);
});
for (const id of ['customer','inactive','']) test(`rejects unauthorized identity: ${id || 'missing'}`, async () => {
  await identity(id); await assert.rejects(snapshot(), { code: '42501' });
});
test('anonymous role cannot execute even with an admin identity setting', async () => {
  await identity('admin'); await db.exec('reset role; set role anon');
  await assert.rejects(snapshot(), { code: '42501' });
});
