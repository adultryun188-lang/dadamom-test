/* 앱·웹 커뮤니티 간 공유/가입 복귀. 외부 주소는 복귀 대상으로 받지 않는다. */
(function(root){
  'use strict';
  var FROM_RE = /^[A-Za-z0-9-]{1,32}$/;
  var POST_RE = /^[A-Za-z0-9-]{1,80}$/;
  // 가입 뒤 돌아갈 수 있는 곳: 커뮤니티 글·글쓰기, 그리고 광고가 데려오는 앱의 챌린지·혜택(체험단) 화면
  var APP_ROUTES = ['#challenge', '#benefit'];
  function returnRoute(value){
    return typeof value === 'string' && (/^#\/p\/[A-Za-z0-9-]{1,80}$/.test(value) || value === '#/write' || APP_ROUTES.indexOf(value) > -1) ? value : '';
  }
  function campaign(source, target){
    var values = source.searchParams.getAll('from');
    if(values.length === 1 && FROM_RE.test(values[0])) target.searchParams.set('from', values[0]);
  }
  function postUrl(id, href){
    if(typeof id !== 'string' || !POST_RE.test(id)) return '';
    var source = new URL(href), target = new URL('./community.html', source);
    campaign(source, target);
    target.hash = '/p/' + id;
    return target.href;
  }
  function authEntry(href){
    var source = new URL(href), target = new URL('./index.html', source);
    var route = returnRoute(source.hash);
    if(route) target.searchParams.set('returnTo', route);
    campaign(source, target);
    target.hash = 'onboarding';
    return target.href;
  }
  function callbackUrl(href){
    var source = new URL(href), target = new URL('./index.html', source);
    var values = source.searchParams.getAll('returnTo');
    var route = values.length === 1 ? returnRoute(values[0]) : '';
    if(route) target.searchParams.set('returnTo', route);
    campaign(source, target);
    return target.href;
  }
  function returnUrl(href){
    var source = new URL(href), values = source.searchParams.getAll('returnTo');
    var route = values.length === 1 ? returnRoute(values[0]) : '';
    if(!route) return '';
    var target = new URL(APP_ROUTES.indexOf(route) > -1 ? './index.html' : './community.html', source);
    campaign(source, target);
    target.hash = route;
    return target.href;
  }
  // 앱의 챌린지·혜택 화면에서 로그인을 요구할 때, 가입 뒤 이 화면으로 돌아오도록 주소에 남긴다. 해당 없으면 ''.
  function keepReturn(href){
    var url = new URL(href), route = APP_ROUTES.indexOf(url.hash) > -1 ? url.hash : '';
    if(!route) return '';
    url.searchParams.set('returnTo', route);
    return url.href;
  }
  var api = { postUrl:postUrl, authEntry:authEntry, callbackUrl:callbackUrl, returnUrl:returnUrl, keepReturn:keepReturn };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DadamomCommunityFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);
