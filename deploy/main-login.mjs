// A small first-party login entry, deployed only at mouva.ai/video.
// It leaves the Design release and its release identity untouched.
const launchScript = `
const params = new URLSearchParams(location.search);
let language = params.get('lang') === 'en' ? 'en' : 'zh';
const copy = {
  zh: {title:'你的下一部作品，从这里开始。',waiting:'正在打开 Mouva Studio…',signin:'使用 Mouva 账号登录',help:'在新窗口完成登录，这里会自动继续。',retry:'重试',invalid:'登录链接不完整，请返回视频工作区重新开始。',error:'暂时无法连接，请重试。',account:'用已有账号进入视频创作工作区。'},
  en: {title:'Your next story starts here.',waiting:'Opening Mouva Studio…',signin:'Sign in with Mouva',help:'Finish signing in in the new window. This page will continue automatically.',retry:'Try again',invalid:'This sign-in link is incomplete. Start again from the video workspace.',error:'Could not connect. Please try again.',account:'Use your existing account to enter your video workspace.'}
};
const label = document.querySelector('#status'), button = document.querySelector('#continue'), selector = document.querySelector('#language');
let status = 'waiting', busy = false;
function render() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelector('h1').textContent = copy[language].title;
  document.querySelector('#account').textContent = copy[language].account;
  label.textContent = copy[language][status];
  button.textContent = copy[language][status === 'error' ? 'retry' : 'signin'];
  button.hidden = status === 'waiting' || status === 'invalid';
  selector.value = language;
}
selector.addEventListener('change', () => { language = selector.value; render(); });
function signIn() {
  const next = new URLSearchParams(params);
  next.set('lang', language);
  const destination = '/video?' + next.toString();
  const target = new URL('/auth', location.origin);
  target.searchParams.set('returnTo', destination);
  target.searchParams.set('lang',language);
  location.replace(target.href);
}
function token() { try { return localStorage.getItem('mouva-token') || localStorage.getItem('pdfio-token'); } catch { return null; } }
async function launch() {
  if (busy) return;
  const videoOrigin = 'https://video.mouva.ai';
  const challenge = params.get('challenge');
  if (!challenge) { const target = new URL('/', videoOrigin); target.searchParams.set('login','1'); target.searchParams.set('lang',language); if (params.get('section') === 'learn') target.searchParams.set('section','learn'); location.replace(target.href); return; }
  if (!/^[a-f0-9]{64}$/.test(challenge)) { status = 'invalid'; render(); return; }
  const bearer = token();
  if (!bearer) { signIn(); return; }
  busy = true; status = 'waiting'; render();
  try {
    const response = await fetch('https://api.mouva.ai/video-api/api/ai/auth/handoff', {
      method:'POST', credentials:'omit', redirect:'error',
      headers:{Authorization:'Bearer ' + bearer,'Content-Type':'application/json'},
      body:JSON.stringify({challenge}), signal:AbortSignal.timeout(20000)
    });
    if (response.status === 401) { signIn(); return; }
    if (!response.ok) throw new Error('handoff');
    const data = await response.json(), target = new URL(data.launchUrl);
    const code = new URLSearchParams(target.hash.slice(1)).get('handoff');
    if (target.origin !== videoOrigin || target.pathname !== '/' || !/^[A-Za-z0-9_-]{43}$/.test(code || '')) throw new Error('address');
    target.searchParams.set('lang',language);
    if (params.get('section') === 'learn') target.searchParams.set('section','learn');
    location.replace(target.href);
  } catch { status = 'error'; }
  finally { busy = false; render(); }
}
button.addEventListener('click', () => {
  if (status === 'error') { void launch(); return; }
  signIn();
});
window.addEventListener('storage', event => { if (event.key === 'mouva-token' && event.newValue) void launch(); });
window.addEventListener('focus', () => { if (status === 'help' && token()) void launch(); });
render(); void launch();
`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22/%3E"><title>Mouva Studio</title><style>
*{box-sizing:border-box}body{margin:0;background:#141414;color:#eee;font:16px system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{width:min(520px,100%);padding:48px 28px;text-align:center}a{color:inherit;text-decoration:none}.brand{font-weight:750;font-size:32px;letter-spacing:-1px}.brand span{font-size:17px;font-weight:400;color:#a2b58c;margin-left:8px}h1{font-size:32px;line-height:1.3;margin-top:42px}p{color:#a4a79f;line-height:1.7}button{border:0;background:#b8cea0;color:#182013;padding:14px 24px;border-radius:12px;font:inherit;font-weight:600;cursor:pointer}select{background:#242624;color:#ddd;border:1px solid #41453c;border-radius:8px;padding:7px;position:absolute;top:24px;right:24px}#status{min-height:56px;font-size:14px}</style><script src="/video/launch.js" defer></script></head><body><select id="language" aria-label="Language / 语言"><option value="zh">中文</option><option value="en">English</option></select><main><a class="brand" href="/">mouva<span>studio</span></a><h1></h1><p id="account"></p><p id="status" role="status"></p><button id="continue" hidden></button></main></body></html>`;
export function mainLogin(request) {
  const url = new URL(request.url);
  if (url.origin !== 'https://mouva.ai' || !url.pathname.startsWith('/video')) return null;
  const headers = {
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src https://api.mouva.ai; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
  const script = url.pathname === '/video/launch.js';
  if (!script && !['/video','/video/'].includes(url.pathname)) return new Response('Not found',{status:404,headers});
  return new Response(request.method === 'HEAD' ? null : script ? launchScript : html,{headers:{...headers,'Content-Type':script?'text/javascript; charset=utf-8':'text/html; charset=utf-8'}});
}
