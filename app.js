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

async function load(){
  try{
    const r=await googleCall('getInventory');
    products=r.inventory||[];
    $("productCount").textContent=`${products.length} products`;
  }catch(e){
    $("productCount").textContent='Google database not connected';
    console.error(e);
    if(String(e.message||'').toLowerCase().includes('session') || String(e.message||'').toLowerCase().includes('unauthorized')){
      logout(false);
    }
  }
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
    await load();
    render();
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
function addProduct(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;const existing=cart.find(x=>String(x.id)===String(id)&&!x.description);if(existing)existing.qty++;else cart.push({...p,qty:1,description:""});$("search").value="";$("results").innerHTML="";selectedIndex=-1;render();$("search").focus()}
function render(){const box=$("cart");if(!cart.length)box.innerHTML='<div class="empty">No products added yet.</div>';else box.innerHTML=cart.map((x,i)=>`<div class="item"><div class="item-top"><div class="item-name">${esc(x.name)}</div><strong>${money(x.price*x.qty)}</strong></div><div class="custom-price-row"><span>Price</span><input class="custom-price" type="number" min="0" step="1" value="${x.price}" data-price="${i}"><span>each</span></div><input class="item-desc" placeholder="Optional description (e.g. 102010020220)" value="${esc(x.description)}" data-desc="${i}"><div class="item-controls"><button class="small" data-minus="${i}">−</button><input class="qty" type="number" min="1" value="${x.qty}" data-qty="${i}"><button class="small" data-plus="${i}">+</button><button class="small" data-remove="${i}">Remove</button></div></div>`).join("");box.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{cart[b.dataset.minus].qty=Math.max(1,cart[b.dataset.minus].qty-1);render()});box.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{cart[b.dataset.plus].qty++;render()});box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);render()});box.querySelectorAll('[data-qty]').forEach(inp=>inp.onchange=()=>{cart[inp.dataset.qty].qty=Math.max(1,Number(inp.value)||1);render()});box.querySelectorAll('[data-desc]').forEach(inp=>inp.oninput=()=>{cart[inp.dataset.desc].description=inp.value;updateTotals()});box.querySelectorAll('[data-price]').forEach(inp=>inp.oninput=()=>{cart[inp.dataset.price].price=Math.max(0,Number(inp.value)||0);updateTotals();renderItemTotals()});updateTotals()}
function renderItemTotals(){document.querySelectorAll('#cart .item').forEach((el,i)=>{if(cart[i]){const strong=el.querySelector('.item-top strong');if(strong)strong.textContent=money(cart[i].price*cart[i].qty)}})}
function updateTotals(){const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0),shipping=Number($("shipping").value)||0,discount=Number($("discount").value)||0,advance=Number($("advance").value)||0,total=Math.max(0,subtotal+shipping-discount);$("subtotal").textContent=money(subtotal);$("total").textContent=money(total);$("due").textContent=money(Math.max(0,total-advance))}
function reset(){editingMemoId=null;memoNumber=null;cart=[];$("customerName").value="";$("customerPhone").value="";$("customerDigit").value="";$("shipping").value=0;$("discount").value=0;$("advance").value=0;$("search").value="";$("results").innerHTML="";$("memoNo").textContent="New memo";render();$("search").focus()}

async function printMemo(){
  if(!cart.length){alert('Add at least one product.');return}
  try{
    if(memoNumber===null)memoNumber=(await googleCall('nextMemo')).number;
    const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0),shipping=Number($("shipping").value)||0,discount=Number($("discount").value)||0,total=Math.max(0,subtotal+shipping-discount),advance=Number($("advance").value)||0,due=Math.max(0,total-advance),printMoney=n=>'৳'+Math.round(Number(n)||0).toLocaleString('en-US');
    const memoId='MEMO-'+memoNumber;
    const items=cart.map(x=>({id:x.id,code:x.code,name:x.name,qty:x.qty,price:x.price,description:x.description||''}));
    const rows=cart.map(x=>`<div class="p"><div>${esc(x.name)}</div><div class="line"><span>${x.qty} x ${printMoney(x.price)}</span><b>${printMoney(x.price*x.qty)}</b></div>${x.description?`<div class="d">(${esc(x.description)})</div>`:''}</div>`).join('');
    $("memoNo").textContent=`Memo #${memoNumber}`;$("printArea").innerHTML=`<div class="receipt"><h2>DESIRED DIVINE</h2><div class="center">CASH MEMO</div><hr><div>Name: ${esc($("customerName").value)}</div><div>Phone: ${esc($("customerPhone").value)}</div><div>L.Digit: ${esc($("customerDigit").value)}</div><div>Memo: #${memoNumber}</div><hr>${rows}<hr><div class="summary"><div>Product Total:</div><div>${printMoney(subtotal)}</div><div>Shipping:</div><div>${printMoney(shipping)}</div><div>Discount:</div><div>- ${printMoney(discount)}</div><div class="big">TOTAL:</div><div class="big">${printMoney(total)}</div><div>Advance:</div><div>${printMoney(advance)}</div><div class="big">DUE:</div><div class="big">${printMoney(due)}</div></div><hr><div class="center">Thank You!</div></div>`;
    const style=document.createElement('style');style.textContent=`@page{size:75mm auto;margin:0}*{box-sizing:border-box}#printArea{width:75mm;margin:0;padding:0}.receipt{width:75mm;max-width:75mm;box-sizing:border-box;margin:0;padding:1mm 3mm 1mm 1mm;font:12px Arial,sans-serif;line-height:1.25;overflow-wrap:anywhere}.receipt h2{text-align:center;margin:0;font-size:16px;line-height:1.2}.center{text-align:center}.receipt hr{border:0;border-top:1px dashed #000;margin:5px 0}.receipt .p{margin:5px 0}.receipt .line{display:grid;grid-template-columns:minmax(0,1fr) 18mm;column-gap:5px;width:100%}.receipt .line b{text-align:right;white-space:nowrap}.receipt .d{font-size:11px;padding-left:6px;word-break:break-all}.receipt .summary{display:grid;grid-template-columns:minmax(0,1fr) 18mm;column-gap:5px;width:100%;line-height:1.35}.receipt .summary>*:nth-child(even){text-align:right;white-space:nowrap}.receipt .big{font-size:14px;font-weight:bold;margin:2px 0}`;$("printArea").appendChild(style);
    await googleCall(editingMemoId?'updateMemo':'saveMemo',{id:memoId,number:String(memoNumber),date:new Date().toISOString(),customerName:$("customerName").value,customerPhone:$("customerPhone").value,customerDigit:$("customerDigit").value,items:JSON.stringify(items),shipping:String(shipping),discount:String(discount),advance:String(advance),subtotal:String(subtotal),total:String(total),due:String(due)});
    await load();window.print();const afterPrint=()=>{window.removeEventListener('afterprint',afterPrint);reset()};window.addEventListener('afterprint',afterPrint);
  }catch(e){alert(e.message)}
}

async function openHistory(){try{const list=(await googleCall('getHistory')).history||[],box=$("historyList");if(!list.length)box.innerHTML='<div class="history-empty">No saved memos yet.</div>';else box.innerHTML=list.slice().reverse().map(m=>`<div class="history-row"><div><strong>Memo #${m.number||''}</strong><div>${esc(m.customer?.name||'Walk-in')} · ${esc(m.customer?.phone||'')}</div><small>${new Date(m.date).toLocaleString()} · ${m.items.length} item(s) · ${money(m.total)}</small></div><div class="history-actions"><button class="secondary" data-view="${esc(m.id)}">View / Edit</button><button class="secondary danger" data-delete="${esc(m.id)}">Delete</button></div></div>`).join('');box.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>editMemo(b.dataset.view));box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this memo from history?')){try{await googleCall('deleteMemo',{id:b.dataset.delete});openHistory()}catch(e){alert(e.message)}}});$("historyModal").classList.remove('hidden')}catch(e){alert(e.message)}}
async function editMemo(id){try{const list=(await googleCall('getHistory')).history||[],m=list.find(x=>String(x.id)===String(id));if(!m)return;editingMemoId=id;$("customerName").value=m.customer?.name||'';$("customerPhone").value=m.customer?.phone||'';$("customerDigit").value=m.customer?.digit||'';$("shipping").value=m.shipping||0;$("discount").value=m.discount||0;$("advance").value=m.advance||0;cart=m.items.map(x=>({...x}));memoNumber=m.number;$("memoNo").textContent=`Editing memo #${memoNumber}`;$("historyModal").classList.add('hidden');render();$("search").focus()}catch(e){alert(e.message)}}

function openProductModal(){$("productModal").classList.remove('hidden');$("newProductName").focus()}function closeProductModal(){$("productModal").classList.add('hidden');$("productForm").reset()}
$("productForm").onsubmit=async e=>{e.preventDefault();const name=$("newProductName").value.trim(),code=$("newProductCode").value.trim(),price=Number($("newProductPrice").value);if(!name){alert('Product name is required.');return}if(!Number.isFinite(price)||price<0){alert('Please enter a valid price.');return}try{const r=await googleCall('addProduct',{name,code,price:String(price),stock:'0'});await load();closeProductModal();alert(`Product added: ${r.product.name}`)}catch(err){alert(err.message)}};
function exportInventory(){if(!products.length){alert('There are no products to export.');return}if(typeof XLSX==='undefined'){alert('Excel library did not load.');return}const rows=products.map(p=>({'Product ID':p.id,'Product Code':p.code||'','Product Name':p.name,'Price':Number(p.price||0),'Stock':Number(p.stock||0)}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Inventory');ws['!freeze']={xSplit:0,ySplit:1};XLSX.writeFile(wb,'inventory.xlsx')}

$("search").addEventListener('input',showResults);$("search").addEventListener('keydown',e=>{const items=[...$("results").querySelectorAll('.result')];if(!items.length)return;if(e.key==='ArrowDown'){e.preventDefault();selectedIndex=Math.min(selectedIndex+1,items.length-1);showResults()}if(e.key==='ArrowUp'){e.preventDefault();selectedIndex=Math.max(selectedIndex-1,0);showResults()}if(e.key==='Enter'&&selectedIndex>=0){e.preventDefault();addProduct(items[selectedIndex].dataset.id)}});
$("excel").onchange=async e=>{const file=e.target.files[0];if(!file)return;if(typeof XLSX==='undefined'){alert('Excel library did not load.');e.target.value='';return}try{const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:'array'}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});let count=0;for(const row of rows){const n={};Object.keys(row).forEach(k=>n[k.trim().toLowerCase()]=row[k]);const name=n['product name']??n['name']??n['product']??n['item']??'',price=n['price']??n['selling price']??n['sale price']??n['unit price'],code=n['product code']??n['code']??n['sku']??n['barcode']??'',stock=n['stock']??0;if(!String(name).trim()||price===''||price==null)continue;const parsed=Number(String(price).replace(/,/g,''));if(!Number.isFinite(parsed))continue;await googleCall('addProduct',{name:String(name),code:String(code),price:String(parsed),stock:String(Number(stock)||0)});count++}await load();alert(`Uploaded ${count} products to Google Sheets.`)}catch(err){alert(err.message)}e.target.value=''};
$("exportInventoryBtn").onclick=exportInventory;$("shipping").oninput=updateTotals;$("discount").oninput=updateTotals;$("advance").oninput=updateTotals;$("printBtn").onclick=printMemo;$("clearBtn").onclick=reset;$("historyBtn").onclick=openHistory;$("closeHistory").onclick=()=>$('historyModal').classList.add('hidden');$("historyModal").addEventListener('click',e=>{if(e.target.id==='historyModal')$("historyModal").classList.add('hidden')});$("addProductBtn").onclick=openProductModal;$("closeProduct").onclick=closeProductModal;$("cancelProduct").onclick=closeProductModal;$("productModal").addEventListener('click',e=>{if(e.target.id==='productModal')closeProductModal()});
$("loginBtn").onclick=login;
$("loginPassword").addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$("loginUser").addEventListener('keydown',e=>{if(e.key==='Enter')$("loginPassword").focus()});
$("logoutBtn").onclick=()=>logout(true);

if(sessionStorage.getItem('posSessionToken')){
  hideLogin();
  load();
  render();
}else{
  showLogin();
  render();
}
