import { useEffect, useState, type FormEvent } from 'react';
import {
  catalogError, listCategories, listProducts, listVariants, saveCategory, saveProduct, saveVariant,
  slugify, SIZES, statusLabels, productImageUrl, uploadProductImage, removeProductImage, type Category, type Product, type Variant, type CatalogStatus,
} from '../lib/catalog';
import { CatalogGate, FormActions, Modal, Pagination } from './CatalogShared';

type Editor = { type: 'category'; value?: Category } | { type: 'product'; value?: Product } | { type: 'variant'; productId: string; value?: Variant };
export default function CatalogManagement() {
  return <CatalogGate><CatalogWorkspace /></CatalogGate>;
}

function CatalogWorkspace() {
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      Promise.all([listCategories(), listProducts(page, search, status)]).then(([cats, result]) => {
        if (active) { setCategories(cats); setProducts(result.rows); setCount(result.count); }
      }).catch(e => { if (active) setError(catalogError(e)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, search, status, refresh]);

  return <section className="catalog-workspace" aria-labelledby="catalog-title">
    <div className="users-header"><div><p className="eyebrow">ADMIN WEB · CATÁLOGO</p><h1 id="catalog-title">Prendas con identidad.</h1><p>Categorías, tallas y colores. Un catálogo organizado desde el origen.</p></div>
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setRefresh(n => n + 1)} disabled={loading}>Actualizar</button>
        {!selected && <button className="add-user-button" disabled={loading || Boolean(error)} onClick={() => setEditor({ type: tab === 'products' ? 'product' : 'category' })}>{tab === 'products' ? '+ Nuevo producto' : '+ Nueva categoría'}</button>}</div></div>
    {notice && <p className="users-message success" role="status">{notice}</p>}
    {error && <p className="users-message error" role="alert">{error} <button className="catalog-button" onClick={() => setRefresh(n => n + 1)}>Reintentar</button></p>}
    {selected ? <VariantsPanel product={selected} refresh={refresh} onBack={() => setSelected(null)} onEdit={setEditor} /> : <>
      <div className="catalog-tabs" aria-label="Secciones del catálogo"><button aria-pressed={tab === 'products'} onClick={() => setTab('products')}>Productos</button><button aria-pressed={tab === 'categories'} onClick={() => setTab('categories')}>Categorías</button></div>
      {tab === 'products' ? <>
        <div className="catalog-toolbar"><label>Buscar por nombre<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Ej. Polera de algodón" /></label>
          <label>Estado<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className="catalog-card"><div className="catalog-table-scroll"><table><caption className="sr-only">Productos del catálogo</caption><thead><tr><th>Imagen / prenda</th><th>Categoría</th><th>Estado</th><th>Personalización</th><th>Acciones</th></tr></thead><tbody>
          {!loading && !error && products.map(product => <tr key={product.id}><td data-label="Imagen / prenda"><ProductThumb product={product} /><strong>{product.name}</strong><small>{product.slug}</small></td><td data-label="Categoría">{product.categories?.name ?? 'Sin categoría'}{product.categories?.is_active === false && <small>Categoría inactiva</small>}</td><td data-label="Estado"><span className={`catalog-status ${product.status}`}>{statusLabels[product.status]}</span></td><td data-label="Personalización">{product.allows_customization ? 'Permitida' : 'No disponible'}</td><td data-label="Acciones"><div className="catalog-row-actions"><button onClick={() => setSelected(product)} aria-label={`Variantes de ${product.name}`}>Variantes</button><button onClick={() => setEditor({ type: 'product', value: product })} aria-label={`Editar ${product.name}`}>Editar</button></div></td></tr>)}
        </tbody></table>{loading ? <p className="catalog-empty" role="status">Cargando catálogo…</p> : !error && !products.length && <p className="catalog-empty">No hay productos para esta búsqueda. Crea una categoría y después tu primera prenda.</p>}</div><Pagination page={page} count={count} onPage={setPage} busy={loading} /></div>
      </> : <div className="catalog-card category-list"><p className="catalog-help">Desactivar una categoría oculta sus productos del catálogo público; los registros se conservan.</p>
        {loading ? <p role="status" className="catalog-empty">Cargando categorías…</p> : !error && categories.length === 0 ? <p className="catalog-empty">Aún no hay categorías. Empieza por crear una.</p> : !error && categories.map(category => <article className="category-row" key={category.id}><div><strong>{category.name}</strong><p>{category.description || category.slug}</p></div><span className={`catalog-status ${category.is_active ? 'active' : 'inactive'}`}>{category.is_active ? 'Activa' : 'Inactiva'}</span><button className="catalog-button" aria-label={`Editar categoría ${category.name}`} onClick={() => setEditor({ type: 'category', value: category })}>Editar</button></article>)}
      </div>}
    </>}
    {editor && <CatalogEditor editor={editor} categories={categories} onClose={() => setEditor(null)} onSaved={() => {
      setNotice(editor.type === 'product' && !editor.value ? 'Producto guardado como borrador. Abre Variantes, agrega al menos una y luego edita el producto para activarlo.' : 'Cambios guardados en Supabase.');
      setEditor(null); setRefresh(n => n + 1);
    }} />}
  </section>;
}

function VariantsPanel({ product, refresh, onBack, onEdit }: { product: Product; refresh: number; onBack: () => void; onEdit: (editor: Editor) => void }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    listVariants(page, '', product.id).then(result => { if (active) { setRows(result.rows); setCount(result.count); } })
      .catch(e => { if (active) setError(catalogError(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product.id, page, refresh, retry]);
  return <div className="catalog-card"><div className="catalog-detail-heading"><div><button className="catalog-back" onClick={onBack}>← Volver a productos</button><h2>{product.name}</h2><p>Un SKU único por talla y color. El stock inicial es cero.</p></div><button className="add-user-button" onClick={() => onEdit({ type: 'variant', productId: product.id })}>+ Nueva variante</button></div>
    {error && <p role="alert" className="users-message error">{error} <button className="catalog-button" onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>}
    <div className="catalog-table-scroll"><table><caption className="sr-only">Variantes de {product.name}</caption><thead><tr><th>SKU</th><th>Color / talla</th><th>Precio base</th><th>Stock</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{!loading && !error && rows.map(row => <tr key={row.id}><td data-label="SKU"><strong>{row.sku}</strong></td><td data-label="Variante">{row.color_name} · {row.size_code}</td><td data-label="Precio base">Bs {Number(row.base_price).toFixed(2)}</td><td data-label="Stock">{row.inventory?.quantity_available ?? '—'}</td><td data-label="Estado"><span className={`catalog-status ${row.status}`}>{statusLabels[row.status]}</span></td><td data-label="Acción"><button className="catalog-button" aria-label={`Editar variante ${row.sku}`} onClick={() => onEdit({ type: 'variant', productId: product.id, value: row })}>Editar</button></td></tr>)}</tbody></table>
      {loading ? <p className="catalog-empty" role="status">Cargando variantes…</p> : !error && !rows.length && <p className="catalog-empty">Agrega tu primera combinación de talla y color.</p>}</div><Pagination page={page} count={count} onPage={setPage} busy={loading} /></div>;
}

function CatalogEditor({ editor, categories, onClose, onSaved }: { editor: Editor; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    setBusy(true); setError('');
    try {
      if (editor.type === 'category') await saveCategory({ name: value('name'), slug: value('slug') || slugify(value('name')), description: value('description'), is_active: form.has('active') }, editor.value?.id);
      if (editor.type === 'product') {
        const productId = await saveProduct({ name: value('name'), slug: value('slug') || slugify(value('name')), description: value('description'), category_id: value('category'), allows_customization: form.has('customization'), status: (editor.value ? value('status') : 'draft') as CatalogStatus, image_path: editor.value?.image_path ?? null }, editor.value?.id);
        const image = form.get('image');
        if (image instanceof File && image.size > 0) await uploadProductImage(productId, image, editor.value?.image_path ?? null);
        if (form.get('remove-image') === 'on' && editor.value?.image_path) await removeProductImage(productId, editor.value.image_path);
      }
      if (editor.type === 'variant') await saveVariant({ product_id: editor.productId, sku: value('sku'), color_name: value('color'), size_code: value('size'), base_price: Number(value('price')), status: value('status') as CatalogStatus }, editor.value?.id);
      onSaved();
    } catch (e) { setError(catalogError(e)); } finally { setBusy(false); }
  }
  const noun = editor.type === 'category' ? 'categoría' : editor.type === 'product' ? 'producto' : 'variante';
  return <Modal title={`${editor.value ? 'Editar' : 'Crear'} ${noun}`} onClose={onClose} busy={busy}><form className="catalog-form" onSubmit={submit}>
    {error && <p className="users-message error" role="alert">{error}</p>}
    <fieldset disabled={busy}>
      {editor.type !== 'variant' ? <>
        <label>Nombre<input name="name" required minLength={2} maxLength={editor.type === 'product' ? 160 : 80} defaultValue={editor.value?.name} /></label>
        <label>Código legible (opcional)<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} placeholder="Se genera a partir del nombre" defaultValue={editor.value?.slug} /></label>
        <label>Descripción<textarea name="description" maxLength={2000} rows={3} defaultValue={editor.value?.description ?? ''} /></label>
        {editor.type === 'category' ? <label className="catalog-checkbox"><input type="checkbox" name="active" defaultChecked={editor.value?.is_active ?? true} />Categoría activa</label> : <>
          <label>Categoría<select name="category" required defaultValue={editor.value?.category_id ?? ''}><option value="" disabled>Selecciona una categoría</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}{!category.is_active ? ' (inactiva)' : ''}</option>)}</select></label>
          {!categories.length && <p className="catalog-help">Primero crea una categoría desde la pestaña Categorías.</p>}
          {editor.value ? <StatusField value={editor.value.status} /> : <p className="catalog-help">Se creará como borrador. Agrega una variante antes de activarlo.</p>}
          <label className="catalog-checkbox"><input type="checkbox" name="customization" defaultChecked={editor.value?.allows_customization ?? true} />Permitir personalización</label>
          <ImageField product={editor.value} />
        </>}
      </> : <>
        <label>SKU<input name="sku" required pattern="[A-Za-z0-9._\-]{3,50}" minLength={3} maxLength={50} placeholder="POL-AZ-M" defaultValue={editor.value?.sku} /></label>
        <div className="form-row"><label>Color<input name="color" required minLength={2} maxLength={50} defaultValue={editor.value?.color_name} /></label><label>Talla<select name="size" defaultValue={editor.value?.size_code ?? 'M'}>{SIZES.map(size => <option key={size}>{size}</option>)}</select></label></div>
        <label>Precio base (Bs)<input name="price" type="number" min="0" step="0.01" max="99999999.99" required defaultValue={editor.value?.base_price} /></label>
        <StatusField value={editor.value?.status ?? 'active'} />
        <p className="catalog-help">Editar el precio no cambia los precios ya guardados en cotizaciones y pedidos.</p>
      </>}
      <p className="catalog-help">Los registros inactivos se conservan. No se eliminan datos históricos.</p>
    </fieldset><FormActions busy={busy} onClose={onClose} />
  </form></Modal>;
}

function ProductThumb({ product }: { product: Product }) {
  const url = productImageUrl(product.image_path ?? null);
  return url ? <img className="product-thumb" src={url} alt={`Imagen de ${product.name}`} /> : <span className="product-thumb product-thumb-empty" aria-label={`Sin imagen para ${product.name}`}>TF</span>;
}

function ImageField({ product }: { product?: Product }) {
  const url = productImageUrl(product?.image_path ?? null);
  return <div className="product-image-field"><label>Imagen del producto<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>{url && <div className="image-preview"><img src={url} alt="Vista previa actual" /><label className="catalog-checkbox"><input type="checkbox" name="remove-image" />Quitar imagen actual</label></div>}<p className="catalog-help">JPG, PNG o WebP · máximo 5 MB. La imagen se guarda en Storage al confirmar.</p></div>;
}

function StatusField({ value }: { value: CatalogStatus }) {
  return <label>Estado<select name="status" defaultValue={value}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}
