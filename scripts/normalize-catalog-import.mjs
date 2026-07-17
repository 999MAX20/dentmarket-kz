import fs from 'node:fs/promises';
import { parse } from '../apps/api/node_modules/csv-parse/lib/sync.js';
const files=process.argv.slice(2);
const esc=s=>`"${String(s??'').replaceAll('"','""')}"`;
const cols=['source','supplierName','sourceUrl','externalId','name','brand','category','unit','currency','price','quantity','isRegulated','notes'];
for(const file of files){const rows=parse(await fs.readFile(file),{columns:true,skip_empty_lines:true,bom:true,relax_column_count:true,trim:true});const raw=rows.map(r=>({source:r.source??r.source_slug,supplierName:r.supplierName??r.supplier_name,sourceUrl:r.sourceUrl??r.source_url,externalId:r.externalId??r.external_id,name:r.name,brand:r.brand,category:r.category,unit:r.unit,currency:r.currency,price:r.price,quantity:r.quantity,isRegulated:r.isRegulated??r.is_regulated,notes:r.notes}));const uniq=new Map();for(const r of raw)uniq.set(`${r.source}|${r.externalId}`,r);const out=[...uniq.values()];await fs.writeFile(file,[cols.join(','),...out.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\n')+'\n');console.log(file,out.length)}
