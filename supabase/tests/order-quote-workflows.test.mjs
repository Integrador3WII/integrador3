import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
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
