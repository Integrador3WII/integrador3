import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';

const db = new PGlite();
const admin = randomUUID(), customer = randomUUID(), operator = randomUUID(), inactive = randomUUID();
let category, product, variant;
before(async () => {
  await db.exec(await readFile(new URL('./fixtures/catalog-baseline.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261008005250_admin_catalog_inventory.sql', import.meta.url), 'utf8'));
  await db.query("insert into public.profiles(id,role,is_active) values ($1,'admin',true),($2,'customer',true),($3,'operator',true),($4,'admin',false)", [admin, customer, operator, inactive]);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  category = (await db.query("insert into categories(name,slug) values ('Prueba','prueba') returning id")).rows[0].id;
  product = (await db.query("insert into products(category_id,name,slug) values ($1,'Polera prueba','polera-prueba') returning id", [category])).rows[0].id;
  variant = (await db.query("insert into product_variants(product_id,sku,color_name,size_code,base_price) values ($1,'TEST-AZ-M','Azul','M',50) returning id", [product])).rows[0].id;
  await db.query("update products set status='active' where id=$1", [product]);
});
after(async () => { await db.close(); });

const move = (quantity, direction = 'in', id = randomUUID(), reason = 'Movimiento de prueba') => db.query(
  'select public.admin_record_inventory_movement($1,$2,$3,$4,$5) as result', [variant, id, direction, quantity, reason]
).then(r => r.rows[0].result);
const stock = () => db.query('select quantity_available from inventory where product_variant_id=$1', [variant]).then(r => r.rows[0].quantity_available);
const count = () => db.query('select count(*)::integer as n from inventory_movements').then(r => r.rows[0].n);

test('creates a zero-stock variant and fixes audit primary-key handling', async () => {
  assert.equal(await stock(), 0);
  await db.exec('reset role');
  const audit = await db.query("select record_id from audit_logs where table_name='inventory'");
  assert.equal(audit.rows[0].record_id, variant);
  await db.exec('set role authenticated');
});
test('rejects duplicate SKUs regardless of case', async () => {
  await assert.rejects(db.query("insert into product_variants(product_id,sku,color_name,size_code,base_price) values ($1,'test-az-m','Rojo','L',50)", [product]), { code: '23505' });
});
test('rejects duplicate product/color/size after trimming and case folding', async () => {
  await assert.rejects(db.query("insert into product_variants(product_id,sku,color_name,size_code,base_price) values ($1,'OTHER-SKU',' azul ','M',50)", [product]), { code: '23505' });
});
test('server rejects negative price and empty name without changing existing rows', async () => {
  await assert.rejects(db.query('update product_variants set base_price=-1 where id=$1', [variant]), { code: '23514' });
  await assert.rejects(db.query("update products set name=' ' where id=$1", [product]), { code: '23514' });
  assert.equal(Number((await db.query('select base_price from product_variants where id=$1', [variant])).rows[0].base_price), 50);
});
test('does not publish a product without active variants', async () => {
  await assert.rejects(db.query("insert into products(category_id,name,slug,status) values ($1,'Sin variantes','sin-variantes','active')", [category]), { code: '22023' });
});
test('RF06 CA1: 10 plus 5 equals 15 with immutable actor/reason/result', async () => {
  await move(10);
  const result = await move(5);
  assert.equal(await stock(), 15);
  assert.equal(result.quantity_after, 15); assert.equal(result.quantity_delta, 5);
  assert.equal(result.created_by, admin); assert.equal(result.reason, 'Movimiento de prueba'); assert.ok(result.created_at);
});
test('RF06 CA2: 15 minus 4 equals 11', async () => {
  await move(4, 'out'); assert.equal(await stock(), 11);
});
test('RF06 CA3: insufficient stock changes neither balance nor ledger', async () => {
  await move(9, 'out'); const before = await count();
  await assert.rejects(move(3, 'out'), { code: '22023' });
  assert.equal(await stock(), 2); assert.equal(await count(), before);
});
test('RF06 CA4: server rejects zero, negative, fractional, oversized quantity and invalid reason', async () => {
  for (const quantity of [0, -1, 1.5, 1000001, null, 'NaN', 'Infinity']) await assert.rejects(move(quantity), { code: '22023' });
  for (const reason of ['', '    ', 'a'.repeat(251), null]) await assert.rejects(move(1, 'in', randomUUID(), reason), { code: '22023' });
  assert.equal(await stock(), 2);
});
test('RF06 CA6: replays the exact operation without adding stock or another movement', async () => {
  const op = randomUUID(); const first = await move(5, 'in', op); const before = await count();
  const repeat = await move(5, 'in', op);
  assert.equal(first.id, repeat.id); assert.equal(await count(), before); assert.equal(await stock(), 7);
  await assert.rejects(move(6, 'in', op), { code: '22023' });
});
test('administrator cannot bypass the movement function or delete catalog/history', async () => {
  await assert.rejects(db.query('update inventory set quantity_available=999 where product_variant_id=$1', [variant]), { code: '42501' });
  await assert.rejects(db.query('delete from products where id=$1', [product]), { code: '42501' });
  await assert.rejects(db.query('delete from inventory_movements'), { code: '42501' });
  await assert.rejects(db.query("insert into inventory_movements(product_variant_id,movement_type,quantity_delta) values ($1,'purchase',9)", [variant]), { code: '42501' });
});
test('customers, operators and inactive administrators cannot record stock or create products', async () => {
  for (const actor of [customer, operator, inactive]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
    assert.equal((await db.query('select public.admin_catalog_access() as allowed')).rows[0].allowed, false);
    await assert.rejects(move(1), { code: '42501' });
    await assert.rejects(db.query("insert into products(category_id,name,slug) values ($1,'No permitido','no-permitido')", [category]), { code: '42501' });
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
});
test('anonymous callers cannot invoke the stock RPC and inactive categories hide public products/variants', async () => {
  await db.query('update categories set is_active=false where id=$1', [category]);
  await db.exec('set role anon');
  await assert.rejects(move(1), { code: '42501' });
  assert.equal((await db.query('select id from products')).rows.length, 0);
  assert.equal((await db.query('select id from product_variants')).rows.length, 0);
  await db.exec('set role authenticated');
  await db.query('update categories set is_active=true where id=$1', [category]);
});
test('deactivation preserves rows and prevents new stock movements', async () => {
  await db.query("update products set status='inactive' where id=$1", [product]);
  await assert.rejects(move(1), { code: '22023' });
  assert.equal((await db.query('select id from products where id=$1', [product])).rows.length, 1);
  assert.equal((await db.query('select id from product_variants where id=$1', [variant])).rows.length, 1);
});
test('balance reconciles with the recorded deltas', async () => {
  const sum = (await db.query('select sum(quantity_delta)::integer as sum from inventory_movements where product_variant_id=$1', [variant])).rows[0].sum;
  assert.equal(await stock(), sum);
});
// RF06 CA5 is executed with two real PostgreSQL sessions in workflows-postgres.cjs.
