// Full PostgreSQL two-session test. Creates/removes only its own disposable container.
const {spawn}=require('node:child_process');
const {readFile}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const path=require('node:path');
const container=`textilflow-workflows-qa-${process.pid}`;
const password=randomUUID();
const image=process.env.QA_POSTGRES_IMAGE||'bitnami/postgresql:latest';
function command(args,input){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(err||out)));p.stdin.end(input);});}
const sql=s=>command(['exec','-i','-e',`PGPASSWORD=${password}`,container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],s);
(async()=>{
  let created=false;
  try{
    await command(['run','-d','--rm','--name',container,'-e',`POSTGRESQL_PASSWORD=${password}`,image]);created=true;
    let ready=false;for(let i=0;i<60;i++){try{
      // Bitnami starts a temporary server during setup; wait for the final PID 1.
      if((await command(['exec',container,'cat','/proc/1/comm'])).trim()!=='postgres') throw new Error('Initialization in progress');
      await command(['exec',container,'pg_isready','-U','postgres']);ready=true;break;
    }catch{await new Promise(r=>setTimeout(r,1000));}}
    assert.ok(ready,'PostgreSQL must become ready');
    const baseline=await readFile(path.join(__dirname,'fixtures/order-quote-baseline.sql'),'utf8');
    const migration=await readFile(path.join(__dirname,'../migrations/20261101184030_admin_order_quote_workflows.sql'),'utf8');
    const inventoryApi=await readFile(path.join(__dirname,'../migrations/20261101185431_admin_inventory_movement_api.sql'),'utf8');
    await sql(baseline+'\n'+migration+'\n'+inventoryApi);
    const [admin,customer,cat,product,variant,quote,item]=Array.from({length:7},randomUUID);
    await sql(`insert into auth.users values ('${admin}'),('${customer}');
      insert into profiles(id,role) values ('${admin}','admin'),('${customer}','customer');
      insert into categories(id,name,slug) values ('${cat}','QA','qa');
      insert into products(id,category_id,name,slug,status) values ('${product}','${cat}','QA','qa','active');
      insert into product_variants(id,product_id,sku,color_name,size_code,base_price,status) values ('${variant}','${product}','QA-TEST','Azul','M',50,'active');
      update inventory set quantity_available=10 where product_variant_id='${variant}';
      insert into quotes(id,customer_id) values ('${quote}','${customer}');
      insert into quote_items(id,quote_id,product_variant_id,quantity) values ('${item}','${quote}','${variant}',2);
      update quotes set status='submitted' where id='${quote}';
      select set_config('request.jwt.claim.sub','${admin}',false);
      set role authenticated;
      select admin_send_quote('${quote}','[{"id":"${item}","unit_price":50}]',0,0,current_date+7);
      reset role;select set_config('request.jwt.claim.sub','${customer}',false);set role authenticated;
      select respond_to_quote('${quote}',true);reset role;`);
    const session=`select set_config('request.jwt.claim.sub','${admin}',false);set role authenticated;`;
    // Hold the parent lock in session A so session B must wait on the same quote.
    const a=sql(`begin;${session}select convert_quote_to_order('${quote}');select pg_sleep(1);commit;`);
    await new Promise(r=>setTimeout(r,100));
    const b=sql(`${session}select convert_quote_to_order('${quote}');`);
    await Promise.all([a,b]);
    const result=JSON.parse((await sql(`select json_build_object('orders',(select count(*) from orders where quote_id='${quote}'),'stock',(select quantity_available from inventory where product_variant_id='${variant}'),'sales',(select count(*) from inventory_movements where movement_type='sale'),'tasks',(select count(*) from production_tasks));`)).trim());
    assert.deepEqual(result,{orders:1,stock:8,sales:1,tasks:1});
    console.log('PASS: two simultaneous conversions create one order, one sale, one task; stock 10 -> 8.');
    const order=(await sql(`select id from orders where quote_id='${quote}';`)).trim();
    await Promise.all([sql(`begin;${session}select transition_order_status('${order}','cancelled','Solicitud QA');select pg_sleep(1);commit;`),sql(`${session}select transition_order_status('${order}','cancelled','Solicitud QA');`)]);
    const cancelled=JSON.parse((await sql(`select json_build_object('stock',(select quantity_available from inventory where product_variant_id='${variant}'),'releases',(select count(*) from inventory_movements where movement_type='release'),'history',(select count(*) from order_status_history where to_status='cancelled'));`)).trim());
    assert.deepEqual(cancelled,{stock:10,releases:1,history:1});
    console.log('PASS: concurrent cancellations restore stock once and create one history entry.');
    await sql(`update inventory set quantity_available=5 where product_variant_id='${variant}';`);
    const withdrawals=await Promise.allSettled([randomUUID(),randomUUID()].map(operation=>sql(`${session}select admin_record_inventory_movement('${variant}','${operation}','out',4,'Salida simultánea QA');`)));
    assert.equal(withdrawals.filter(r=>r.status==='fulfilled').length,1);assert.equal(withdrawals.filter(r=>r.status==='rejected').length,1);
    assert.equal((await sql(`select quantity_available from inventory where product_variant_id='${variant}';`)).trim(),'1');
    console.log('PASS: competing withdrawals cannot oversell stock (5 -> 1).');
    const operation=randomUUID();const deposit=`${session}select admin_record_inventory_movement('${variant}','${operation}','in',3,'Entrada repetida QA');`;
    await Promise.all([sql(deposit),sql(deposit)]);
    assert.equal((await sql(`select quantity_available from inventory where product_variant_id='${variant}';`)).trim(),'4');
    assert.equal((await sql(`select count(*) from inventory_movements where operation_id='${operation}';`)).trim(),'1');
    console.log('PASS: concurrent retries of a manual movement apply once (1 -> 4).');
  }finally{if(created)await command(['stop',container]);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
