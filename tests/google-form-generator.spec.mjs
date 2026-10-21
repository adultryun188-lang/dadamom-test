// Google Apps Script의 로컬 모의 검증. Google 접속·폼 생성·응답 제출은 하지 않는다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const file = fileURLToPath(new URL('../docs/다다맘_예시설문지_자동생성_2026-10-21.gs',import.meta.url));
const source = fs.readFileSync(file,'utf8');
new vm.Script(source,{filename:file});
let passed=0;
function check(name,value){assert(value,name);console.log('PASS '+name);passed++;}

function harness(){
  const properties=new Map(), forms=new Map(), logs=[];
  const stats={creates:0,opens:0,writes:0,released:0,failAddAt:0,adds:0,canLock:true};
  const types={TEXT:'TEXT',PARAGRAPH_TEXT:'PARAGRAPH_TEXT',SECTION_HEADER:'SECTION_HEADER'};
  function makeItem(type){return {
    type,title:'',help:'',required:false,
    setTitle(v){this.title=v;stats.writes++;return this;},getTitle(){return this.title;},
    setHelpText(v){this.help=v;stats.writes++;return this;},getHelpText(){return this.help;},
    setRequired(v){this.required=v;stats.writes++;return this;},isRequired(){return this.required;},
    getType(){return this.type;},
    asTextItem(){assert.equal(this.type,types.TEXT);return this;},
    asParagraphTextItem(){assert.equal(this.type,types.PARAGRAPH_TEXT);return this;}
  };}
  function makeForm(title,published){
    const form={id:'mock-form-'+forms.size,title,published,accepting:published,items:[],email:false,description:'',
      getId(){return this.id;},getEditUrl(){return 'https://docs.google.com/forms/d/'+this.id+'/edit';},
      getTitle(){return this.title;},isPublished(){return this.published;},isAcceptingResponses(){return this.accepting;},
      supportsAdvancedResponderPermissions(){return true;},getItems(){return this.items.slice();},
      setDescription(v){this.description=v;stats.writes++;return this;},
      setCollectEmail(v){this.email=v;stats.writes++;return this;},collectsEmail(){return this.email;},
      setPublished(v){assert.equal(v,false,'공개 게시 금지');this.published=v;this.accepting=v;stats.writes++;return this;},
      setAcceptingResponses(v){assert.equal(v,false,'응답 수집 시작 금지');this.accepting=v;stats.writes++;return this;},
      add(type){
        stats.adds++;
        if(stats.failAddAt===stats.adds) throw Error('모의 중단');
        const item=makeItem(type);this.items.push(item);stats.writes++;return item;
      },
      addTextItem(){return this.add(types.TEXT);},
      addParagraphTextItem(){return this.add(types.PARAGRAPH_TEXT);},
      addSectionHeaderItem(){return this.add(types.SECTION_HEADER);}
    };
    for(const method of ['setLimitOneResponsePerUser','setPublishingSummary','setAllowResponseEdits',
      'setShowLinkToRespondAgain','setShuffleQuestions','setIsQuiz','setCustomClosedFormMessage']){
      form[method]=function(v){this[method+'Value']=v;stats.writes++;return this;};
    }
    forms.set(form.id,form);return form;
  }
  const box={Logger:{log:v=>logs.push(v)},LockService:{getUserLock:()=>({tryLock:()=>stats.canLock,releaseLock(){stats.released++;}})},
    PropertiesService:{getUserProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
    FormApp:{ItemType:types,create(title,published){assert.equal(published,false);stats.creates++;return makeForm(title,published);},
      openById(id){stats.opens++;if(!forms.has(id))throw Error('폼 접근 불가');return forms.get(id);}}
  };
  vm.createContext(box);vm.runInContext(source,box);
  return {box,properties,forms,logs,stats,makeForm,run:()=>box.makeDadamomDemoForm()};
}

const h=harness();
const blueprint=h.box.getDadamomDemoBlueprint_();
check('문항 구성 37항목',blueprint.length===37);
check('닉네임 입력란 1개',blueprint.filter(i=>i.kind==='text').length===1);
check('주관식 장문 30개',blueprint.filter(i=>i.kind==='paragraph').length===30);
check('주제 구분 6개',blueprint.filter(i=>i.kind==='header').length===6);
const qs=blueprint.filter(i=>i.kind==='paragraph');
check('질문 번호 1~30 유지',qs.every((q,i)=>q.title.startsWith((i+1)+'. ')));
check('질문 제목 중복 없음',new Set(qs.map(q=>q.title)).size===30);
check('닉네임은 가상 이름 안내',blueprint[0].help.includes('구름맘')&&blueprint[0].help.includes('실명'));
const untouched=h.makeForm('기존 설문지',false),untouchedSnapshot=JSON.stringify(untouched);
const url=h.run(), form=[...h.forms.values()].find(f=>f!==untouched);
check('새 폼 1개만 생성',h.stats.creates===1);
check('기존 설문지 변경 없음',JSON.stringify(untouched)===untouchedSnapshot);
check('기존 설문지 열람 없음',h.stats.opens===0);
check('편집 주소 출력',url.endsWith('/edit')&&h.logs.some(l=>l.includes(url)));
check('예시용 제목·설명',form.title.includes('[예시용]')&&form.description.includes('실제 조사·회원 응답 수집용이 아닙니다'));
check('모든 입력 선택 사항',form.items.filter(i=>i.type!=='SECTION_HEADER').every(i=>!i.required));
check('가상 닉네임+30문항 실제 구성',form.items.length===37&&form.items.filter(i=>i.type==='PARAGRAPH_TEXT').length===30);
check('미게시 및 응답 중지',!form.published&&!form.accepting);
check('이메일·응답 요약 수집/공개 꺼짐',!form.email&&form.setPublishingSummaryValue===false);
check('로그인 강제용 1인 1응답 설정 안 함',form.setLimitOneResponsePerUserValue===false);
const writes=h.stats.writes;
form.title='사용자가 고친 제목';
check('재실행 시 같은 주소',h.run()===url);
check('재실행 시 중복 생성·항목 추가·설정 덮어쓰기 없음',h.stats.creates===1&&form.items.length===37&&h.stats.writes===writes);
check('사용자가 바꾼 제목 유지',form.title==='사용자가 고친 제목');
check('락 해제 보장',h.stats.released===2);

const partial=harness();partial.stats.failAddAt=9;
assert.throws(partial.run,/모의 중단/);
check('중간 실패 시 편집 주소 안내',partial.logs.some(l=>l.includes('중간에 멈춘 설문지 편집 주소')));
check('중간 실패도 새 폼 ID 보관',partial.properties.size===1&&partial.stats.creates===1);
partial.stats.failAddAt=0;
partial.run();
const resumed=[...partial.forms.values()][0];
check('재개 시 기존 항목 중복 없이 완성',partial.stats.creates===1&&resumed.items.length===37);

const modified=harness();modified.stats.failAddAt=5;assert.throws(modified.run,/모의 중단/);
const modifiedForm=[...modified.forms.values()][0];modifiedForm.items[0].title='사용자 편집 닉네임';
const priorWrites=modified.stats.writes;
assert.throws(modified.run,/생성 구성과 달라/);
check('미완성 폼의 사용자 편집 발견 시 중단',modified.stats.writes===priorWrites&&modifiedForm.items[0].title==='사용자 편집 닉네임');

const noAccess=harness();noAccess.properties.set('DADAMOM_DEMO_SURVEY_20261021_V1',JSON.stringify({id:'gone',version:1,complete:true}));
assert.throws(noAccess.run,/폼 접근 불가/);
check('기존 생성본 접근 불가 시 새 폼 자동 생성 안 함',noAccess.stats.creates===0);
const corrupt=harness();corrupt.properties.set('DADAMOM_DEMO_SURVEY_20261021_V1','broken');assert.throws(corrupt.run);
check('잘못된 저장 기록은 생성 전에 중단',corrupt.stats.creates===0);
const locked=harness();locked.stats.canLock=false;assert.throws(locked.run,/실행 중/);
check('중복 동시 실행 차단',locked.stats.creates===0);
check('메일·외부 통신·응답 제출·삭제 API 없음',!/(?:GmailApp|MailApp|UrlFetchApp|DriveApp|\.submit\s*\(|deleteItem\s*\(|setDestination\s*\()/u.test(source));
console.log('완료: '+passed+'개 로컬 모의 검증 통과. Google 계정에서 실제 실행한 결과는 아닙니다.');
