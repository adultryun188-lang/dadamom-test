/* 다다맘 웹(community.html)과 앱(index.html)이 같이 쓰는 내용: 매거진 카드 모양, 자주 묻는 질문.
   여기를 고치면 웹과 앱이 함께 바뀐다. 모양(CSS)은 rounded-ui.css 의 .mag-* .faq-* */
(function(){
  'use strict';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function httpsUrl(u){ return /^https:\/\//i.test(u || '') ? String(u) : ''; }

  // ---------- 매거진 ----------
  // 원문을 복사해 오지 않는다: 제목 + 우리 요약 + 출처 이름 + 원문 링크. 사진은 우리 그림(thumb_url)이나 유튜브가 주는 썸네일만.
  var KINDS = {
    news:      { label:'뉴스',   emoji:'📰', bg:'#FFF3DF' },
    article:   { label:'읽을거리', emoji:'📖', bg:'#EDF4E6' },
    youtube:   { label:'영상',   emoji:'▶️', bg:'#FFF0E9' },
    instagram: { label:'인스타', emoji:'📸', bg:'#F6E7F0' }
  };
  function youtubeId(url){
    var m = String(url || '').match(/(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }
  function thumbOf(item){
    var own = httpsUrl(item.thumb_url);
    if(own) return own;
    if(item.kind === 'youtube'){ var id = youtubeId(item.url); if(id) return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
    return '';
  }
  function magCardHtml(item){
    var k = KINDS[item.kind] || KINDS.news;
    var url = httpsUrl(item.url);
    var th = thumbOf(item);
    var date = item.published_on ? String(item.published_on).slice(5).replace('-', '/') : '';
    var inner =
      '<span class="mag-thumb" style="background:' + k.bg + ';">' +
        (th ? '<img src="' + esc(th) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="mag-emoji" aria-hidden="true">' + k.emoji + '</span>') +
        (item.kind === 'youtube' ? '<span class="mag-play" aria-hidden="true">▶</span>' : '') +
      '</span>' +
      '<span class="mag-body">' +
        '<span class="mag-kind">' + k.label + (date ? ' · ' + esc(date) : '') + '</span>' +
        '<b class="mag-title">' + esc(item.title) + '</b>' +
        (item.summary ? '<span class="mag-sum">' + esc(item.summary) + '</span>' : '') +
        '<span class="mag-src">출처 ' + esc(item.source_name) + ' ↗</span>' +
      '</span>';
    return url
      ? '<a class="mag-card" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(item.title) + ' — 출처 ' + esc(item.source_name) + ', 새 창">' + inner + '</a>'
      : '<div class="mag-card">' + inner + '</div>';
  }
  var MAG_NOTE = '다다맘이 고른 육아 소식이에요. 제목과 짧은 소개만 싣고, 내용은 출처의 원문에서 확인해요. 저작권은 각 출처에 있어요.';

  // ---------- 자주 묻는 질문 ----------
  var FAQ = [
    { q:'다다맘은 어떤 서비스인가요?', a:'임신 중이거나 아이를 키우는 엄마 아빠를 위한 기록·커뮤니티 서비스예요. 월령에 맞는 정보, 수유·수면·성장 기록, 또래 부모 커뮤니티, 챌린지와 체험단, 육아 브랜드관을 한곳에서 쓸 수 있어요.' },
    { q:'어떻게 가입하나요?', a:'카카오·구글·네이버 계정이나 이메일로 가입할 수 있어요. 가입한 뒤 출산예정일이나 아이 생년월, 지역을 입력하면 시작돼요.' },
    { q:'글을 올렸는데 바로 안 보여요.', a:'모든 글과 사진은 운영자가 확인한 뒤 공개돼요. 내 글 목록에서 검수 상태를 볼 수 있어요.' },
    { q:'올린 사진은 누가 볼 수 있나요?', a:'사진은 비공개 저장소에 보관되고, 짧은 시간만 열리는 주소로 보여요. 성장 앨범 사진은 본인 계정에서만 열려요.' },
    { q:'수유·수면 기록과 준비물·선물 장부는 어디에 저장되나요?', a:'이 기기에만 저장되고 서버로 보내지 않아요. 그래서 휴대폰을 바꾸면 새 기기로 옮겨지지 않아요.' },
    { q:'챌린지 경품은 어떻게 받나요?', a:'챌린지 기간에 참여한 분 가운데 추첨해요. 발표일에 당첨자에게 가입한 이메일로 연락드려요.' },
    { q:'브랜드관에서 바로 살 수 있나요?', a:'다다맘은 상품을 소개하는 곳이에요. 구매하러 가기를 누르면 각 브랜드 스토어로 이동하고, 결제·배송·교환은 그 스토어에서 진행돼요.' },
    { q:'매거진 글은 누가 쓰나요?', a:'다다맘이 고른 육아 뉴스·기사·영상을 출처와 함께 소개해요. 제목과 짧은 소개만 싣고, 자세한 내용은 출처의 원문에서 볼 수 있어요.' },
    { q:'불쾌한 글이나 사용자는 어떻게 하나요?', a:'글 아래 신고를 누르면 운영자가 확인해요. 사용자를 차단하면 그 사람의 글이 보이지 않아요.' },
    { q:'회원 탈퇴는 어떻게 하나요?', a:'앱 MY 화면 맨 아래 회원 탈퇴에서 할 수 있어요. 계정과 글·사진이 함께 지워져요.' },
    { q:'그 밖에 문의는 어디로 하나요?', a:'ryundaen@gmail.com 으로 메일 주세요. 확인하는 대로 답장드려요.' }
  ];
  function faqHtml(){
    return '<div class="faq-list">' + FAQ.map(function(f, i){
      return '<details class="faq-item"' + (i === 0 ? ' open' : '') + '><summary><span class="faq-q" aria-hidden="true">Q</span><span>' + esc(f.q) + '</span></summary><p>' + esc(f.a) + '</p></details>';
    }).join('') + '</div>';
  }

  window.DadamomShared = { esc:esc, magKinds:KINDS, youtubeId:youtubeId, magCardHtml:magCardHtml, MAG_NOTE:MAG_NOTE, FAQ:FAQ, faqHtml:faqHtml };
})();
