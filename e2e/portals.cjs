// Browser contract checks using intercepted HTTP. SQL integration is tested separately.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const id = randomUUID();
const variant = {
  variant_id: randomUUID(), product_name: 'Polera de algodón', category: 'Básicos',
  color: 'Azul', size: 'M', base_price: 45, min_quantity: 1, max_quantity: 20,
  allows_customization: true,
};
const task = {
  id: randomUUID(), status: 'pending', priority: 3, name: variant.product_name,
  size: variant.size, color: variant.color, quantity: 2, can_update: true,
};
const order = { id, order_number: 'ORD-000042', status: 'confirmed', tasks: [task], latest_quality: null };
const quote = { id: '', quote_number: 'COT-000042', status: 'submitted', total: null, items: [] };
const errors = [];
let attempt = null;

function session(email) {
  const user = { id: randomUUID(), email, role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    user, access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: user.id, exp: now + 3600 })}.fixture`,
    refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
  };
}

async function login(page, email) {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

async function fitViewport(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('https://textilflow-fixture.supabase.co/**', async route => {
      const request = route.request();
      const name = new URL(request.url()).pathname.split('/').at(-1);
      const body = request.postDataJSON();
      let data = null;
      if (name === 'token') data = session(body.email);
      else if (name === 'customer_catalog') data = [variant];
      else if (name === 'customer_request_quote') {
        assert.deepEqual(body.p_lines, [{ variant_id: variant.variant_id, quantity: 2 }]);
        assert.equal(body.p_notes, 'Bordado al frente');
        if (!attempt) {
          attempt = body.p_request_id;
          return route.fulfill({ status: 503, json: { message: 'Fixture temporal' } });
        }
        assert.equal(body.p_request_id, attempt);
        quote.id = body.p_request_id;
        quote.items = [{ name: variant.product_name, color: variant.color, size: variant.size, quantity: 2 }];
        data = quote.id;
      } else if (name === 'customer_activity') data = { quotes: quote.id ? [quote] : [], orders: [] };
      else if (name === 'respond_to_quote') {
        assert.equal(body.p_quote_id, quote.id);
        assert.equal(body.p_approve, true);
        quote.status = 'approved';
      } else if (name === 'staff_work_orders') data = order.status === 'delivered' ? [] : [order];
      else if (name === 'transition_order_status') {
        assert.equal(body.p_order_id, id);
        order.status = body.p_new_status;
      } else if (name === 'staff_update_production_task') {
        assert.equal(body.p_task_id, task.id);
        task.status = body.p_status;
      } else if (name === 'staff_record_quality') {
        assert.equal(body.p_order_id, id);
        assert.equal(body.p_result, 'approved');
        assert.deepEqual(body.p_checklist, { medidas: true, acabados: true, personalizacion: true });
        order.status = 'ready';
        order.latest_quality = { result: 'approved', notes: null };
      } else {
        errors.push(name);
        return route.fulfill({ status: 400, json: { message: 'Ruta sin fixture' } });
      }
      await route.fulfill({ status: 200, json: data });
    });

    const client = await context.newPage();
    client.on('pageerror', error => errors.push(error.message));
    await client.goto('http://127.0.0.1:5175');
    await client.getByRole('button', { name: 'Agregar a cotización' }).click();
    await client.getByRole('button', { name: 'Acceder para enviar' }).click();
    await login(client, 'cliente@example.test');
    await client.getByRole('spinbutton').fill('2');
    await client.getByLabel('Notas de personalización o entrega').fill('Bordado al frente');
    await client.getByRole('button', { name: 'Enviar solicitud' }).click();
    await client.getByRole('alert').filter({ hasText: 'No se pudo completar' }).waitFor();
    await client.getByRole('button', { name: 'Enviar solicitud' }).click();
    await client.getByRole('heading', { name: 'COT-000042' }).waitFor();
    quote.status = 'sent';
    quote.total = 95.5;
    await client.getByRole('button', { name: 'Actualizar actividad' }).click();
    await client.getByRole('button', { name: 'Aprobar oferta' }).click();
    await client.getByText('Oferta aprobada.', { exact: false }).waitFor();
    await fitViewport(client);

    const staff = await context.newPage();
    staff.on('pageerror', error => errors.push(error.message));
    await staff.goto('http://127.0.0.1:5176');
    await login(staff, 'operador@example.test');
    await staff.getByRole('button', { name: 'Iniciar producción' }).click();
    await staff.getByRole('button', { name: 'Iniciar tarea' }).click();
    await staff.getByRole('button', { name: 'Completar tarea' }).click();
    await staff.getByRole('button', { name: 'Enviar a calidad' }).click();
    await staff.getByRole('checkbox').first().waitFor();
    for (const checkbox of await staff.getByRole('checkbox').all()) await checkbox.check();
    await staff.getByRole('button', { name: 'Registrar control' }).click();
    await staff.getByRole('button', { name: 'Marcar como entregado' }).click();
    await staff.getByText('No hay pedidos en esta página.').waitFor();
    await fitViewport(staff);
    assert.deepEqual(errors, []);
    console.log('Portales verificados en Edge: solicitud, reintento, oferta, tareas, calidad y entrega.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
