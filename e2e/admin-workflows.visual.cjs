// Browser/visual acceptance with intercepted HTTP fixtures, never live mutations.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const out=path.resolve('e2e/artifacts/admin-web-03');
const id='10000000-0000-4000-8000-000000000001';
const qid='20000000-0000-4000-8000-000000000001';
const aid='20000000-0000-4000-8000-000000000002';
let order={id,order_number:'ORD-000012',status:'confirmed',total:110,created_at:'2026-11-01T15:00:00Z',customer:{full_name:'Cliente de prueba'},delivery_method:'pickup'};
const quote={id:qid,quote_number:'COT-000021',status:'submitted',customer:{full_name:'Cliente de prueba'},valid_until:'2026-12-15',discount_amount:0,shipping_amount:10};
const approved={...quote,id:aid,quote_number:'COT-000022',status:'approved'};
let history=[];
(async()=>{
  await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:900}}),errors=[];
    await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
    await context.addInitScript(()=>{const now=Math.floor(Date.now()/1000);const token=`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${btoa(JSON.stringify({sub:'visual-admin',exp:now+3600,role:'authenticated'}))}.fixture`;
      localStorage.setItem('sb-vqrzvtxvssvajafgoboc-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:now+3600,user:{id:'visual-admin',email:'visual@example.test',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}}));});
    await context.route('https://*.supabase.co/**',async route=>{
      const request=route.request(),url=new URL(request.url()),p=url.pathname;let data;
      const single=request.headers().accept?.includes('vnd.pgrst.object');
      if(p.endsWith('/rpc/admin_catalog_access'))data=true;
      else if(p.endsWith('/rpc/admin_order_metrics'))data={orders_today:12,in_production:4,delivered_today:3,delivered_amount_today:520,as_of:'2026-11-01T15:00:00Z',timezone:'America/La_Paz'};
      else if(p.endsWith('/rpc/transition_order_status')){const body=request.postDataJSON();order={...order,status:body.p_new_status};history=[{id:'h',from_status:'confirmed',to_status:body.p_new_status,note:body.p_note,created_at:'2026-11-01T15:01:00Z'}];data=null;}
      else if(p.endsWith('/rpc/admin_send_quote')){assert.equal(request.postDataJSON().p_items[0].unit_price,45.25);quote.status='sent';data=null;}
      else if(p.endsWith('/rpc/convert_quote_to_order'))data=id;
      else if(p.endsWith('/orders'))data=single?order:[order];
      else if(p.endsWith('/order_items'))data=[{id:'oi',product_name_snapshot:'Polera algodón',sku_snapshot:'POL-AZ-M',quantity:2,unit_price:50}];
      else if(p.endsWith('/order_status_history'))data=history;
      else if(p.endsWith('/quotes'))data=single?(url.searchParams.get('id')===`eq.${aid}`?approved:quote):[quote,approved];
      else if(p.endsWith('/quote_items'))data=[{id:'qi',quantity:2,variant:{sku:'POL-AZ-M',product:{name:'Polera algodón'}}}];
      else if(p.endsWith('/v_quote_item_pricing'))data=[{id:'qi',quantity:2,unit_price:50,customization_total:0,line_total:100}];
      else if(p.endsWith('/v_quote_totals'))data={id:qid,subtotal:100,shipping_amount:10,discount_amount:0,total:110};
      else if(p.endsWith('/quote_status_history'))data=[];
      else if(p.endsWith('/auth/v1/user'))data={id:'visual-admin',email:'visual@example.test'};
      else{errors.push(`Unexpected ${p}`);return route.fulfill({status:400,json:{message:'Unexpected fixture'}});}
      await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`0-1/${Array.isArray(data)?data.length:1}`,'access-control-expose-headers':'content-range'},body:JSON.stringify(data)});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.ADMIN_PREVIEW_URL||'http://127.0.0.1:5174',{waitUntil:'domcontentloaded'});
    await page.getByText('Datos reales · Supabase').waitFor();
    for(const size of [{width:1440,height:900},{width:1366,height:768}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false,'Desktop dashboard must not scroll');}
    await page.screenshot({path:path.join(out,'dashboard-desktop.png')});
    await page.getByRole('button',{name:'Pedidos',exact:true}).click();await page.getByRole('button',{name:'Ver pedido'}).click();
    await page.getByLabel('Nuevo estado').selectOption('in_production');await page.getByLabel('Observación',{exact:true}).fill('Inicio de producción');await page.getByRole('button',{name:'Confirmar cambio'}).click();
    await page.getByText('Estado actualizado.',{exact:true}).waitFor();await page.getByText('Inicio de producción',{exact:true}).waitFor();
    await page.screenshot({path:path.join(out,'order-state-history.png')});await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Cotizaciones',exact:true}).click();await page.getByRole('button',{name:'Ver cotización'}).first().click();
    await page.getByLabel('Precio unitario POL-AZ-M').fill('45.25');await page.getByRole('button',{name:'Enviar oferta al cliente'}).click();
    await page.getByText('Oferta enviada. Sus precios quedan congelados.').waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Ver cotización'}).nth(1).click();await page.getByRole('button',{name:'Convertir a pedido'}).click();await page.getByText(/Pedido disponible:/).waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Modo oscuro',exact:true}).click();await page.screenshot({path:path.join(out,'quotes-desktop-dark.png')});
    for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No horizontal overflow ${width}`);await page.screenshot({path:path.join(out,`quotes-mobile-${width}.png`)});}
    await page.getByRole('button',{name:'Ver cotización'}).first().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'quote-detail-mobile.png')});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,mode:'intercepted HTTP fixtures',flows:['metrics','order transition/history','send quote','convert quote'],sizes:[1440,1366,390,320],screenshots:out}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
