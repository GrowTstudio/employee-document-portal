const $ = s => document.querySelector(s);
const state = { requirements: null, rows: [], activeView: 'employee' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showView(view) {
  state.activeView = view;
  $('#employeeView').classList.toggle('hidden', view !== 'employee');
  $('#adminLoginView').classList.toggle('hidden', view !== 'login');
  $('#adminView').classList.toggle('hidden', view !== 'admin');
  $('#adminOpen').classList.toggle('hidden', view === 'admin');
}
function alertBox(el, message, type='error') { el.textContent = message; el.className = `alert ${type}`; }
async function api(url, options={}) {
  const res = await fetch(url, options);
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    let msg = 'Request failed.';
    if (type.includes('application/json')) { const d = await res.json(); msg = d.error || msg; }
    else msg = await res.text();
    throw new Error(msg);
  }
  if (type.includes('application/json')) return res.json();
  return res;
}
function renderEmployeeForm(req) {
  state.requirements = req;
  $('#detailsFields').innerHTML = req.fields.map(f => {
    const wide = f.type === 'textarea' ? ' full-width' : '';
    const input = f.type === 'textarea'
      ? `<textarea id="field_${esc(f.id)}" name="${esc(f.id)}" ${f.required?'required':''} placeholder="Enter ${esc(f.label.toLowerCase())}"></textarea>`
      : `<input id="field_${esc(f.id)}" name="${esc(f.id)}" type="${esc(f.type)}" ${f.required?'required':''} ${f.type==='number'?'step="any"':''} placeholder="${['date'].includes(f.type)?'':`Enter ${esc(f.label.toLowerCase())}`}" />`;
    return `<div class="field${wide}"><label for="field_${esc(f.id)}">${esc(f.label)}${f.required?'<span class="star">*</span>':''}</label>${input}</div>`;
  }).join('') || '<p class="muted">No employee detail fields configured. Please contact your administrator.</p>';
  $('#documentFields').innerHTML = req.documents.map(d => `<div class="document-upload"><label for="doc_${esc(d.id)}">${esc(d.label)} ${d.required?'<span style="color:#d14343">*</span>':'<span class="optional">(Optional)</span>'}</label><input id="doc_${esc(d.id)}" name="${esc(d.id)}" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" ${d.required?'required':''}><div class="sub-text">PDF, JPG, PNG, DOC, DOCX · Max 10 MB</div></div>`).join('') || '<p class="muted">No documents requested currently.</p>';
}
async function loadRequirements() {
  try { renderEmployeeForm(await api('/api/requirements')); }
  catch(e) { $('#loadError').textContent = 'Could not load the form: ' + e.message; $('#loadError').classList.remove('hidden'); }
}
$('#employeeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#submitButton'); btn.disabled = true; btn.textContent = 'Submitting…';
  const message = $('#submitMessage'); message.classList.add('hidden');
  try {
    const fd = new FormData();
    for (const f of state.requirements.fields) fd.append(f.id, $(`#field_${CSS.escape(f.id)}`).value || '');
    for (const d of state.requirements.documents) {
      const input = $(`#doc_${CSS.escape(d.id)}`); if (input.files[0]) fd.append(d.id, input.files[0]);
    }
    const result = await api('/api/submit', { method:'POST', body:fd });
    alertBox(message, result.message, 'success'); message.classList.remove('hidden');
    $('#employeeForm').reset(); window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  } catch(err) { alertBox(message, err.message || 'Submission failed. Please try again.'); message.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.innerHTML = 'Submit details & documents <span>→</span>'; }
});
$('#adminOpen').addEventListener('click', () => { $('#loginMessage').classList.add('hidden'); showView('login'); });
$('#backToForm').addEventListener('click', () => showView('employee'));
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true;
  try { await api('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:$('#adminPassword').value}) }); $('#adminPassword').value=''; showView('admin'); await loadAdminData(); }
  catch(err) { alertBox($('#loginMessage'), err.message); $('#loginMessage').classList.remove('hidden'); }
  finally { btn.disabled = false; }
});
$('#logoutButton').addEventListener('click', async () => { try { await api('/api/admin/logout',{method:'POST'}); } catch {} showView('employee'); });
$('#exportButton').addEventListener('click', async () => {
  try { const res = await api('/api/admin/export.xlsx'); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `employee-submissions-${new Date().toISOString().slice(0,10)}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
  catch(e) { alert(e.message); }
});
async function loadAdminData() {
  $('#recordsContainer').innerHTML = '<div class="loading">Loading employee records…</div>';
  try { const d = await api('/api/admin/submissions'); state.rows = d.rows; state.requirements = d.requirements; $('#totalCount').textContent = d.rows.length; $('#documentCount').textContent = d.rows.reduce((n,r)=>n+Object.keys(r.documents||{}).length,0); renderRecords(); renderConfig(); }
  catch(e) { $('#recordsContainer').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
}
function renderRecords() {
  const q = ($('#searchRecords').value || '').trim().toLowerCase();
  const rows = state.rows.filter(r => [r.employee_name,r.email,r.phone,...Object.values(r.details||{})].join(' ').toLowerCase().includes(q));
  if (!rows.length) { $('#recordsContainer').innerHTML = '<div class="empty-state">No submissions match your search.</div>'; return; }
  const fields = state.requirements.fields;
  const docs = state.requirements.documents;
  const head = `<th>Employee</th>${fields.filter(f=>!['full_name','email','phone'].includes(f.id)).map(f=>`<th>${esc(f.label)}</th>`).join('')}<th>Documents</th><th>Submitted</th><th>Action</th>`;
  const body = rows.map(r => `<tr><td><div class="employee-name">${esc(r.employee_name)}</div><div class="sub-text">${esc(r.email)}</div><div class="sub-text">${esc(r.phone)}</div></td>${fields.filter(f=>!['full_name','email','phone'].includes(f.id)).map(f=>`<td>${esc(r.details[f.id]||'—')}</td>`).join('')}<td><div class="doc-links">${docs.filter(d=>r.documents[d.id]).map(d=>`<button class="doc-link" data-sub="${r.id}" data-doc="${esc(d.id)}">↓ ${esc(d.label)}</button>`).join('')||'<span class="sub-text">No files</span>'}</div></td><td>${esc(new Date(r.submitted_at).toLocaleString())}</td><td><button class="delete-button" data-delete="${r.id}">Delete</button></td></tr>`).join('');
  $('#recordsContainer').innerHTML = `<div class="records-table-wrap"><table class="records-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  $('#recordsContainer').querySelectorAll('[data-sub]').forEach(btn => btn.addEventListener('click', () => downloadDoc(btn.dataset.sub,btn.dataset.doc)));
  $('#recordsContainer').querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => { if(!confirm('Delete this submission and its uploaded files? This cannot be undone.')) return; try { await api(`/api/admin/submissions/${btn.dataset.delete}`,{method:'DELETE'}); await loadAdminData(); } catch(e){alert(e.message);} }));
}
async function downloadDoc(id, docId) {
  try { const res = await api(`/api/admin/documents/${id}/${encodeURIComponent(docId)}`); const blob=await res.blob(); const cd=res.headers.get('content-disposition')||''; const match=cd.match(/filename="?([^";]+)"?/i); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=match?match[1]:'employee-document'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
  catch(e){alert(e.message);}
}
$('#searchRecords').addEventListener('input', renderRecords);
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab)); $('#recordsPanel').classList.toggle('hidden',tab.dataset.tab!=='recordsPanel'); $('#requirementsPanel').classList.toggle('hidden',tab.dataset.tab!=='requirementsPanel'); }));
function renderConfig() {
  const req = state.requirements;
  $('#fieldConfigList').innerHTML = req.fields.map((f,i)=>`<div class="config-row" data-field-row="${i}"><div class="config-row-grid"><input type="text" data-key="label" value="${esc(f.label)}" placeholder="Field label"><select data-key="type">${['text','email','tel','date','number','textarea'].map(t=>`<option value="${t}" ${f.type===t?'selected':''}>${t==='textarea'?'Long text':t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select><input type="text" data-key="id" value="${esc(f.id)}" placeholder="Unique ID (keep stable)"></div><div class="config-meta"><label class="check-label"><input type="checkbox" data-key="required" ${f.required?'checked':''}> Required field</label><button class="delete-button" data-remove-field="${i}">Remove field</button></div></div>`).join('') || '<p class="muted">No fields. Add at least one.</p>';
  $('#documentConfigList').innerHTML = req.documents.map((d,i)=>`<div class="config-row" data-document-row="${i}"><div class="config-row-grid"><input type="text" data-key="label" value="${esc(d.label)}" placeholder="Document label"><input type="text" data-key="id" value="${esc(d.id)}" placeholder="Unique ID (keep stable)"></div><div class="config-meta"><label class="check-label"><input type="checkbox" data-key="required" ${d.required?'checked':''}> Required upload</label><button class="delete-button" data-remove-document="${i}">Remove</button></div></div>`).join('') || '<p class="muted">No documents requested. Add a document if needed.</p>';
  $('#fieldConfigList').querySelectorAll('[data-remove-field]').forEach(b=>b.addEventListener('click',()=>{state.requirements.fields.splice(Number(b.dataset.removeField),1);renderConfig();}));
  $('#documentConfigList').querySelectorAll('[data-remove-document]').forEach(b=>b.addEventListener('click',()=>{state.requirements.documents.splice(Number(b.dataset.removeDocument),1);renderConfig();}));
}
function readConfigRows(container, selector) {
  return [...$(container).querySelectorAll(selector)].map(row=>{const obj={}; row.querySelectorAll('[data-key]').forEach(el=>obj[el.dataset.key]=el.type==='checkbox'?el.checked:el.value.trim()); return obj;});
}
$('#addField').addEventListener('click',()=>{state.requirements.fields.push({id:`new_field_${Date.now().toString().slice(-5)}`,label:'New field',type:'text',required:false});renderConfig();});
$('#addDocument').addEventListener('click',()=>{state.requirements.documents.push({id:`new_doc_${Date.now().toString().slice(-5)}`,label:'New document',required:false});renderConfig();});
$('#saveRequirements').addEventListener('click', async ()=>{
  const btn=$('#saveRequirements'); btn.disabled=true; $('#requirementsMessage').textContent='Saving…';
  try {
    const payload={fields:readConfigRows('#fieldConfigList','[data-field-row]'),documents:readConfigRows('#documentConfigList','[data-document-row]')};
    const result=await api('/api/admin/requirements',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    $('#requirementsMessage').textContent=result.message; await loadAdminData(); await loadRequirements();
  } catch(e){$('#requirementsMessage').textContent=e.message;}
  finally{btn.disabled=false;}
});
(async()=>{await loadRequirements(); try {const d=await api('/api/admin/me'); if(d.authenticated){showView('admin');await loadAdminData();}} catch {} })();
