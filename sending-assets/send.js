'use strict';
(()=>{
 const config=window.FRONTIER_SENDING||{},$=id=>document.getElementById(id);
 let token='',data=null,busy=false;
 const selected=new Set((new URL(location.href).searchParams.get('halls')||'').split(',').filter(Boolean));
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const notice=text=>{$('notice').textContent=text;};
 async function api(action,body){
   const r=await fetch(config.url+'/functions/v1/frontier-outreach/'+action,{method:body===undefined?'GET':'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const result=await r.json();if(!r.ok)throw Error(r.status===401?'Please sign in again.':r.status===403?'This account needs Frontier operator access.':result.error||'Request failed.');return result;
 }
 const latestEvent=email=>data.events.find(e=>e.email===email);
 const jobFor=id=>data.jobs.find(j=>j.hall_id===id);
 function eligible(contact){return Date.parse(contact.verified_at)>Date.now()-30*86400000&&!!contact.email&&!jobFor(contact.id)&&!(data.suppressions||[]).some(e=>e.email===contact.email);}
 function render(){
   $('login').hidden=true;$('console').hidden=false;
   $('issues').textContent=data.issues.join(' ');
   $('counts').textContent=`${data.contacts.length} hall packages · ${data.contacts.filter(eligible).length} ready contacts · ${data.jobs.length} queued or processed`;
   $('send').disabled=busy||data.issues.length>0||!data.contacts.some(c=>eligible(c)&&selected.has(c.id));
   const labels={queued:'Queued',importing:'Connecting to Instantly',imported:'In sending schedule',suppressed:'Stopped',unknown:'Needs review',failed:'Not sent',email_sent:'Sent',email_bounced:'Bounced',reply_received:'Replied',lead_unsubscribed:'Opted out'};
   $('halls').innerHTML=data.contacts.map(c=>{const job=jobFor(c.id),event=latestEvent(c.email),state=(data.suppressions||[]).find(s=>s.email===c.email)?.reason||event?.kind||job?.state;return `<div class="hall"><div class="row"><label><input type="checkbox" data-hall="${escape(c.id)}" ${selected.has(c.id)?'checked':''} ${eligible(c)?'':'disabled'}><strong>${escape(c.name)}</strong></label><span class="badge">${escape(labels[state]||(c.verified_at?'Ready':c.email?'Address needs verification':'Email address needed'))}</span></div><p class="muted">${escape(c.email||'No verified contact yet')}${job?.detail?' · '+escape(job.detail):''}</p><button class="secondary" data-preview="${escape(c.id)}">Review both emails</button></div>`;}).join('');
 }
 async function refresh(){data=await api('status');render();}
 $('login-form').onsubmit=async e=>{e.preventDefault();if(!config.publishableKey){notice('Backend setup is still being connected. The launch checklist below is ready.');return;}
  try{notice('Signing in…');const r=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});const result=await r.json();$('password').value='';if(!r.ok)throw Error('Sign-in failed. Check your operator account and password.');token=result.access_token;await refresh();notice('Signed in. Review your contacts below.');}catch(err){notice(err.message);}
 };
 $('logout').onclick=()=>{token='';data=null;$('login').hidden=false;$('console').hidden=true;$('halls').replaceChildren();notice('Signed out.');};
 $('refresh').onclick=async()=>{try{const sync=await api('sync',{});await refresh();notice(sync.synced?'Sending status checked with Instantly.':sync.reason);}catch(err){notice('Could not refresh from Instantly: '+err.message);}};
 $('pause').onclick=async()=>{try{await api('pause',{});await refresh();notice('Campaign paused. Emails already sent cannot be recalled.');}catch(err){notice(err.message);}};
 $('select-ready').onclick=()=>{data.contacts.filter(eligible).forEach(c=>selected.add(c.id));render();};
 $('halls').onchange=e=>{const id=e.target.dataset.hall;if(id){if(e.target.checked)selected.add(id);else selected.delete(id);render();}};
 $('halls').onclick=async e=>{const id=e.target.dataset.preview;if(!id)return;try{const c=await api('preview',{id});$('preview-title').textContent=c.name;$('subject-first').textContent=c.first_subject;$('subject-followup').textContent=c.followup_subject;$('preview-first').srcdoc=c.first_body;$('preview-followup').srcdoc=c.followup_body;$('preview').showModal();}catch(err){notice(err.message);}};
 $('close-preview').onclick=()=>$('preview').close();
 $('send').onclick=async()=>{if(busy||!data)return;const ids=data.contacts.filter(c=>eligible(c)&&selected.has(c.id)).map(c=>c.id);if(!ids.length)return;busy=true;render();
  try{const result=await api('enqueue',{ids});notice(`${result.queued} sequences queued. ${result.alreadyQueued} already queued. Instantly will send each step on its schedule.`);for(let i=0;i<Math.ceil(ids.length/10);i++){const step=await api('process',{});if(!step.processed)break;}await refresh();}catch(err){notice(err.message+' Refresh status before trying again.');}finally{busy=false;if(data)render();}
 };
})();
