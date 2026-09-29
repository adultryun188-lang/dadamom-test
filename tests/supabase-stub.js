// 테스트용 supabase 스텁: 로그인 상태와 profiles 테이블을 메모리로 흉내낸다.
(function(){
  var store = { profiles: [], notices: [], outings: [], community_posts: [], challenge_entries: [], post_comments: [], benefit_applications: [] };
  var session = null;
  var listeners = [];
  window.__SBSTUB = {
    store: store,
    signIn: function(id, email){
      session = { user: { id: id, email: email } };
      window.__SBSTUB.curId = id;
      listeners.forEach(function(f){ f('SIGNED_IN', session); });
    },
    signOut: function(){ session = null; listeners.forEach(function(f){ f('SIGNED_OUT', null); }); },
    setSession: function(s){ session = s; }
  };
  function tbl(name){
    var rows = store[name] || (store[name] = []);
    var filters = [];
    var op = null, payload = null;
    function match(r){ return filters.every(function(f){ return r[f[0]] === f[1]; }); }
    function run(){
      if(op === 'update'){
        rows.filter(match).forEach(function(r){ Object.assign(r, payload); });
        return { data:null, error:null };
      }
      if(op === 'delete'){
        var keep = rows.filter(function(r){ return !match(r); });
        rows.length = 0; Array.prototype.push.apply(rows, keep);
        return { data:null, error:null };
      }
      return { data: rows.filter(match), error: null };
    }
    var api = {
      select: function(){ op = op || 'select'; return api; },
      eq: function(c,v){ filters.push([c,v]); return api; },
      or: function(){ return api; },
      order: function(){ return api; },
      limit: function(){ return api; },
      maybeSingle: function(){ return Promise.resolve({ data: rows.filter(match)[0] || null, error:null }); },
      single: function(){ return Promise.resolve({ data: rows.filter(match)[0] || null, error:null }); },
      insert: function(p){
        (Array.isArray(p)?p:[p]).forEach(function(x){
          var r = JSON.parse(JSON.stringify(x));
          if(!r.id) r.id = 'id-' + Math.random().toString(36).slice(2,10);
          if(name === 'album_photos' && !r.taken_on) r.taken_on = new Date().toISOString().slice(0,10);
          if(name === 'reports' && !r.status) r.status = 'open';
          if((name === 'community_posts' || name === 'challenge_entries') && !r.status) r.status = 'pending';
          if(!r.created_at) r.created_at = new Date().toISOString();
          rows.push(r);
        });
        return Promise.resolve({ data:null, error:null });
      },
      upsert: function(p){
        (Array.isArray(p)?p:[p]).forEach(function(x){
          var i = rows.findIndex(function(r){ return r.id === x.id; });
          if(i>=0) rows[i] = Object.assign({}, rows[i], x); else rows.push(JSON.parse(JSON.stringify(x)));
        });
        return Promise.resolve({ data:null, error:null });
      },
      update: function(p){ op = 'update'; payload = p; return api; },
      delete: function(){ op = 'delete'; return api; },
      then: function(res, rej){ return Promise.resolve(run()).then(res, rej); }
    };
    return api;
  }

  var files = {};   // path -> true
  function bucket(name){
    return {
      upload: function(path, f){ files[path] = true; return Promise.resolve({ data:{path:path}, error:null }); },
      remove: function(paths){ (paths||[]).forEach(function(p){ delete files[p]; }); return Promise.resolve({ data:null, error:null }); },
      createSignedUrls: function(paths){
        return Promise.resolve({ data: (paths||[]).map(function(p){
          return { path:p, signedUrl:'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22100%22 height%3D%22100%22%3E%3Crect width%3D%22100%22 height%3D%22100%22 fill%3D%22%23ccc%22%2F%3E%3C%2Fsvg%3E' };
        }), error:null });
      },
      createSignedUrl: function(p){ return Promise.resolve({ data:{ signedUrl:'https://x/'+p }, error:null }); },
      getPublicUrl: function(p){ return { data:{ publicUrl:'https://x/'+p } }; }
    };
  }
  window.__SBSTUB.files = files;

  window.supabase = {
    createClient: function(){
      return {
        storage: { from: bucket },
        from: tbl,
        rpc: function(name){
          if(name === 'delete_my_account'){
            window.__SBSTUB.deleted = true;
            store.profiles = store.profiles.filter(function(r){ return r.id !== (window.__SBSTUB.curId||''); });
            return Promise.resolve({ data:{deleted_media:0}, error:null });
          }
          if(name === 'is_admin') return Promise.resolve({ data: !!window.__SBSTUB.admin, error:null });
          return Promise.resolve({ data:false, error:null });
        },
        auth: {
          getSession: function(){ return Promise.resolve({ data: { session: session }, error: null }); },
          onAuthStateChange: function(f){ listeners.push(f); return { data:{ subscription:{ unsubscribe:function(){} } } }; },
          signOut: function(){ window.__SBSTUB.signOut(); return Promise.resolve({ error:null }); },
          signInWithPassword: function(){ return Promise.resolve({ error:null }); },
          signInWithOtp: function(){ return Promise.resolve({ error:null }); },
          signInWithOAuth: function(){ return Promise.resolve({ error:null }); }
        }
      };
    }
  };
})();
