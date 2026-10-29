// --input <최소 필드 JSON> 또는 --live-test. 원격은 알려진 테스트 계정 3명만 허용.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {summarize}=createRequire(import.meta.url)('../retention-metrics.cjs');
const args=process.argv.slice(2);
if(args[0]==='--input'&&args.length===2){
  console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(args[1],'utf8'))),null,2));
}else if(args.length===1&&args[0]==='--live-test'){
  const env=fs.readFileSync(new URL('../config/env.staging.js',import.meta.url),'utf8');
  const U=env.match(/SUPABASE_URL:\s*'([^']+)'/)[1],K=env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
  assert.equal(new URL(U).origin,'https://srxdtddrtnhtlbbviyvs.supabase.co');
  const cohort=[],actions=[];
  async function request(path,token,body){
    const res=await fetch(U+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),
      headers:{apikey:K,Authorization:'Bearer '+(token||K),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(!res.ok)throw Error('테스트 측정 요청 실패 HTTP '+res.status);
    return res.json();
  }
  for(const email of ['momA@dadamom.test','momB@dadamom.test','dadC@dadamom.test']){
    const auth=await request('/auth/v1/token?grant_type=password',null,{email,password:'dadamom-test-1234'});
    const token=auth.access_token,uid=auth.user.id;
    try{
      const rows=await request('/rest/v1/profiles?select=id,created_at&id=eq.'+uid,token);
      assert.equal(rows.length,1,'테스트 프로필 필요');cohort.push({id:uid,joined_at:rows[0].created_at});
      for(const [table,kind] of [['community_posts','post'],['post_comments','comment']]){
        for(let offset=0;;offset+=200){
          const found=await request(`/rest/v1/${table}?select=id,owner_id,created_at&owner_id=eq.${uid}&order=id&limit=200&offset=${offset}`,token);
          actions.push(...found.map(r=>({id:r.id,user_id:r.owner_id,at:r.created_at,kind})));
          if(found.length<200)break;
        }
      }
    }finally{
      const res=await fetch(U+'/auth/v1/logout',{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:K,Authorization:'Bearer '+token}});
      if(!res.ok)throw Error('측정용 테스트 세션 종료 실패');
    }
  }
  const result=summarize({cohort,actions,asOf:new Date().toISOString()});
  console.log(JSON.stringify({mode:'TEST_FIXTURE_VALIDATION_NOT_CUSTOMER_METRICS',...result},null,2));
}else throw Error('사용법: node scripts/p0-retention-report.mjs --input 최소필드.json | --live-test');
