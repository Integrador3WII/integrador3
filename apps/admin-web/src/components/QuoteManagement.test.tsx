import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import QuoteManagement from './QuoteManagement';
import * as api from '../lib/adminQuotes';
vi.mock('./CatalogShared',async original=>({...await original<typeof import('./CatalogShared')>(),CatalogGate:({children}:{children:React.ReactNode})=>children}));
vi.mock('../lib/adminQuotes',async original=>({...await original<typeof import('../lib/adminQuotes')>(),listAdminQuotes:vi.fn(),getAdminQuote:vi.fn(),sendAdminQuote:vi.fn(),convertAdminQuote:vi.fn()}));
afterEach(cleanup); beforeEach(()=>vi.resetAllMocks());
it('muestra lista vacía sin inventar solicitudes',async()=>{
  vi.mocked(api.listAdminQuotes).mockResolvedValue({rows:[],count:0});render(<QuoteManagement/>);
  expect(await screen.findByText('No hay cotizaciones para esta consulta.')).toBeInTheDocument();
});
it('envía precios, descuento, envío y vigencia de la solicitud seleccionada',async()=>{
  vi.mocked(api.listAdminQuotes).mockResolvedValue({rows:[{id:'q',quote_number:'COT-1',status:'submitted'}],count:1});
  vi.mocked(api.getAdminQuote).mockResolvedValue({quote:{id:'q',status:'submitted',valid_until:'2026-12-01'},items:[{id:'i',unit_price:50,quantity:2,customization_total:10,variant:{sku:'SKU'}}],totals:{id:'q',total:110},history:[]});
  vi.mocked(api.sendAdminQuote).mockRejectedValue(new Error('El descuento no puede superar el subtotal'));
  render(<QuoteManagement/>);fireEvent.click(await screen.findByRole('button',{name:'Ver cotización'}));
  fireEvent.change(await screen.findByLabelText('Descuento (Bs)'),{target:{value:'200'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar oferta al cliente'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('El descuento no puede superar el subtotal');
  expect(api.sendAdminQuote).toHaveBeenCalledWith('q',{i:'50'},'200','0','2026-12-01');
});
it('convierte solo una oferta aprobada y presenta el identificador devuelto',async()=>{
  vi.mocked(api.listAdminQuotes).mockResolvedValue({rows:[{id:'q',status:'approved'}],count:1});
  vi.mocked(api.getAdminQuote).mockResolvedValue({quote:{id:'q',status:'approved'},items:[],totals:{id:'q',total:110},history:[]});
  vi.mocked(api.convertAdminQuote).mockResolvedValue('pedido-unico');
  render(<QuoteManagement/>);fireEvent.click(await screen.findByRole('button',{name:'Ver cotización'}));
  fireEvent.click(await screen.findByRole('button',{name:'Convertir a pedido'}));
  expect(await screen.findByText(/Pedido disponible: pedido-unico/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Convertir a pedido'})).toBeDisabled();
});
it.each(['-1','NaN','1.234','','1e4'])('rechaza importe inválido %s',value=>expect(()=>api.moneyInput(value)).toThrow());
