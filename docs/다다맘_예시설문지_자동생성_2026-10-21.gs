/**
 * 다다맘 예시용 Google Forms 자동 생성기 — 2026-10-21
 * 실행할 함수: makeDadamomDemoForm
 *
 * 새 비공개 폼에 가상 닉네임 1칸 + 선택형(필수 아님) 장문 답변 30문항을 만듭니다.
 * 여기서 '선택'은 객관식이 아니라 답변하지 않고 건너뛸 수 있다는 뜻입니다.
 * 기존에 열어둔 설문지·다다맘 앱·DB는 수정하지 않습니다.
 * 공개 게시, 응답 제출, 이메일 발송, 파일 삭제, 외부 서버 전송은 하지 않습니다.
 * 같은 스크립트 프로젝트·Google 계정에서 재실행하면 중복 생성을 막습니다.
 */

function makeDadamomDemoForm() {
  var title = '[예시용] 다다맘 출산·육아 경험 설문';
  var propertyKey = 'DADAMOM_DEMO_SURVEY_20261021_V1';
  var marker = '다다맘 예시 설문 자동 생성 v1';
  var lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) {
    throw new Error('이미 생성 작업이 실행 중입니다. 잠시 후 같은 함수를 다시 실행하세요.');
  }

  var form = null;
  try {
    var properties = PropertiesService.getUserProperties();
    var saved = properties.getProperty(propertyKey);
    var state = saved ? JSON.parse(saved) : null;
    if (state && (!state.id || state.version !== 1)) {
      throw new Error('저장된 생성 기록이 올바르지 않습니다. 기록을 임의로 삭제하지 말고 도움을 요청하세요.');
    }

    if (state) {
      // 이 스크립트가 직접 생성해 기록한 폼만 다시 엽니다.
      // 접근 불가 시 새 폼을 자동 생성하지 않으므로 중복 생성을 피합니다.
      form = FormApp.openById(state.id);
      if (state.complete === true) {
        logDadamomDemoResult_(form, '이미 만든 설문지입니다. 내용이나 설정은 다시 수정하지 않았습니다.');
        return form.getEditUrl();
      }
      if (form.getTitle() !== title || form.isPublished() || form.isAcceptingResponses()) {
        throw new Error('미완성 폼의 제목 또는 공개 상태가 변경돼 자동 재개를 중단했습니다. 기존 내용은 삭제하지 않습니다.');
      }
    } else {
      // false를 명시해 처음부터 미게시 상태로 만듭니다.
      form = FormApp.create(title, false);
      state = { id: form.getId(), version: 1, complete: false };
      properties.setProperty(propertyKey, JSON.stringify(state));
    }

    if (!form.supportsAdvancedResponderPermissions()) {
      throw new Error('이 폼에서는 게시 상태 확인 기능을 사용할 수 없어 작업을 중단했습니다. 공개로 전환하지 않습니다.');
    }

    var blueprint = getDadamomDemoBlueprint_();
    var existing = form.getItems();
    if (existing.length > blueprint.length) {
      throw new Error('예상하지 않은 항목이 있어 중단했습니다. 기존 항목은 삭제하지 않습니다.');
    }

    // 중간에 멈췄다면 이미 완성된 항목이 원래 구성과 정확히 일치할 때만 이어갑니다.
    // 사용자가 편집한 항목이나 일부만 작성된 항목을 덮어쓰지 않습니다.
    for (var i = 0; i < existing.length; i++) {
      var wanted = blueprint[i];
      var expectedType = getDadamomItemType_(wanted.kind);
      if (existing[i].getTitle() !== wanted.title || existing[i].getType() !== expectedType ||
          existing[i].getHelpText() !== wanted.help) {
        throw new Error('기존 ' + (i + 1) + '번째 항목이 생성 구성과 달라 중단했습니다. 편집 주소에서 확인하세요.');
      }
      if (wanted.kind === 'text' && existing[i].asTextItem().isRequired()) {
        throw new Error('닉네임 항목의 필수 설정이 변경돼 중단했습니다.');
      }
      if (wanted.kind === 'paragraph' && existing[i].asParagraphTextItem().isRequired()) {
        throw new Error('문항의 필수 설정이 변경돼 중단했습니다.');
      }
    }

    form.setDescription(
      '출산과 육아에 관한 30가지 이야기를 나누기 위한 예시용 설문지입니다.\n\n' +
      '실제 조사·회원 응답 수집용이 아닙니다. 해당되는 질문만 골라 자유롭게 적어주세요. 모든 입력은 선택 사항입니다.\n' +
      '닉네임은 구름맘·달빛아빠처럼 가상 이름을 사용하세요. 실명, 이메일, 전화번호, 주소, 아이의 이름·생년월일 등 실제 개인정보는 적지 마세요.\n' +
      '현재 공개 게시와 응답 수집은 꺼져 있습니다. 이 스크립트는 예시 답변을 제출하지 않습니다.\n\n' +
      '[' + marker + ']'
    );
    form.setCollectEmail(false);
    form.setLimitOneResponsePerUser(false);
    form.setPublishingSummary(false);
    form.setAllowResponseEdits(false);
    form.setShowLinkToRespondAgain(false);
    form.setShuffleQuestions(false);
    form.setIsQuiz(false);
    form.setCustomClosedFormMessage('예시 확인용 설문지입니다. 현재 실제 응답은 받고 있지 않습니다.');

    for (var j = existing.length; j < blueprint.length; j++) {
      var spec = blueprint[j];
      var item;
      if (spec.kind === 'header') {
        item = form.addSectionHeaderItem();
      } else if (spec.kind === 'text') {
        item = form.addTextItem();
      } else {
        item = form.addParagraphTextItem();
      }
      item.setTitle(spec.title).setHelpText(spec.help);
      if (spec.kind !== 'header') item.setRequired(false);
    }

    // 예시용이므로 끝까지 미게시·응답 중지 상태를 유지합니다.
    form.setPublished(false);
    form.setAcceptingResponses(false);
    var finalItems = form.getItems();
    var nicknameCount = finalItems.filter(function (item) { return item.getType() === FormApp.ItemType.TEXT; }).length;
    var questionCount = finalItems.filter(function (item) { return item.getType() === FormApp.ItemType.PARAGRAPH_TEXT; }).length;
    if (nicknameCount !== 1 || questionCount !== 30 || finalItems.length !== 37 ||
        form.collectsEmail() || form.isPublished() || form.isAcceptingResponses()) {
      throw new Error('완료 검증을 통과하지 못했습니다. 링크에서 확인하고, 오류 문구만 전달하세요.');
    }

    state.complete = true;
    properties.setProperty(propertyKey, JSON.stringify(state));
    logDadamomDemoResult_(form, '생성 완료: 가상 닉네임 1칸 + 장문 답변 30문항 + 주제 구분 6개');
    return form.getEditUrl();
  } catch (error) {
    if (form) Logger.log('중간에 멈춘 설문지 편집 주소: ' + form.getEditUrl());
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function logDadamomDemoResult_(form, message) {
  Logger.log(message);
  Logger.log('설문지 제목: ' + form.getTitle());
  Logger.log('편집 주소: ' + form.getEditUrl());
  Logger.log('위 편집 주소를 열어 문항과 미리보기를 확인하세요.');
  Logger.log('새로 생성할 때는 비공개·응답 중지로 만듭니다. 기존 생성본을 다시 열 때는 사용자의 이후 편집·설정을 바꾸지 않습니다.');
  Logger.log('이메일·실명 입력란 없음 / 자동 응답 제출 없음 / 기존 설문지·앱·DB 변경 없음');
}

function getDadamomItemType_(kind) {
  if (kind === 'header') return FormApp.ItemType.SECTION_HEADER;
  if (kind === 'text') return FormApp.ItemType.TEXT;
  return FormApp.ItemType.PARAGRAPH_TEXT;
}

function getDadamomDemoBlueprint_() {
  var questions = [
    { title: '출산 전에 미리 준비하길 잘한 물건과 나중에 사도 괜찮았던 물건은 무엇인가요?', help: '꼭 필요했던 물건, 거의 쓰지 않은 물건, 구입 시기를 나눠 자유롭게 적어주세요.' },
    { title: '임신 중 출퇴근과 집안일의 부담을 어떻게 조정하셨나요?', help: '출산휴가 전까지 일정이나 생활을 조정했던 경험이 있다면 적어주세요.' },
    { title: '출산 당일이나 입원 중 배우자가 해줘서 도움이 됐던 일은 무엇인가요?', help: '고마웠던 행동이나 미리 준비했으면 좋았을 일을 나눠주세요.' },
    { title: '집에서 산후조리를 했다면 어떤 점이 편했고, 어떤 점이 힘들었나요?', help: '산후도우미가 없는 시간의 식사·집안일·밤 돌봄을 어떻게 나눴는지도 적어주세요.' },
    { title: '출산 후 가족 방문 시기와 머무는 시간은 어떻게 정하셨나요?', help: '가족에게 부담 없이 의견을 전했던 방법도 함께 적어주세요.' },
    { title: '한 명은 출근하고 한 명은 육아휴직 중일 때 밤 육아를 어떻게 나눴나요?', help: '밤 수유·달래기·주말 휴식 등 실제로 유지할 수 있었던 분담 방식을 적어주세요.' },
    { title: '아기가 우는 이유를 몰라 막막할 때 본인의 마음을 어떻게 진정시키셨나요?', help: '의학적 판단이나 진단보다는 그 순간의 감정과 마음을 다루었던 경험을 적어주세요.' },
    { title: '아기가 엄마를 많이 찾을 때 아빠와 둘이 보내는 시간을 어떻게 늘리셨나요?', help: '아빠가 자주 맡았던 일과나 함께 했던 활동이 있다면 적어주세요.' },
    { title: '분유포트와 젖병세척기를 사용해보니 각각 어떤 상황에서 유용했나요?', help: '둘 중 우선순위를 정한다면 어떤 기준으로 고를지, 집의 사용 패턴과 함께 적어주세요.' },
    { title: '아기가 잠든 뒤 집안일과 본인의 휴식 사이에서 우선순위를 어떻게 정하나요?', help: '미뤄두는 집안일이나 쉬는 시간을 확보하기 위해 정한 기준을 적어주세요.' },
    { title: '아기와 첫 외출은 어디로 얼마나 다녀왔고, 무엇이 도움이 됐나요?', help: '준비 과정, 예상과 달랐던 점, 다음 외출 때 바꾼 점 등을 적어주세요.' },
    { title: '아기가 유모차를 거부할 때 외출은 어떻게 했고, 이후 달라진 점이 있나요?', help: '잠시 쉬었다 다시 시도했는지, 잘 타는 상황이 있었는지 경험을 적어주세요.' },
    { title: '다른 아기의 성장과 비교하며 조급해질 때 마음을 어떻게 정리하셨나요?', help: '발달 상태를 평가하는 문항이 아닙니다. 비교에서 오는 감정을 다룬 경험을 적어주세요.' },
    { title: '직접 만든 이유식과 시판 이유식을 어떤 방식으로 섞어 이용하고 있나요?', help: '준비 시간, 비용, 재료 사용 등을 고려했을 때 잘 맞았던 조합을 적어주세요.' },
    { title: '아기가 이유식을 적게 먹어 허무할 때 준비 부담이나 마음의 부담을 어떻게 줄였나요?', help: '아이에게 더 먹이는 요령보다 준비하는 사람의 부담을 덜었던 방법을 적어주세요.' },
    { title: '짧은 외출과 긴 외출의 아기 가방 구성을 어떻게 다르게 챙기나요?', help: '빼도 괜찮았던 물건과 꼭 챙기는 물건을 나눠 적어주세요.' },
    { title: '어린이집 선택에서 거리와 다른 조건 중 무엇을 중요하게 보셨나요?', help: '상담 때 중요하게 본 것과 실제 등하원 후 중요해진 기준을 비교해 적어주세요.' },
    { title: '어린이집 적응 기간과 복직 일정을 어떻게 맞추셨나요?', help: '복직 전 여유 기간, 부부 휴가, 가족 도움 등 준비했던 방법을 적어주세요.' },
    { title: '아이가 아파 등원하지 못하는 날 부부의 휴가와 돌봄을 어떻게 나누나요?', help: '번갈아 쉬기, 업무 일정 조정 등 미리 정해둔 원칙이 있다면 적어주세요.' },
    { title: '퇴근 후 짧은 시간에 아이가 좋아했던 아빠와의 놀이는 무엇인가요?', help: '특별한 준비물 없이 즐겼던 놀이와 아이의 대략적인 연령대를 적어주세요. 생년월일은 적지 않아도 됩니다.' },
    { title: '부부가 각자 쉬는 시간을 눈치 보지 않고 확보하기 위해 어떤 약속을 했나요?', help: '주말 시간 나누기, 혼자 외출하기, 집에서 쉬기 등 유지해본 방식을 적어주세요.' },
    { title: '부부의 육아 방식이 다를 때 함께 맞추는 기준과 각자 맡기는 부분은 무엇인가요?', help: '지적이나 간섭을 줄이기 위해 나눴던 대화가 있다면 적어주세요.' },
    { title: '육아를 도와주시는 조부모와 의견이 다를 때 어떻게 전달하고 조율하셨나요?', help: '먹이기·재우기 등 생활 방식에 관해 관계를 해치지 않고 이야기했던 경험을 적어주세요.' },
    { title: '아이 사진의 가족 공유와 SNS 게시에 어떤 기준을 두고 있나요?', help: '게시 전 확인, 얼굴 가리기, 이름·장소 제외 등 정해둔 약속을 적어주세요. 실제 사진은 첨부하지 않습니다.' },
    { title: '아이와 함께 있는 시간에 부모의 휴대폰 사용을 줄이기 위해 어떤 방법을 써봤나요?', help: '효과가 있었던 작은 습관이나 지키기 어려웠던 규칙을 적어주세요.' },
    { title: '중고로 구입해 만족했던 장난감·육아용품과 거래 시 확인할 점은 무엇인가요?', help: '구성품, 작동 상태 등 확인했던 부분이나 예상하지 못한 불편함을 적어주세요.' },
    { title: '육아비에서 예상하지 못했던 지출과 비용을 관리한 방법은 무엇인가요?', help: '구체적인 가계 소득·계좌 정보 없이 지출 항목이나 관리 경험만 적어주세요.' },
    { title: '둘째 계획 또는 외동으로 키우는 결정을 할 때 가장 중요했던 기준은 무엇인가요?', help: '체력, 일, 비용, 돌봄 도움 등 각 가정에서 중요하게 생각한 이유를 적어주세요. 어느 쪽이 정답인지 묻는 문항은 아닙니다.' },
    { title: '부모 역할에서 잠시 벗어나 나만의 시간을 보낼 때 어떤 활동이 도움이 됐나요?', help: '짧게 할 수 있었던 취미나 다시 찾은 즐거움을 자유롭게 적어주세요.' },
    { title: '오늘 육아하면서 스스로 칭찬해주고 싶은 작은 일 한 가지는 무엇인가요?', help: '도움을 요청한 일, 한 번 숨 고른 일처럼 작은 순간도 괜찮습니다. 예시용이면 가상의 상황으로 적어주세요.' }
  ];

  if (questions.length !== 30) throw new Error('문항 데이터는 정확히 30개여야 합니다.');
  var groupTitles = [
    '1. 출산 준비와 산후 생활',
    '2. 초기 육아와 돌봄 분담',
    '3. 외출·성장·이유식',
    '4. 생활 준비·어린이집·맞벌이',
    '5. 부부·가족과 일상 습관',
    '6. 육아비·가족 계획·나만의 시간'
  ];
  var blueprint = [{
    kind: 'text',
    title: '가상 닉네임 (선택)',
    help: '예: 구름맘, 달빛아빠, 콩콩맘, 햇살아빠, 별사탕맘. 모두 가상 이름 예시입니다. 실명이나 실제 계정 이름은 적지 마세요.'
  }];
  questions.forEach(function (question, index) {
    if (index % 5 === 0) {
      blueprint.push({ kind: 'header', title: groupTitles[Math.floor(index / 5)], help: '해당되는 문항만 골라 답하세요. 모두 건너뛸 수 있습니다.' });
    }
    blueprint.push({ kind: 'paragraph', title: (index + 1) + '. ' + question.title, help: question.help });
  });
  return blueprint;
}
