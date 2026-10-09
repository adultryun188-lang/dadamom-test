// QA 전용 Supabase 스텁 (로컬에서만, 저장소에 안 올림)
(function(){
  var now = Date.now();
  var iso = function(m){ return new Date(now - m*60000).toISOString(); };
  var A='22222222-2222-2222-2222-222222222222', B='33333333-3333-3333-3333-333333333333', ADM='11111111-1111-1111-1111-111111111111';
  var store = {
    profiles:[{id:A,nickname:'하람이',kid_type:'parenting',parent_role:'mom',birth_month:'2025-06',due_date:null,region:'인천',interests:['이유식','수면교육'],onboarded:true},
              {id:ADM,nickname:'운영',kid_type:'parenting',parent_role:'dad',birth_month:'2025-01',region:'서울',interests:[],onboarded:true}],
    notices:[{id:'n1',title:'다다맘 오픈',body:'공지 본문입니다.',pinned:true,created_at:iso(500)}],
    outings:[{id:'o1',title:'실내 놀이터',region:'인천',kind:'place',description:'유아 놀이터',url:'',status:'approved',created_at:iso(300)}],
    community_posts:[
      {id:'p1',author:'콩이맘',owner_id:B,text:'첫 이유식 뭐로 시작하셨어요?',topic:'자랑',stage:'parenting',age_value:15,likes:3,comments:1,status:'approved',media_path:'',created_at:iso(60)},
      {id:'p2',author:'하람이맘',owner_id:A,text:'내가 쓴 승인된 글',topic:'자랑',stage:'parenting',age_value:15,likes:0,comments:0,status:'approved',media_path:B+'/x.jpg',created_at:iso(30)},
      {id:'p3',author:'하람이맘',owner_id:A,text:'검수 대기 중인 내 글',topic:'자랑',stage:'parenting',age_value:15,likes:0,comments:0,status:'pending',media_path:'',created_at:iso(10)}],
    challenge_entries:[
      {id:'e1',name:'콩이',age:'15개월',note:'첫걸음',owner_id:B,votes:5,status:'approved',media_path:B+'/e.jpg',created_at:iso(100)},
      {id:'e2',name:'하람이',age:'15개월',note:'내 참가작',owner_id:A,votes:1,status:'approved',media_path:A+'/e2.jpg',created_at:iso(90)}],
    post_comments:[{id:'c1',post_id:'p1',author:'하람이맘',owner_id:A,text:'저는 쌀미음이요',created_at:iso(20)}],
    benefit_applications:[], benefit_applications_pii:[], consent_records:[], reports:[], blocks:[],
    families:[], album_photos:[{id:'ap1',owner_id:A,path:A+'/a.jpg',taken_on:'2026-09-01',caption:'첫 사진',created_at:iso(1000)}],
    growth_records:[], entry_votes:[], post_likes:[]
  };
  var session=null, listeners=[];
  window.__SBSTUB={store:store, admin:false, calls:[],
    signIn:function(id,email){ session={user:{id:id,email:email,user_metadata:{}}}; listeners.forEach(function(f){f('SIGNED_IN',session);}); },
    signOut:function(){ session=null; listeners.forEach(function(f){f('SIGNED_OUT',null);}); },
    setSession:function(id,email){ session=id?{user:{id:id,email:email,user_metadata:{}}}:null; } };
  var uid=function(){ return session&&session.user.id; };
  function tbl(name){
    var rows=store[name]||(store[name]=[]);
    var F=[], op='select', payload=null, headCount=false, single=0, lim=null, wantRows=false;
    var api={};
    function m(r){ return F.every(function(f){ return f(r); }); }
    function run(){
      window.__SBSTUB.calls.push(name+':'+op);
      if(op==='insert'){ var out=[]; (Array.isArray(payload)?payload:[payload]).forEach(function(x){ var r=JSON.parse(JSON.stringify(x)); if(!r.id) r.id='id-'+Math.random().toString(36).slice(2,9); if(!r.created_at) r.created_at=new Date().toISOString(); if((name==='community_posts'||name==='challenge_entries')&&!r.status) r.status='pending'; if(!r.owner_id&&uid()) r.owner_id=uid(); rows.push(r); out.push(r); }); return {data: single? out[0] : (wantRows?out:null), error:null}; }
      if(op==='upsert'){ (Array.isArray(payload)?payload:[payload]).forEach(function(x){ var i=rows.findIndex(function(r){return r.id===x.id;}); if(i>=0) rows[i]=Object.assign({},rows[i],x); else rows.push(JSON.parse(JSON.stringify(x))); }); return {data:null,error:null}; }
      if(op==='update'){ rows.filter(m).forEach(function(r){ Object.assign(r,payload); }); return {data:null,error:null}; }
      if(op==='delete'){ var keep=rows.filter(function(r){return !m(r);}); var n=rows.length-keep.length; rows.length=0; Array.prototype.push.apply(rows,keep); return {data:null,error:null,count:n}; }
      var res=rows.filter(m); if(lim!=null) res=res.slice(0,lim);
      if(headCount) return {data:null,count:res.length,error:null};
      if(single===1) return {data:res[0]||null,error:res[0]?null:{message:'no rows'}};
      if(single===2) return {data:res[0]||null,error:null};
      return {data:JSON.parse(JSON.stringify(res)),error:null};
    }
    ['eq','neq','gt','gte','lt','lte','like','ilike','is','in','contains','match','filter','not','or','order','range','limit','select','single','maybeSingle','insert','update','delete','upsert'].forEach(function(k){
      api[k]=function(a,b,c){
        if(k==='eq') F.push(function(r){return r[a]===b;});
        else if(k==='neq') F.push(function(r){return r[a]!==b;});
        else if(k==='in') F.push(function(r){return (b||[]).indexOf(r[a])>-1;});
        else if(k==='match') F.push(function(r){return Object.keys(a).every(function(x){return r[x]===a[x];});});
        else if(k==='filter'){ if(b==='eq') F.push(function(r){return String(r[a])===String(c);}); }
        else if(k==='limit') lim=a;
        else if(k==='select'){ if(op==='insert') wantRows=true; else op='select'; if(b&&b.head) headCount=true; }
        else if(k==='single') single=1;
        else if(k==='maybeSingle') single=2;
        else if(k==='insert'||k==='upsert'){ op=k; payload=a; }
        else if(k==='update'){ op='update'; payload=a; }
        else if(k==='delete') op='delete';
        return api;
      };
    });
    api.then=function(res,rej){ return Promise.resolve(run()).then(res,rej); };
    return api;
  }
  var files={};
  function bucket(){ return {
    upload:function(p){ files[p]=1; return Promise.resolve({data:{path:p},error:null}); },
    remove:function(ps){ (ps||[]).forEach(function(p){delete files[p];}); return Promise.resolve({data:[],error:null}); },
    createSignedUrls:function(ps){ return Promise.resolve({data:(ps||[]).map(function(p){return {path:p,signedUrl:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/%3E',error:null};}),error:null}); },
    createSignedUrl:function(p){ return Promise.resolve({data:{signedUrl:'data:,'},error:null}); },
    getPublicUrl:function(p){ return {data:{publicUrl:'data:,'}}; } }; }
  window.supabase={ createClient:function(){ return {
    from:tbl, storage:{from:bucket},
    rpc:function(n,args){
      window.__SBSTUB.calls.push('rpc:'+n);
      var R={ is_admin:!!window.__SBSTUB.admin, trial_application_counts:[{trial_key:'a',n:3}], my_media_paths:[],
        delete_my_account:{ok:true}, edit_my_post:'pending', edit_my_entry:'pending',
        admin_applications:[{id:'ba1',trial_key:'a',nickname:'콩이',region:'서울',contact_masked:'010-****-5678',address_masked:'서울 강남구',created_at:iso(5),selected:false}],
        reveal_application_pii:[{contact:'010-1234-5678',address:'서울 강남구 테스트로 1'}],
        pii_purge_stats:[{due:0,total:1}], purge_expired_pii:0 };
      if(n==='edit_my_post'){ var r=store.community_posts.find(function(x){return x.id===args.post_id;}); if(r){r.text=args.new_text;r.status='pending';} }
      return Promise.resolve({data:(n in R)?R[n]:null,error:null});
    },
    auth:{
      getSession:function(){ return Promise.resolve({data:{session:session},error:null}); },
      getUser:function(){ return Promise.resolve({data:{user:session&&session.user},error:null}); },
      onAuthStateChange:function(f){ listeners.push(f); return {data:{subscription:{unsubscribe:function(){}}}}; },
      signOut:function(){ window.__SBSTUB.signOut(); return Promise.resolve({error:null}); },
      signInWithPassword:function(){ return Promise.resolve({data:{},error:{message:'Invalid login credentials'}}); },
      signUp:function(){ return Promise.resolve({data:{user:{id:'new'},session:null},error:null}); },
      signInWithOtp:function(){ return Promise.resolve({data:{},error:null}); },
      signInWithOAuth:function(){ return Promise.resolve({data:{},error:null}); }
    } }; } };
})();
