window.T = {
  types:{mov:'video/quicktime',mp4:'video/mp4',avi:'video/x-msvideo',wmv:'video/x-ms-wmv',flv:'video/x-flv',mp3:'audio/mpeg',webm:'video/webm',mkv:'video/x-matroska'},
  async file(name, as){ const r=await fetch('/test-assets/'+name); const b=await r.blob(); const n=as||name; return new File([b], n, {type:this.types[n.split('.').pop().toLowerCase()]||''}); },
  async load(files){ const dt=new DataTransfer(); files.forEach(f=>dt.items.add(f)); const inp=document.getElementById('crInput'); inp.files=dt.files; inp.dispatchEvent(new Event('change')); },
  cards(){ return [...document.querySelectorAll('.cr-file-card')].map(c=>({name:c.querySelector('.result-name').textContent, err:c.classList.contains('cr-file-card-error'), meta:c.querySelector('.cr-card-meta').textContent, size:c.querySelector('.result-size').textContent.replace(/\s+/g,' ')})); },
  wait:ms=>new Promise(r=>setTimeout(r,ms)),
  status(){ return document.getElementById('crStatus').textContent; },
  btn(){ return document.getElementById('crCompressBtn').textContent; },
  captureDownloads(){ window.__outs=[]; window.downloadBlob=(b,n)=>{window.__outs.push({n,size:b.size});}; },
  async waitIdle(maxMs){ const t0=performance.now(); while(performance.now()-t0<maxMs){ await this.wait(500); if(this.btn()!=='Cancel') break; } return Math.round((performance.now()-t0)/100)/10; },
  mem(){ const m=performance.memory; return m?Math.round(m.usedJSHeapSize/1048576)+' MB heap':'n/a'; }
};
'harness ready'
