// Renders docs/technical-plan.md into docs/technical-plan.html (a self-contained page
// that uses marked from cdnjs at view time). Usage: node docs/tools/render-plan.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, '..', 'technical-plan.md'), 'utf8').replace(/<\/script/gi, '<\\/script');

const html = `<title>Chips Technical Plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400..700&display=swap">
<style>
*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:light;--bg:#FBFBF8;--surface:#FFFFFF;--surface-2:#F2F2EC;--line:#E4E4DC;--line-2:#CDCDC3;--ink:#16181D;--ink-2:#4A4D56;--ink-3:#7B7E88;--ink-4:#A9ABB3;--gold:#F5C542;--gold-deep:#7D5B00;--gold-soft:#FFF3C4;--green-soft:#E0F4E9;--green-ink:#176B43;
--font-display:"Bricolage Grotesque","Avenir Next",system-ui,sans-serif;--font-body:"Instrument Sans",-apple-system,"Segoe UI",Roboto,sans-serif;--font-mono:"JetBrains Mono","SF Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#111215;--surface:#191B20;--surface-2:#20232A;--line:#2A2D35;--line-2:#3D414B;--ink:#ECEDE8;--ink-2:#B9BBC3;--ink-3:#868993;--ink-4:#5F626C;--gold:#F5C542;--gold-deep:#F2CF6B;--gold-soft:#3B300E;--green-soft:#17352B;--green-ink:#8CE0B6}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#111215;--surface:#191B20;--surface-2:#20232A;--line:#2A2D35;--line-2:#3D414B;--ink:#ECEDE8;--ink-2:#B9BBC3;--ink-3:#868993;--ink-4:#5F626C;--gold:#F5C542;--gold-deep:#F2CF6B;--gold-soft:#3B300E;--green-soft:#17352B;--green-ink:#8CE0B6}
html{scroll-behavior:smooth;scroll-padding-top:76px}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.top-in{max-width:1180px;margin:0 auto;padding:0 24px;height:56px;display:flex;align-items:center;gap:14px}
.brand{display:flex;align-items:center;gap:8px;font-family:var(--font-display);font-weight:700;font-size:21px;letter-spacing:-.03em;text-decoration:none;color:inherit}
.brand svg{width:24px;height:24px}
.top .what{font-size:13px;color:var(--ink-3)}
.top .ver{margin-left:auto;font-family:var(--font-mono);font-size:12px;color:var(--ink-3)}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:minmax(0,1fr);gap:40px}
@media (min-width:1000px){.wrap{grid-template-columns:250px minmax(0,1fr)}}
nav.toc{display:none}
@media (min-width:1000px){nav.toc{display:block;position:sticky;top:76px;align-self:start;max-height:calc(100vh - 96px);overflow:auto;padding:28px 0 40px;font-size:13px;scrollbar-width:thin}}
nav.toc a{display:block;color:var(--ink-2);text-decoration:none;padding:4px 10px;border-left:2px solid transparent;border-radius:0 6px 6px 0;line-height:1.35}
nav.toc a.l3{padding-left:22px;color:var(--ink-3);font-size:12.5px}
nav.toc a:hover{background:var(--surface-2);color:var(--ink)}
nav.toc a.active{border-left-color:var(--gold);color:var(--ink)}
article{padding:36px 0 96px;min-width:0}
article>*:first-child{margin-top:0}
h1,h2,h3,h4{font-family:var(--font-display);letter-spacing:-.02em;line-height:1.15;text-wrap:balance}
h1{font-size:clamp(34px,4.5vw,50px);margin:0 0 8px;font-variation-settings:"opsz" 96}
h1+p{color:var(--ink-3);font-size:14px}
h2{font-size:clamp(24px,2.6vw,30px);margin:64px 0 16px;padding-top:24px;border-top:1px solid var(--line)}
h3{font-size:20px;margin:36px 0 10px}
h4{font-size:16px;margin:26px 0 8px}
p,ul,ol{margin:0 0 14px;color:var(--ink-2);max-width:78ch}
li{margin:4px 0}
li>p{margin:0}
strong{color:var(--ink);font-weight:600}
a{color:var(--gold-deep)}
hr{border:0;border-top:1px solid var(--line);margin:40px 0}
code{font-family:var(--font-mono);font-size:.9em;background:var(--surface-2);padding:1px 5px;border-radius:5px;color:var(--ink)}
pre{background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:16px 18px;overflow-x:auto;font-size:12.5px;line-height:1.55;margin:0 0 18px}
pre code{background:none;padding:0;font-size:inherit;color:var(--ink-2)}
table{border-collapse:collapse;width:100%;font-size:14px;margin:0 0 20px;display:block;overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table thead th{text-align:left;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:600;padding:12px 14px;border-bottom:1px solid var(--line-2);white-space:nowrap}
table td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--ink-2);min-width:140px}
table tr:last-child td{border-bottom:0}
table td:first-child{color:var(--ink);font-weight:600}
input[type=checkbox]{accent-color:var(--gold-deep);margin:0 8px 0 0;vertical-align:-2px}
li.task{list-style:none;margin-left:-20px}
li.task.done{color:var(--ink-3);text-decoration:line-through}
blockquote{margin:0 0 14px;padding:10px 16px;border-left:3px solid var(--gold);background:var(--gold-soft);border-radius:0 10px 10px 0;color:var(--ink)}
.gate{background:var(--surface);border:1px solid var(--line-2);border-radius:14px;padding:6px 20px 14px;margin:20px 0}
.fallback{white-space:pre-wrap;font-family:var(--font-mono);font-size:13px;color:var(--ink-2)}
</style>
<header class="top"><div class="top-in"><a class="brand" href="#top"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H14.61A4.5 4.5 0 0 0 20 9.39V16A4 4 0 0 1 16 20H8A4 4 0 0 1 4 16V8A4 4 0 0 1 8 4Z" fill="#F5C542"/><path d="M8 1.5v2.5M12 1.5v2.5M8 20v2.5M12 20v2.5M16 20v2.5M1.5 8h2.5M1.5 12h2.5M1.5 16h2.5M20 12h2.5M20 16h2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>chips</a><span class="what">Technical plan</span><span class="ver">v0.1 · sep 2026</span></div></header>
<div class="wrap" id="top"><nav class="toc" aria-label="Contents"></nav><article id="out"><pre class="fallback" id="raw"></pre></article></div>
<script type="text/markdown" id="src">${md}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
<script>
(function(){
  var src=document.getElementById('src').textContent;
  var out=document.getElementById('out');
  if(!window.marked){document.getElementById('raw').textContent=src;return;}
  marked.setOptions({gfm:true,breaks:false,headerIds:true,mangle:false});
  out.innerHTML=marked.parse(src);
  // task list styling
  out.querySelectorAll('li').forEach(function(li){var cb=li.querySelector(':scope > input[type=checkbox]');if(cb){li.classList.add('task');if(cb.checked)li.classList.add('done');}});
  // gate protocol callout: wrap the "Phase gate protocol" section heading's paragraphs? keep simple.
  // table of contents
  var toc=document.querySelector('nav.toc');var hs=out.querySelectorAll('h2,h3');
  hs.forEach(function(h){if(!h.id){h.id=h.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-');}var a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent.replace(/^\\d+(\\.\\d+)?\\s*·?\\s*/,'');if(h.tagName==='H3')a.className='l3';toc.appendChild(a);});
  var links=[].slice.call(toc.querySelectorAll('a'));
  if('IntersectionObserver' in window){var current=null;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(l){l.classList.toggle('active',l.getAttribute('href')==='#'+e.target.id);});}});},{rootMargin:'-70px 0px -70% 0px'});hs.forEach(function(h){io.observe(h);});}
})();
</script>
`;
writeFileSync(join(here, '..', 'technical-plan.html'), html);
console.log('wrote technical-plan.html', html.length);
