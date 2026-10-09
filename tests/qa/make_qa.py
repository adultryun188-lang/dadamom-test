# index.html -> qa.html : Supabase CDN 을 stub.js 로 바꾸고 서비스워커 등록을 끈다.
# 사용: python3 tests/qa/make_qa.py  (저장소 루트에서)
import os
root = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(root, '..', '..', 'index.html')
s = open(src, encoding='utf-8').read()
cdn = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
assert s.count(cdn) == 1, 'supabase CDN 태그를 못 찾음'
s = s.replace(cdn, '<script src="./stub.js"></script>')
s = s.replace('navigator.serviceWorker.register(', '(function(){return Promise.resolve()})(', 1)
open(os.path.join(root, 'qa.html'), 'w', encoding='utf-8').write(s)
print('qa.html 생성')
