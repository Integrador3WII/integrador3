// Visual/interaction verification with explicit HTTP fixtures; never a claim
// of live Supabase acceptance. Every Supabase request is intercepted.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:5174';
const out = process.env.VISUAL_OUTPUT || path.resolve('e2e/artifacts/admin-web-02');
const cat = { id: 'c1', name: 'Esenciales', slug: 'esenciales', description: 'Prendas para todos los días', is_active: true };
const product = { id: 'p1', name: 'Polera de algodón', slug: 'polera-algodon', description: 'Algodón de uso diario', category_id: cat.id, status: 'active', allows_customization: true, categories: cat };
const variant = { id: 'v1', product_id: 'p1', sku: 'POL-AZ-M', color_name: 'Azul petróleo', size_code: 'M', base_price: 50, status: 'active', inventory: { quantity_available: 15, minimum_stock: 3 }, products: { name: product.name, status: 'active', categories: { is_active: true } } };
const movement = { id: 'm1', operation_id: 'o1', product_variant_id: 'v1', movement_type: 'purchase', quantity_delta: 5, quantity_after: 15, reason: 'Recepción de compra al proveedor', created_by: 'visual-admin', profiles: { full_name: 'Administrador de prueba visual' }, created_at: '2026-10-07T16:00:00Z' };

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // External font availability must not block an isolated UI verification.
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://fonts.gstatic.com/**', route => route.abort());
    await context.addInitScript(() => {
      const now = Math.floor(Date.now() / 1000);
      const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: 'visual-admin', exp: now + 3600, role: 'authenticated' }))}.visual-fixture`;
      localStorage.setItem('sb-vqrzvtxvssvajafgoboc-auth-token', JSON.stringify({ access_token: token, refresh_token: 'visual-only', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: 'visual-admin', email: 'visual@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated' } }));
    });
    await context.route('https://*.supabase.co/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let data;
      if (pathname.includes('/rpc/admin_catalog_access')) data = true;
      else if (pathname.includes('/rpc/admin_order_metrics')) data = { orders_today: 0, in_production: 0, delivered_today: 0, delivered_amount_today: 0, as_of: '2026-11-01T15:00:00Z', timezone: 'America/La_Paz' };
      else if (pathname.endsWith('/categories')) data = [cat];
      else if (pathname.endsWith('/products')) data = [product];
      else if (pathname.endsWith('/product_variants')) data = [variant];
      else if (pathname.endsWith('/inventory_movements')) data = [movement];
      else if (pathname.endsWith('/auth/v1/user')) data = { id: 'visual-admin', email: 'visual@example.test' };
      else { errors.push(`Unexpected intercepted request ${request.method()} ${pathname}`); return route.fulfill({ status: 400, json: { error: 'Unexpected visual fixture request' } }); }
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
    await page.getByText(product.name, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Desktop horizontal overflow');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false, 'Desktop catalog should use internal scrolling');
    await page.screenshot({ path: path.join(out, 'catalog-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Variantes de Polera de algodón' }).click();
    await page.getByText(variant.sku, { exact: true }).waitFor();
    await page.getByRole('button', { name: `Editar variante ${variant.sku}` }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: path.join(out, 'variant-form.png'), fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: 'Inventario', exact: true }).click();
    await page.getByText(variant.sku, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Modo oscuro', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'inventory-dark.png'), fullPage: true });
    await page.getByRole('button', { name: `Historial de ${variant.sku}` }).click();
    await page.getByText(movement.reason, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, 'history-dark.png'), fullPage: true });
    await page.keyboard.press('Escape');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Mobile overflow at ${width}`);
      await page.getByRole('button', { name: `Registrar movimiento de ${variant.sku}` }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByLabel('Cantidad').fill('5');
      await page.getByLabel('Motivo').fill('Compra visual de prueba');
      assert.equal(await page.getByRole('button', { name: 'Confirmar movimiento' }).isVisible(), true);
      await page.screenshot({ path: path.join(out, `movement-mobile-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(out, `inventory-mobile-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Modo claro', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'inventory-mobile-light.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, environment: 'HTTP fixtures, not live Supabase', sizes: [1440, 390, 320], screenshots: out }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
