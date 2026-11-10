import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
const db = new PGlite();
const admin=randomUUID(), customer=randomUUID(), inactive=randomUUID();
let variant;
before(async () => {
  await db.exec(await readFile(new URL('./fixtures/order-quote-baseline.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261101184030_admin_order_quote_workflows.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261101185431_admin_inventory_movement_api.sql', import.meta.url),'utf8'));
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(name =>
    /^(20261102|20261110183[012]00).*\.sql$/.test(name)
  ).sort()) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
  await db.query('insert into auth.users values ($1),($2),($3)',[admin,customer,inactive]);
  await db.query("insert into profiles(id,role,is_active) values ($1,'admin',true),($2,'customer',true),($3,'admin',false)",[admin,customer,inactive]);
  const cat=(await db.query("insert into categories(name,slug) values ('Test','test') returning id")).rows[0].id;
  const product=(await db.query("insert into products(category_id,name,slug,status) values ($1,'Polera','polera','active') returning id",[cat])).rows[0].id;
  variant=(await db.query("insert into product_variants(product_id,sku,color_name,size_code,base_price,status) values ($1,'TEST','Azul','M',50,'active') returning id",[product])).rows[0].id;
});
after(async()=>db.close());
async function asUser(id=admin) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); }
async function order(status='confirmed') {
  await db.exec('reset role');
  return (await db.query('insert into orders(customer_id,status) values ($1,$2) returning id',[customer,status])).rows[0].id;
}
const move=(id,status,note='Prueba de transición')=>db.query('select transition_order_status($1,$2,$3)',[id,status,note]);
async function quote(quantity=2) {
  await db.exec('reset role');
  const id=(await db.query('insert into quotes(customer_id) values ($1) returning id',[customer])).rows[0].id;
  const item=(await db.query('insert into quote_items(quote_id,product_variant_id,quantity) values ($1,$2,$3) returning id',[id,variant,quantity])).rows[0].id;
  await db.query("update quotes set status='submitted' where id=$1",[id]);
  return {id,item};
}
const send=(q,discount=0,price=50)=>db.query("select admin_send_quote($1,$2,$3,10,(now() at time zone 'America/La_Paz')::date+7)",[q.id,JSON.stringify([{id:q.item,unit_price:price}]),discount]);
const convert=id=>db.query('select convert_quote_to_order($1) id',[id]).then(r=>r.rows[0].id);
test('valid transition writes exactly one history event with actor and note; retry adds nothing',async()=>{
  const id=await order(); await asUser(); await move(id,'in_production'); await move(id,'in_production');
  const events=(await db.query('select * from order_status_history where order_id=$1 and from_status is not null',[id])).rows;
  assert.equal(events.length,1); assert.equal(events[0].changed_by,admin); assert.equal(events[0].note,'Prueba de transición');
});
test('terminal states cannot reopen and invalid jumps do not change orders',async()=>{
  for(const status of ['delivered','cancelled','confirmed']) { const id=await order(status); await asUser(); await assert.rejects(move(id,status==='confirmed'?'delivered':'confirmed'),{code:'22023'}); }
});
test('customers and inactive admins cannot change a state; authenticated direct updates are blocked',async()=>{
  const id=await order();
  for(const actor of [customer,inactive]) { await asUser(actor); await assert.rejects(move(id,'in_production')); }
  await asUser(); await assert.rejects(db.query("update orders set status='delivered' where id=$1",[id]),{code:'42501'});
});
test('quality approval is required before ready and delivery only follows ready',async()=>{
  const id=await order(); await asUser(); await move(id,'in_production'); await move(id,'quality_check');
  await assert.rejects(move(id,'ready'),/calidad aprobado/);
  await db.exec('reset role');
  await db.query("insert into quality_checks(order_id,performed_by,result) values ($1,$2,'approved')",[id,admin]);
  await asUser(); await move(id,'ready'); await move(id,'delivered');
});
test('cancellation requires a reason and releases stock exactly once on retry',async()=>{
  const id=await order(); await db.exec('reset role');
  await db.query("insert into order_items(order_id,product_variant_id,product_name_snapshot,sku_snapshot,color_snapshot,size_snapshot,quantity,unit_price) values ($1,$2,'Polera','TEST','Azul','M',2,50)",[id,variant]);
  const before=(await db.query('select quantity_available from inventory where product_variant_id=$1',[variant])).rows[0].quantity_available;
  await asUser(); await assert.rejects(move(id,'cancelled',''),/motivo/);
  await move(id,'cancelled','Cancelación solicitada'); await move(id,'cancelled','Cancelación solicitada');
  assert.equal((await db.query('select quantity_available from inventory where product_variant_id=$1',[variant])).rows[0].quantity_available,before+2);
  assert.equal((await db.query("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[id])).rows[0].n,1);
});
test('sent offer freezes prices despite catalog changes; rejects later price edits and status bypass',async()=>{
  const q=await quote(); await asUser(); await send(q,5,45.25);
  await db.exec('reset role'); await db.query('update product_variants set base_price=999 where id=$1',[variant]);
  const total=(await db.query('select total from v_quote_totals where id=$1',[q.id])).rows[0].total;
  assert.equal(Number(total),95.5);
  await asUser();
  await assert.rejects(db.query('update quote_items set unit_price_override=1 where id=$1',[q.item]),{code:'22023'});
  await assert.rejects(db.query("update quotes set status='approved' where id=$1",[q.id]),{code:'42501'});
});
test('invalid discount rolls back snapshots and status; unauthorized send is rejected',async()=>{
  const q=await quote(); await asUser(); await assert.rejects(send(q,101,50),/descuento/);
  assert.equal((await db.query('select unit_price_snapshot from quote_items where id=$1',[q.item])).rows[0].unit_price_snapshot,null);
  assert.equal((await db.query('select status from quotes where id=$1',[q.id])).rows[0].status,'submitted');
  await assert.rejects(send(q,0,1.234),{code:'22023'});
  for (const actor of [customer,inactive]) { await asUser(actor); await assert.rejects(send(q),{code:'42501'}); }
});
test('flat, per-item and per-unit services retain their prices and two-decimal total',async()=>{
  const q=await quote();
  for(const [mode,price] of [['flat',3.33],['per_item',2.22],['per_unit',1.12]]) {
    const service=(await db.query('insert into customization_services(code,name,pricing_mode,unit_price) values ($1,$2,$3,$4) returning id',['QA-'+mode.toUpperCase(),mode,mode,price])).rows[0].id;
    await db.query('insert into quote_item_services(quote_item_id,service_id,units) values ($1,$2,3)',[q.item,service]);
  }
  await asUser(); await send(q); await db.exec('reset role');
  await db.query('update customization_services set unit_price=999');
  assert.equal(Number((await db.query('select total from v_quote_totals where id=$1',[q.id])).rows[0].total),121.13);
});
test('approved conversion is idempotent and creates stock movement and production tasks once',async()=>{
  const q=await quote(); await db.query('update inventory set quantity_available=10 where product_variant_id=$1',[variant]);
  await asUser(); await send(q); await assert.rejects(convert(q.id),/aprobada/);
  await asUser(customer); await db.query('select respond_to_quote($1,true)',[q.id]);
  await assert.rejects(convert(q.id),/administrador/);
  await asUser(); const id=await convert(q.id); assert.equal(await convert(q.id),id);
  assert.equal((await db.query('select quantity_available from inventory where product_variant_id=$1',[variant])).rows[0].quantity_available,8);
  assert.equal((await db.query('select count(*)::int n from production_tasks where order_id=$1',[id])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='sale'",[id])).rows[0].n,1);
  assert.equal(Number((await db.query('select total from orders where id=$1',[id])).rows[0].total),110);
});
test('insufficient stock leaves no order, task, or inventory deduction',async()=>{
  const q=await quote(100); await asUser(); await send(q); await asUser(customer); await db.query('select respond_to_quote($1,true)',[q.id]);
  await asUser(); await assert.rejects(convert(q.id),/Stock insuficiente/);
  assert.equal((await db.query('select count(*)::int n from orders where quote_id=$1',[q.id])).rows[0].n,0);
  assert.equal((await db.query('select quantity_available from inventory where product_variant_id=$1',[variant])).rows[0].quantity_available,8);
});
test('deployed movement API validates stock, rejects customers and replays the same operation once',async()=>{
  const operation=randomUUID(); await asUser();
  const call=()=>db.query("select admin_record_inventory_movement($1,$2,'in',3,'Compra de prueba') result",[variant,operation]);
  const first=(await call()).rows[0].result; const second=(await call()).rows[0].result;
  assert.equal(first.id,second.id); assert.equal(first.quantity_after,11);
  await assert.rejects(db.query("select admin_record_inventory_movement($1,$2,'out',12,'Salida de prueba')",[variant,randomUUID()]),/Stock insuficiente/);
  await asUser(customer); await assert.rejects(call(),{code:'42501'});
});

test('cancellation restores the original finished stock after switching the variant to made to order', async () => {
  const q = await quote();
  await asUser();
  await send(q);
  await asUser(customer);
  await db.query('select respond_to_quote($1,true)', [q.id]);
  await asUser();
  const stock = async () => (await db.query(
    'select quantity_available from inventory where product_variant_id=$1', [variant]
  )).rows[0].quantity_available;
  const before = await stock();
  const id = await convert(q.id);
  assert.equal(await stock(), before - 2);

  const material = (await db.query("select admin_create_material('TEL-01','Tela','m') id")).rows[0].id;
  await db.query('select admin_save_recipe($1,$2)', [
    variant, JSON.stringify([{ material_id: material, quantity_per_unit: 1.5, waste_percent: 10 }])
  ]);
  await db.query("select admin_set_variant_fulfillment($1,'made_to_order')", [variant]);
  await move(id, 'cancelled');
  await move(id, 'cancelled');
  assert.equal(await stock(), before);
  assert.equal((await db.query(
    "select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'", [id]
  )).rows[0].n, 1);
});

test('material receipts, reservations, cancellation and consumption preserve balances and resist retries', async () => {
  const material = (await db.query("select id from materials where code='TEL-01'")).rows[0].id;
  const operation = randomUUID();
  const receive = () => db.query("select admin_receive_material($1,$2,10,'Recepcion de prueba')", [material, operation]);
  const balance = async () => {
    const { rows: [row] } = await db.query(
      'select quantity_on_hand,quantity_reserved from materials where id=$1', [material]
    );
    return [Number(row.quantity_on_hand), Number(row.quantity_reserved)];
  };
  async function approve(quantity) {
    const q = await quote(quantity);
    await asUser();
    await send(q);
    await asUser(customer);
    await db.query('select respond_to_quote($1,true)', [q.id]);
    await asUser();
    return q.id;
  }
  await asUser(customer);
  await assert.rejects(receive(), { code: '42501' });
  await asUser();
  await receive();
  await receive();
  assert.deepEqual(await balance(), [10, 0]);

  const rejected = await approve(10);
  await assert.rejects(convert(rejected), /Material insuficiente/);
  assert.equal((await db.query('select count(*)::int n from orders where quote_id=$1', [rejected])).rows[0].n, 0);
  assert.deepEqual(await balance(), [10, 0]);

  const q = await approve(2);
  const id = await convert(q);
  assert.equal(await convert(q), id);
  assert.deepEqual(await balance(), [10, 3.3]);
  await db.query("select admin_set_variant_fulfillment($1,'stock')", [variant]);
  await move(id, 'cancelled');
  await move(id, 'cancelled');
  assert.deepEqual(await balance(), [10, 0]);
  assert.equal((await db.query('select count(*)::int n from inventory_movements where order_id=$1', [id])).rows[0].n, 0);

  await db.query("select admin_set_variant_fulfillment($1,'made_to_order')", [variant]);
  const work = await convert(await approve(2));
  await move(work, 'in_production');
  await move(work, 'in_production');
  assert.deepEqual(await balance(), [6.7, 0]);
  const { rows } = await db.query(
    'select movement_type, quantity_delta, quantity_after from material_movements where order_id=$1 order by quantity_delta',
    [work]
  );
  assert.deepEqual(rows.map(row => [row.movement_type, Number(row.quantity_delta), Number(row.quantity_after)]),
    [['reserve', -3.3, 6.7], ['consume', 0, 6.7]]);
});

test('the customer and staff portals take a request through delivery with access and quality checks', async () => {
  const operator = randomUUID();
  const otherCustomer = randomUUID();
  await db.exec('reset role');
  await db.query('insert into auth.users values ($1),($2)', [operator, otherCustomer]);
  await db.query("insert into profiles(id,role) values ($1,'operator'),($2,'customer')", [operator, otherCustomer]);
  await db.exec('set role anon');
  assert.ok((await db.query('select * from customer_catalog()')).rows.some(row => row.variant_id === variant));
  await assert.rejects(db.query('select customer_activity()'), { code: '42501' });

  const requestId = randomUUID();
  const lines = JSON.stringify([{ variant_id: variant, quantity: 2 }]);
  const request = (id = requestId, items = lines) => db.query(
    'select customer_request_quote($1,$2,$3) id', [id, items, 'Bordado al frente']
  );
  const activity = async () => (await db.query('select customer_activity() data')).rows[0].data;
  const work = async () => (await db.query('select staff_work_orders() data')).rows[0].data;
  await asUser(customer);
  await assert.rejects(request(requestId, '[]'), { code: '22023' });
  await assert.rejects(request(requestId, JSON.stringify([{ variant_id: randomUUID(), quantity: 2 }])), { code: '22023' });
  assert.equal((await request()).rows[0].id, requestId);
  assert.equal((await request()).rows[0].id, requestId);
  await assert.rejects(request(requestId, JSON.stringify([{ variant_id: variant, quantity: 1 }])), { code: '22023' });
  const received = (await activity()).quotes.find(entry => entry.id === requestId);
  assert.equal(received.status, 'submitted');
  assert.equal(received.total, null);
  assert.equal(received.items[0].quantity, 2);
  await assert.rejects(work(), { code: '42501' });

  await asUser(otherCustomer);
  assert.equal((await activity()).quotes.length, 0);
  await assert.rejects(request(), { code: '42501' });
  await assert.rejects(db.query('select respond_to_quote($1,true)', [requestId]), /No puedes responder/);
  await db.exec('reset role');
  const item = (await db.query('select id from quote_items where quote_id=$1', [requestId])).rows[0].id;
  await asUser();
  await send({ id: requestId, item }, 5, 45.25);
  await asUser(customer);
  assert.equal((await activity()).quotes.find(entry => entry.id === requestId).total, 95.5);
  await db.query('select respond_to_quote($1,true)', [requestId]);
  await asUser();
  const id = await convert(requestId);

  await asUser(operator);
  await assert.rejects(activity(), { code: '42501' });
  const queued = (await work()).find(entry => entry.id === id);
  assert.equal(queued.status, 'confirmed');
  const task = queued.tasks[0];
  assert.equal(task.can_update, true);
  const taskStatus = status => db.query('select staff_update_production_task($1,$2)', [task.id, status]);
  await assert.rejects(taskStatus('in_progress'), { code: '22023' });
  await move(id, 'in_production');
  await assert.rejects(move(id, 'quality_check'), /incompletas/);
  await assert.rejects(taskStatus('completed'), { code: '22023' });
  await taskStatus('in_progress');
  await taskStatus('completed');
  await taskStatus('completed');
  await move(id, 'quality_check');

  const validChecklist = { medidas: true, acabados: true, personalizacion: true };
  const quality = (operation, result, checklist, notes = null) => db.query(
    'select staff_record_quality($1,$2,$3,$4,$5)', [id, operation, result, JSON.stringify(checklist), notes]
  );
  await assert.rejects(quality(randomUUID(), 'approved', { ...validChecklist, medidas: false }), { code: '22023' });
  const repairId = randomUUID();
  await quality(repairId, 'rework', validChecklist, 'Corregir costuras');
  await quality(repairId, 'rework', validChecklist, 'Corregir costuras');
  const repairing = (await work()).find(entry => entry.id === id);
  assert.equal(repairing.status, 'in_production');
  assert.equal(repairing.tasks[0].status, 'pending');
  assert.equal(repairing.latest_quality.result, 'rework');

  await taskStatus('in_progress');
  await taskStatus('completed');
  await move(id, 'quality_check');
  const approvalId = randomUUID();
  await quality(approvalId, 'approved', validChecklist);
  await quality(approvalId, 'approved', validChecklist);
  assert.equal((await work()).find(entry => entry.id === id).status, 'ready');
  await move(id, 'delivered');
  assert.ok(!(await work()).some(entry => entry.id === id));

  await asUser(customer);
  const delivered = (await activity()).orders.find(entry => entry.id === id);
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.total, 95.5);
  await assert.rejects(taskStatus('completed'), { code: '42501' });
  await asUser(otherCustomer);
  assert.equal((await activity()).orders.length, 0);
});
