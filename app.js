let products=[], cart=[], selectedIndex=-1, memoNumber=null, editingMemoId=null;
const $=id=>document.getElementById(id);
const money=n=>"৳"+Number(n||0).toFixed(2);

function googleCall(action, params={}) {
  return new Promise((resolve,reject)=>{
    if (!GOOGLE_API_URL || GOOGLE_API_URL.includes('PASTE_YOUR')) return reject(new Error('Google API is not configured. Open config.js and paste the Web App URL and API key.'));
    const cb='posCb_'+Date.now()+'_'+Math.floor(Math.random()*100000);
    const script=document.createElement('script');
    const token=sessionStorage.getItem('posSessionToken') || '';
    const q=new URLSearchParams({action,key:GOOGLE_API_KEY,token,callback:cb,...params});
    const cleanup=()=>{delete window[cb];script.remove()};
    window[cb]=(data)=>{cleanup(); if(data && data.success) resolve(data); else reject(new Error(data?.error||'Google API error'))};
    script.onerror=()=>{cleanup();reject(new Error('Could not reach Google Apps Script. Check the Web App URL, deployment access, and API key.'))};
    script.src=GOOGLE_API_URL+(GOOGLE_API_URL.includes('?')?'&':'?')+q.toString();
    document.body.appendChild(script);
  });
}

async function load({background=false}={}) {
  const CACHE_KEY='posProductsCacheV2';
  let hadCache=false;
  try {
    const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(Array.isArray(cached) && cached.length){
      products=cached;
      hadCache=true;
      $("productCount").textContent=`${products.length} products`;
      if(!background) showResults();
    }
  } catch(e){ console.warn('Product cache read failed',e); }

  // Always refresh from Google in the background. The UI does not wait.
  googleCall('getInventory').then(r=>{
    products=r.inventory||[];
    localStorage.setItem(CACHE_KEY,JSON.stringify(products));
    $("productCount").textContent=`${products.length} products`;
    if(!hadCache) showResults();
    prefetchMemoNumber();
    syncQueue();
  }).catch(e=>{
    if(!hadCache) $("productCount").textContent='Google database not connected';
    console.error(e);
    if(String(e.message||'').toLowerCase().includes('session') || String(e.message||'').toLowerCase().includes('unauthorized')){
      logout(false);
    }
  });
}

function showLogin(){
  $("app").hidden=true;
  $("loginScreen").classList.remove('hidden');
  $("loginUser").focus();
  document.body.classList.add('locked');
}

function hideLogin(){
  $("loginScreen").classList.add('hidden');
  $("app").hidden=false;
  document.body.classList.remove('locked');
}

async function login(){
  const username=$("loginUser").value.trim();
  const password=$("loginPassword").value;
  $("loginError").textContent='';
  if(!username || !password){
    $("loginError").textContent='Enter username and password.';
    return;
  }
  $("loginBtn").disabled=true;
  $("loginBtn").textContent='Signing in...';
  try{
    const r=await googleCall('login',{username,password});
    if(!r.token) throw new Error('Login succeeded but no session token was returned.');
    sessionStorage.setItem('posSessionToken',r.token);
    $("loginPassword").value='';
    hideLogin();
    const restored=restoreDraft();
    await load();
    prefetchMemoNumber();
    syncQueue();
    if(!restored) render();
  }catch(e){
    sessionStorage.removeItem('posSessionToken');
    $("loginError").textContent=e.message||'Login failed.';
  }finally{
    $("loginBtn").disabled=false;
    $("loginBtn").textContent='LOGIN';
  }
}

function logout(show=true){
  sessionStorage.removeItem('posSessionToken');
  $("app").hidden=true;
  products=[];
  cart=[];
  if(show) alert('You have been logged out.');
  showLogin();
}

function matches(p,q){const text=(p.name+" "+p.code).toLowerCase();const words=q.toLowerCase().trim().split(/\s+/).filter(Boolean);return words.every(w=>text.includes(w))}
function showResults(){const q=$("search").value.trim(),box=$("results");if(!q){box.innerHTML="";selectedIndex=-1;return}const found=products.filter(p=>matches(p,q)).slice(0,80);selectedIndex=Math.min(selectedIndex,found.length-1);box.innerHTML=found.length?found.map((p,i)=>`<div class="result ${i===selectedIndex?'selected':''}" data-id="${esc(p.id)}"><div><div class="result-name">${esc(p.name)}</div>${p.code?`<div class="result-code">${esc(p.code)}</div>`:""}</div><div class="price">${money(p.price)}</div></div>`).join(""):`<div class="hint">No matching products.</div>`;[...box.querySelectorAll('.result')].forEach(el=>el.onclick=()=>addProduct(el.dataset.id))}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function addProduct(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const existing=cart.find(x=>String(x.id)===String(id)&&!x.description);if(existing)existing.qty++;else cart.push({...p,qty:1,description:""});scheduleDraftSave();$("search").value="";$("results").innerHTML="";selectedIndex=-1;render();$("search").focus()}
function render(){const box=$("cart");if(!cart.length)box.innerHTML='<div class="empty">No products added yet.</div>';else box.innerHTML=cart.map((x,i)=>`<div class="item"><div class="item-top"><div class="item-name">${esc(x.name)}</div><strong>${money(x.price*x.qty)}</strong></div><div class="custom-price-row"><span>Price</span><input class="custom-price" type="number" min="0" step="1" value="${x.price}" data-price="${i}"><span>each</span></div><input class="item-desc" placeholder="Optional description (e.g. 102010020220)" value="${esc(x.description)}" data-desc="${i}"><div class="item-controls"><button class="small" data-minus="${i}">−</button><input class="qty" type="number" min="1" value="${x.qty}" data-qty="${i}"><button class="small" data-plus="${i}">+</button><button class="small" data-remove="${i}">Remove</button></div></div>`).join("");box.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{cart[b.dataset.minus].qty=Math.max(1,cart[b.dataset.minus].qty-1);render()});box.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{cart[b.dataset.plus].qty++;render()});box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);render()});box.querySelectorAll('[data-qty]').forEach(inp=>inp.onchange=()=>{cart[inp.dataset.qty].qty=Math.max(1,Number(inp.value)||1);render()});box.querySelectorAll('[data-desc]').forEach(inp=>inp.oninput=()=>{cart[inp.dataset.desc].description=inp.value;updateTotals();scheduleDraftSave()});box.querySelectorAll('[data-price]').forEach(inp=>inp.oninput=()=>{cart[inp.dataset.price].price=Math.max(0,Number(inp.value)||0);updateTotals();renderItemTotals();scheduleDraftSave()});updateTotals();scheduleDraftSave()}
function renderItemTotals(){document.querySelectorAll('#cart .item').forEach((el,i)=>{if(cart[i]){const strong=el.querySelector('.item-top strong');if(strong)strong.textContent=money(cart[i].price*cart[i].qty)}})}
function updateTotals(){const totalQty=cart.reduce((s,x)=>s+(Number(x.qty)||0),0),subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0),shipping=Number($("shipping").value)||0,discount=Number($("discount").value)||0,advance=Number($("advance").value)||0,total=Math.max(0,subtotal+shipping-discount);$("totalQty").textContent=`Total Qty: ${totalQty}`;$("subtotal").textContent=money(subtotal);$("total").textContent=money(total);$("due").textContent=money(Math.max(0,total-advance))}
function reset(){clearDraft();editingMemoId=null;memoNumber=null;cart=[];$("customerName").value="";$("customerPhone").value="";$("customerDigit").value="";$("shipping").value=0;$("discount").value=0;$("advance").value=0;$("search").value="";$("results").innerHTML="";$("memoNo").textContent="New memo";render();$("search").focus()}


const MEMO_CACHE_KEY='posNextMemoV2';
const SALE_QUEUE_KEY='posSaleQueueV2';
const HISTORY_CACHE_KEY='posHistoryCacheV2';
const DRAFT_CACHE_KEY='posCurrentMemoDraftV3';
let draftSaveTimer=null;

function saveDraft(){
  try{
    const draft={
      customerName: $("customerName").value,
      customerPhone: $("customerPhone").value,
      customerDigit: $("customerDigit").value,
      shipping: $("shipping").value,
      discount: $("discount").value,
      advance: $("advance").value,
      search: $("search").value,
      cart: cart,
      memoNumber,
      editingMemoId,
      savedAt: Date.now()
    };
    localStorage.setItem(DRAFT_CACHE_KEY,JSON.stringify(draft));
  }catch(e){console.warn('Draft save failed:',e)}
}

function scheduleDraftSave(){
  clearTimeout(draftSaveTimer);
  draftSaveTimer=setTimeout(saveDraft,120);
}

function restoreDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_CACHE_KEY);
    if(!raw)return false;
    const d=JSON.parse(raw);
    if(!d || typeof d!=='object')return false;
    // Never restore an accidentally empty draft.
    const hasContent=(Array.isArray(d.cart)&&d.cart.length) || d.customerName || d.customerPhone || d.customerDigit || Number(d.shipping)||Number(d.discount)||Number(d.advance) || d.search;
    if(!hasContent)return false;
    $("customerName").value=d.customerName||'';
    $("customerPhone").value=d.customerPhone||'';
    $("customerDigit").value=d.customerDigit||'';
    $("shipping").value=d.shipping ?? 0;
    $("discount").value=d.discount ?? 0;
    $("advance").value=d.advance ?? 0;
    $("search").value=d.search||'';
    cart=Array.isArray(d.cart)?d.cart:[];
    memoNumber=d.memoNumber ?? null;
    editingMemoId=d.editingMemoId ?? null;
    $("memoNo").textContent=editingMemoId ? `Editing memo #${memoNumber||''}` : (memoNumber!=null ? `Memo #${memoNumber}` : 'New memo');
    render();
    return true;
  }catch(e){console.warn('Draft restore failed:',e);return false}
}

function clearDraft(){
  clearTimeout(draftSaveTimer);
  localStorage.removeItem(DRAFT_CACHE_KEY);
}

function prefetchMemoNumber(){
  if(!sessionStorage.getItem('posSessionToken')) return;
  googleCall('nextMemo').then(r=>{
    if(r && r.number!=null) localStorage.setItem(MEMO_CACHE_KEY,String(r.number));
  }).catch(()=>{});
}

function getCachedMemoNumber(){
  const n=localStorage.getItem(MEMO_CACHE_KEY);
  if(n) return n;
  return String(Date.now()).slice(-8);
}

function advanceMemoCache(){
  const n=Number(localStorage.getItem(MEMO_CACHE_KEY));
  if(Number.isFinite(n)) localStorage.setItem(MEMO_CACHE_KEY,String(n+1));
  else localStorage.removeItem(MEMO_CACHE_KEY);
}

function readSaleQueue(){
  try{return JSON.parse(localStorage.getItem(SALE_QUEUE_KEY)||'[]')}catch(e){return []}
}
function writeSaleQueue(q){localStorage.setItem(SALE_QUEUE_KEY,JSON.stringify(q))}
function queueSale(payload){
  const q=readSaleQueue();
  q.push({payload,queuedAt:Date.now()});
  writeSaleQueue(q);
  syncQueue();
}
let syncingQueue=false;
async function syncQueue(){
  if(syncingQueue || !sessionStorage.getItem('posSessionToken')) return;
  const q=readSaleQueue();
  if(!q.length) return;
  syncingQueue=true;
  try{
    while(q.length){
      const job=q[0];
      try{
        await googleCall(job.payload._action || 'saveMemo',job.payload);
        q.shift();
        writeSaleQueue(q);
      }catch(e){
        console.warn('Background sync paused:',e);
        break;
      }
    }
    if(!q.length) prefetchMemoNumber();
  }finally{syncingQueue=false}
}

window.addEventListener('online',syncQueue);
async function printMemo(){
  if(!cart.length){alert('Add at least one product.');return}
  try{
    const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0);
    const shipping=Number($("shipping").value)||0;
    const discount=Number($("discount").value)||0;
    const total=Math.max(0,subtotal+shipping-discount);
    const advance=Number($("advance").value)||0;
    const due=Math.max(0,total-advance);
    const printMoney=n=>'৳'+Math.round(Number(n)||0).toLocaleString('en-US');

    // Use a prefetched memo number. Never wait for Google just to print.
    if(memoNumber===null) memoNumber=getCachedMemoNumber();
    const memoId='MEMO-'+memoNumber;
    const items=cart.map(x=>({id:x.id,code:x.code,name:x.name,qty:x.qty,price:x.price,description:x.description||''}));
    const rows=cart.map(x=>`<div class="p"><div>${esc(x.name)}</div><div class="line"><span>${x.qty} x ${printMoney(x.price)}</span><b>${printMoney(x.price*x.qty)}</b></div>${x.description?`<div class="d">(${esc(x.description)})</div>`:''}</div>`).join('');

    $("memoNo").textContent=`Memo #${memoNumber}`;
    $("printArea").innerHTML=`<div class="receipt"><h2>DESIRED DIVINE</h2><div class="center">CASH MEMO</div><hr><div>Name: ${esc($("customerName").value)}</div><div>Phone: ${esc($("customerPhone").value)}</div><div>L.Digit: ${esc($("customerDigit").value)}</div><div>Memo: #${memoNumber}</div><hr>${rows}<hr><div class="summary"><div>Product Total:</div><div>${printMoney(subtotal)}</div><div>Shipping:</div><div>${printMoney(shipping)}</div><div>Discount:</div><div>- ${printMoney(discount)}</div><div class="big">TOTAL:</div><div class="big">${printMoney(total)}</div><div>Advance:</div><div>${printMoney(advance)}</div><div class="big">DUE:</div><div class="big">${printMoney(due)}</div></div><hr><div class="center">Thank You!</div></div>`;

    const style=document.createElement('style');
    style.textContent=`@page{size:75mm auto;margin:0}*{box-sizing:border-box}#printArea{width:75mm;margin:0;padding:0}.receipt{width:75mm;max-width:75mm;box-sizing:border-box;margin:0;padding:1mm 3mm 1mm 1mm;font:12px Arial,sans-serif;line-height:1.25;overflow-wrap:anywhere}.receipt h2{text-align:center;margin:0;font-size:16px;line-height:1.2}.center{text-align:center}.receipt hr{border:0;border-top:1px dashed #000;margin:5px 0}.receipt .p{margin:5px 0}.receipt .line{display:grid;grid-template-columns:minmax(0,1fr) 18mm;column-gap:5px;width:100%}.receipt .line b{text-align:right;white-space:nowrap}.receipt .d{font-size:11px;padding-left:6px;word-break:break-all}.receipt .summary{display:grid;grid-template-columns:minmax(0,1fr) 18mm;column-gap:5px;width:100%;line-height:1.35}.receipt .summary>*:nth-child(even){text-align:right;white-space:nowrap}.receipt .big{font-size:14px;font-weight:bold;margin:2px 0}`;
    $("printArea").appendChild(style);

    const payload={id:memoId,number:String(memoNumber),date:new Date().toISOString(),customerName:$("customerName").value,customerPhone:$("customerPhone").value,customerDigit:$("customerDigit").value,items:JSON.stringify(items),shipping:String(shipping),discount:String(discount),advance:String(advance),subtotal:String(subtotal),total:String(total),due:String(due)};
    payload._action=editingMemoId?'updateMemo':'saveMemo';

    // Queue/save in background; printing never waits for Google.
    queueSale(payload);
    advanceMemoCache();

    window.print();
    const afterPrint=()=>{window.removeEventListener('afterprint',afterPrint);reset();};
    window.addEventListener('afterprint',afterPrint);
  }catch(e){alert(e.message)}
}

function renderHistory(list){
  const box=$("historyList");
  if(!list.length) box.innerHTML='<div class="history-empty">No saved memos yet.</div>';
  else box.innerHTML=list.slice().reverse().map(m=>`<div class="history-row"><div><strong>Memo #${m.number||''}</strong><div>${esc(m.customer?.name||'Walk-in')} · ${esc(m.customer?.phone||'')}</div><small>${new Date(m.date).toLocaleString()} · ${m.items.length} item(s) · ${money(m.total)}</small></div><div class="history-actions"><button class="secondary" data-view="${esc(m.id)}">View / Edit</button><button class="secondary danger" data-delete="${esc(m.id)}">Delete</button></div></div>`).join('');
  box.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>editMemo(b.dataset.view));
  box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Delete this memo from history?')) return;
    try{await googleCall('deleteMemo',{id:b.dataset.delete});localStorage.removeItem(HISTORY_CACHE_KEY);refreshHistory(true)}catch(e){alert(e.message)}
  });
}
async function refreshHistory(force=false){
  if(!force){
    try{
      const cached=JSON.parse(localStorage.getItem(HISTORY_CACHE_KEY)||'null');
      if(Array.isArray(cached)){renderHistory(cached);$("historyModal").classList.remove('hidden');}
    }catch(e){}
  }
  googleCall('getHistory').then(r=>{
    const list=r.history||[];
    localStorage.setItem(HISTORY_CACHE_KEY,JSON.stringify(list));
    renderHistory(list);
    $("historyModal").classList.remove('hidden');
  }).catch(e=>{
    if(!$("historyModal").classList.contains('hidden')) console.warn(e);
    else alert(e.message);
  });
}
function openHistory(){refreshHistory(false)}

async function editMemo(id){
  try{
    let list=[];
    try{list=JSON.parse(localStorage.getItem(HISTORY_CACHE_KEY)||'[]')}catch(e){}
    let m=list.find(x=>String(x.id)===String(id));
    if(!m){
      const r=await googleCall('getHistory'); list=r.history||[];
      localStorage.setItem(HISTORY_CACHE_KEY,JSON.stringify(list));
      m=list.find(x=>String(x.id)===String(id));
    }
    if(!m)return;
    editingMemoId=id;
    $("customerName").value=m.customer?.name||'';
    $("customerPhone").value=m.customer?.phone||'';
    $("customerDigit").value=m.customer?.digit||'';
    $("shipping").value=m.shipping||0;
    $("discount").value=m.discount||0;
    $("advance").value=m.advance||0;
    cart=m.items.map(x=>({...x}));
    memoNumber=m.number;
    $("memoNo").textContent=`Editing memo #${memoNumber}`;
    $("historyModal").classList.add('hidden');
    render();
    $("search").focus();
  }catch(e){alert(e.message)}
}

function openProductModal(){$("productModal").classList.remove('hidden');$("newProductName").focus()}function closeProductModal(){$("productModal").classList.add('hidden');$("productForm").reset()}
$("productForm").onsubmit=async e=>{e.preventDefault();const name=$("newProductName").value.trim(),code=$("newProductCode").value.trim(),price=Number($("newProductPrice").value);if(!name){alert('Product name is required.');return}if(!Number.isFinite(price)||price<0){alert('Please enter a valid price.');return}try{const r=await googleCall('addProduct',{name,code,price:String(price)});products.push(r.product||{id:Date.now(),name,code,price});localStorage.setItem('posProductsCacheV2',JSON.stringify(products));$("productCount").textContent=`${products.length} products`;closeProductModal();alert(`Product added: ${r.product.name}`)}catch(err){alert(err.message)}};
function exportInventory(){if(!products.length){alert('There are no products to export.');return}if(typeof XLSX==='undefined'){alert('Excel library did not load.');return}const rows=products.map(p=>({'Product ID':p.id,'Product Code':p.code||'','Product Name':p.name,'Price':Number(p.price||0)}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Inventory');ws['!freeze']={xSplit:0,ySplit:1};XLSX.writeFile(wb,'inventory.xlsx')}

$("search").addEventListener('input',showResults);$("search").addEventListener('keydown',e=>{const items=[...$("results").querySelectorAll('.result')];if(!items.length)return;if(e.key==='ArrowDown'){e.preventDefault();selectedIndex=Math.min(selectedIndex+1,items.length-1);showResults()}if(e.key==='ArrowUp'){e.preventDefault();selectedIndex=Math.max(selectedIndex-1,0);showResults()}if(e.key==='Enter'&&selectedIndex>=0){e.preventDefault();addProduct(items[selectedIndex].dataset.id)}});
["customerName","customerPhone","customerDigit","shipping","discount","advance","search"].forEach(id=>$(id).addEventListener('input',scheduleDraftSave));
window.addEventListener('beforeunload',saveDraft);
window.addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft()});

$("excel").onchange=async e=>{
  const file=e.target.files[0]; if(!file)return;
  if(typeof XLSX==='undefined'){alert('Excel library did not load.');e.target.value='';return}
  try{
    const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    const parsed=[];
    for(const row of rows){
      const n={};Object.keys(row).forEach(k=>n[k.trim().toLowerCase()]=row[k]);
      const name=n['product name']??n['name']??n['product']??n['item']??'';
      const price=n['price']??n['selling price']??n['sale price']??n['unit price'];
      const code=n['product code']??n['code']??n['sku']??n['barcode']??'';
      if(!String(name).trim()||price===''||price==null)continue;
      const parsedPrice=Number(String(price).replace(/,/g,''));
      if(!Number.isFinite(parsedPrice))continue;
      parsed.push({name:String(name),code:String(code),price:String(parsedPrice)});
    }
    if(!parsed.length){alert('No valid products found.');return}
    // Fast path: one batch request. Requires batchAddProducts in the Apps Script.
    let r;
    try{
      r=await googleCall('batchAddProducts',{products:JSON.stringify(parsed)});
    }catch(batchErr){
      // Compatibility fallback for older Apps Script deployments.
      for(let i=0;i<parsed.length;i++){
        await googleCall('addProduct',parsed[i]);
        if((i+1)%50===0) $("productCount").textContent=`Uploading ${i+1}/${parsed.length}...`;
      }
      r={success:true,added:parsed.length,legacy:true};
    }
    await load();
    alert(`Uploaded ${r.added??parsed.length} products to Google Sheets.`);
  }catch(err){alert(err.message)}
  e.target.value='';
};
$("exportInventoryBtn").onclick=exportInventory;$("shipping").oninput=updateTotals;$("discount").oninput=updateTotals;$("advance").oninput=updateTotals;$("printBtn").onclick=printMemo;$("clearBtn").onclick=reset;$("historyBtn").onclick=openHistory;$("closeHistory").onclick=()=>$('historyModal').classList.add('hidden');$("historyModal").addEventListener('click',e=>{if(e.target.id==='historyModal')$("historyModal").classList.add('hidden')});$("addProductBtn").onclick=openProductModal;$("closeProduct").onclick=closeProductModal;$("cancelProduct").onclick=closeProductModal;$("productModal").addEventListener('click',e=>{if(e.target.id==='productModal')closeProductModal()});
$("loginBtn").onclick=login;
$("loginPassword").addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$("loginUser").addEventListener('keydown',e=>{if(e.key==='Enter')$("loginPassword").focus()});
$("logoutBtn").onclick=()=>logout(true);

if(sessionStorage.getItem('posSessionToken')){
  hideLogin();
  const restored=restoreDraft();
  load();
  prefetchMemoNumber();
  syncQueue();
  if(!restored) render();
}else{
  showLogin();
  render();
}

setInterval(syncQueue,15000);
