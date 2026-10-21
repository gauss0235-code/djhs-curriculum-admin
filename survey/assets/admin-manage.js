/* 관리자 화면 — 운영 관리(QR·배포, 설문 설정·문항 편집, 강좌 관리·엑셀 등록) · 모두 관리자 전용 */
(function () {
  "use strict";
  var JA = window.JA, S = JA.S, esc = JA.esc, state = JA.state, num = JA.num, views = JA.views, api = JA.api, J = JA.J;

  /* ---------------- 관리자 확인 ---------------- */
  // 이 파일의 화면과 쓰기 동작은 모두 관리자 전용. 탭이 숨겨져 있어도 함수 입구에서 한 번 더 막음
  function adminOnly() {
    if (state.isAdmin) return true;
    JA.toast("관리자만 할 수 있는 작업이에요.", true);
    return false;
  }
  var LOCK_ICON = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  function denyView(root) {
    root.innerHTML = '<div class="empty-state"><div class="icon">' + LOCK_ICON + "</div><p>관리자 전용 화면이에요</p>" +
      "<p>설문 설정·강좌 관리·QR 배포는 관리자만 사용할 수 있어요. 결과는 ‘대시보드’·‘강좌별 결과’ 탭에서 볼 수 있어요.</p></div>";
  }

  /* =====================================================================
   *  QR · 배포
   * ===================================================================== */
  // 학생용 설문 주소. config.js의 SURVEY_BASE_URL이 비어 있으면 null (QR·미리보기 대신 안내를 보여 줌)
  function surveyUrl(s) {
    var base = String(J.cfg.SURVEY_BASE_URL || "").trim();
    if (!base || !s || !s.slug) return null;
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "s=" + encodeURIComponent(s.slug) + (J.isDemo ? "&demo" : "");
  }
  JA.surveyUrl = surveyUrl;
  function qrObj(text) {
    if (typeof window.qrcode !== "function") throw new Error("QR 라이브러리를 불러오지 못했어요.");
    var qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr;
  }
  function qrSvg(text, size) {
    var qr = qrObj(text), n = qr.getModuleCount(), m = 4, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + (c + m) + " " + (r + m) + "h1v1h-1z";
    var w = n + m * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + w + '"' + (size ? ' width="' + size + '" height="' + size + '"' : "") +
      ' shape-rendering="crispEdges" role="img" aria-label="설문 QR코드"><rect width="' + w + '" height="' + w + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  function qrPng(text, name) {
    var qr = qrObj(text), n = qr.getModuleCount(), m = 4, scale = Math.max(8, Math.floor(1200 / (n + m * 2)));
    var cv = document.createElement("canvas");
    cv.width = cv.height = (n + m * 2) * scale;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + m) * scale, (r + m) * scale, scale, scale);
    cv.toBlob(function (b) { JA.download(b, name); });
  }
  function periodText(s) {
    function d(iso) { var x = new Date(iso); return (x.getMonth() + 1) + "월 " + x.getDate() + "일(" + "일월화수목금토".charAt(x.getDay()) + ")"; }
    if (s.opens_at && s.closes_at) return d(s.opens_at) + " ~ " + d(s.closes_at);
    if (s.closes_at) return "~ " + d(s.closes_at) + "까지";
    return "";
  }
  var POSTER_ART = '<svg class="art" viewBox="0 0 400 220" preserveAspectRatio="xMaxYMin slice" aria-hidden="true"><defs>' +
    '<pattern id="pdots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="rgba(255,255,255,.16)"/></pattern></defs>' +
    '<rect x="220" y="0" width="180" height="160" fill="url(#pdots)"/>' +
    '<g fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.2"><circle cx="360" cy="30" r="70"/><circle cx="360" cy="30" r="115"/></g></svg>';
  function posterHtml(s, url) {
    var nq = S.questionsOf(s).all.length;
    var per = periodText(s);
    var t = String(s.title || ""), m = t.match(/^(.*?학기)/);
    return '<div class="poster"><div class="poster-top">' + POSTER_ART +
      '<div class="poster-kicker">' + esc([J.cfg.ORG_NAME, J.cfg.PROGRAM_NAME || "공동교육과정"].filter(Boolean).join(" · ")) + "</div>" +
      "<h1>공동교육과정<br>만족도 조사</h1>" +
      '<p class="poster-sub">' + esc(m ? m[1] : t) + "</p></div>" +
      '<div class="poster-qr">' + qrSvg(url) + "</div>" +
      '<ol class="poster-steps"><li><b>QR코드 스캔</b><span>휴대폰 카메라로 비춰 주세요</span></li>' +
      "<li><b>수강 강좌 선택</b><span>거점학교·강좌명으로 찾기</span></li>" +
      "<li><b>응답 제출</b><span>" + nq + "문항 · 약 2분 · 익명</span></li></ol>" +
      (per ? '<p class="poster-period">조사 기간 ' + esc(per) + "</p>" : "") +
      '<p class="poster-url">' + esc(url) + "</p>" +
      '<p class="poster-foot">공동교육과정을 2개 이상 수강한 학생은 강좌마다 응답해 주세요.</p></div>';
  }
  function cardsHtml(s, url) {
    var t = String(s.title || ""), m = t.match(/^(.*?학기)/);
    var one = '<div class="qcard"><div class="qcard-qr">' + qrSvg(url) + '</div><div class="qcard-txt"><span class="k">' +
      esc(J.cfg.PROGRAM_NAME || "공동교육과정") + "</span><b>공동교육과정<br>만족도 조사</b>" +
      "<span>" + esc(m ? m[1] : t) + "</span><small>QR 스캔 → 강좌 선택 → 응답<br>익명 · 약 2분</small></div></div>";
    var html = '<div class="qcards">';
    for (var i = 0; i < 8; i++) html += one;
    return html + "</div>";
  }

  views.distribute = function (root) {
    if (!state.isAdmin) { denyView(root); return; }
    var s = state.survey, url = surveyUrl(s), st = JA.surveyStatus(s);
    var n = state.responses.length;
    var addr;
    if (url) {
      var qrHtml;
      try { qrHtml = qrSvg(url); } catch (e) { qrHtml = '<p class="muted small">' + esc(e.message) + "</p>"; }
      addr = '<div class="qr-stage"><div class="qr-big" id="qr-box">' + qrHtml + "</div></div>" +
        '<div class="url-row"><input class="input" readonly value="' + esc(url) + '" id="url-input"><button class="btn" id="copy-url">복사</button><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">열기</a></div>' +
        '<div class="btn-row"><button class="btn" id="qr-png">QR 이미지(PNG) 저장</button><button class="btn" id="qr-poster">안내 포스터 인쇄(A4)</button>' +
        '<button class="btn" id="qr-cards">배부용 카드 인쇄(A4 8장)</button><button class="btn" id="qr-full">화면에 크게 띄우기</button></div>';
    } else {
      // 학생 설문 페이지 주소가 없으면 QR·포스터·카드를 만들 수 없으므로 안내만 보여 줌 (복사·미리보기·인쇄 버튼 숨김)
      addr = '<p class="notice warn">학생 설문 페이지 주소가 아직 설정되지 않았어요(config.js의 SURVEY_BASE_URL)</p>' +
        '<p class="muted small">학생 설문 페이지를 배포한 뒤 <b>survey/assets/config.js</b>의 <b>SURVEY_BASE_URL</b>에 그 주소를 넣으면, ' +
        "이곳에 QR코드와 주소 복사·안내 포스터·배부용 카드 인쇄 버튼이 나타나요.</p>";
    }
    var html = '<div class="grid-2 dist-grid">' +
      '<section class="panel"><div class="panel-head"><h2>학생용 설문 주소</h2><span class="badge ' + st.cls + '">' + esc(st.label) + "</span></div><div class=\"panel-body\">" +
      addr + "</div></section>" +
      '<section class="panel"><div class="panel-head"><h2>응답 받기 상태</h2></div><div class="panel-body">' +
      '<div class="status-box"><div class="kpi-value">' + num(n) + "<small>명 응답</small></div>" +
      '<p class="muted small">' + (state.loadedAt ? "마지막 확인 " + JA.fmtDT(state.loadedAt.toISOString()) : "") + "</p></div>" +
      (state.isAdmin ? '<div class="toggle-row"><div><b>' + (s.is_open ? "응답을 받고 있어요" : "응답을 받지 않고 있어요") + '</b><p class="muted small">' +
        (s.is_open ? "학생이 QR로 접속하면 바로 응답할 수 있어요." : "학생이 접속하면 ‘설문이 마감되었어요’ 화면이 보여요.") + "</p></div>" +
        '<button class="btn ' + (s.is_open ? "danger" : "primary") + '" id="toggle-open">' + (s.is_open ? "응답 마감하기" : "응답 시작하기") + "</button></div>" : "") +
      (periodText(s) ? '<p class="muted small">설정된 기간: ' + esc(periodText(s)) + " (기간 밖에는 자동으로 응답이 막혀요)</p>" : '<p class="muted small">기간은 ‘설문 설정’에서 정할 수 있어요. 비워 두면 위 버튼으로만 열고 닫습니다.</p>') +
      '<div class="howto"><h3>배포 방법</h3><ol>' +
      "<li>포스터나 카드를 인쇄해 거점학교 공동교육과정 교실에 붙이거나 나눠 줍니다.</li>" +
      "<li>마지막 수업 시간에 ‘화면에 크게 띄우기’로 TV에 QR을 띄우고 5분 정도 응답 시간을 줍니다.</li>" +
      "<li>주소를 복사해 카카오톡·e알리미로 보내도 됩니다. QR은 하나라서 모든 강좌가 같은 주소를 씁니다.</li>" +
      "<li>‘대시보드’에서 강좌별 응답률을 보고, 응답이 적은 강좌는 담당 선생님께 안내를 요청하세요.</li></ol></div>" +
      "</div></section></div>";
    root.innerHTML = html;
    if (url) {
      root.querySelector("#copy-url").addEventListener("click", function () { JA.copyText(url); });
      root.querySelector("#qr-png").addEventListener("click", function () {
        try { qrPng(url, "만족도조사_QR_" + s.slug + ".png"); } catch (e) { JA.fail(e); }
      });
      root.querySelector("#qr-poster").addEventListener("click", function () {
        try { JA.printHtml(posterHtml(s, url)); } catch (e) { JA.fail(e); }
      });
      root.querySelector("#qr-cards").addEventListener("click", function () {
        try { JA.printHtml(cardsHtml(s, url)); } catch (e) { JA.fail(e); }
      });
      root.querySelector("#qr-full").addEventListener("click", function () {
        var code;
        try { code = qrSvg(url); } catch (e) { JA.fail(e); return; }
        var ov = document.createElement("div");
        ov.className = "qr-full";
        ov.innerHTML = '<div class="qr-full-inner"><div class="qr-full-kicker">' + esc(J.cfg.PROGRAM_NAME || "") + "</div><h1>만족도 조사에 참여해 주세요</h1>" +
          '<div class="qr-full-code">' + code + '</div><p>휴대폰 카메라로 QR코드를 비추고 → 수강한 강좌를 선택하세요 · 익명 · 약 2분</p>' +
          '<small>화면을 누르면 닫힙니다</small></div>';
        ov.addEventListener("click", function () { ov.remove(); if (document.fullscreenElement) document.exitFullscreen(); });
        document.body.appendChild(ov);
        var fs = ov.requestFullscreen ? ov.requestFullscreen() : null;
        if (fs && fs.catch) fs.catch(function () { /* 전체 화면을 못 써도 겹친 화면으로 보여 줌 */ });
      });
    }
    var tg = root.querySelector("#toggle-open");
    if (tg) tg.addEventListener("click", function () {
      if (!adminOnly()) return;
      var next = !s.is_open;
      JA.confirmBox(next ? "응답 시작" : "응답 마감", next ? "지금부터 학생 응답을 받을까요?" : "응답을 마감할까요? 학생이 더 이상 응답할 수 없어요.", next ? "시작" : "마감", !next).then(function (ok) {
        if (!ok || !adminOnly()) return;
        api.saveSurvey(Object.assign({}, s, { is_open: next })).then(function (saved) {
          JA.replaceSurvey(saved);
          JA.toast(next ? "응답 받기를 시작했어요." : "응답을 마감했어요.");
          if (state.tab === "distribute") views.distribute(root);
        }).catch(JA.fail);
      });
    });
  };

  /* =====================================================================
   *  설문 설정 · 문항 편집
   * ===================================================================== */
  var TYPE_LABEL = { likert: "5점 척도", text: "서술형", single: "선택형(하나)", multi: "선택형(여러 개)" };
  var ROLE_LABEL = { positive: "좋았던 점", improve: "개선할 점", other: "기타" };
  var draft = null, draftFor = null;
  function newId() { return "q" + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1296).toString(36); }
  function toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso), p = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

  views.settings = function (root) {
    if (!state.isAdmin) { denyView(root); return; }
    var s = state.survey;
    var previewUrl = surveyUrl(s);
    if (draftFor !== s.id) { draft = JSON.parse(JSON.stringify(s.questions || [])); draftFor = s.id; }
    var st = s.settings || {};
    var html = '<section class="panel"><div class="panel-head"><h2>기본 정보</h2></div><div class="panel-body form-grid">' +
      '<label class="field span2"><span>설문 제목</span><input class="input" id="s-title" value="' + esc(s.title) + '"></label>' +
      '<label class="field"><span>주소용 코드 <small class="muted">(영문 소문자·숫자·하이픈, QR 주소에 들어감)</small></span><input class="input" id="s-slug" value="' + esc(s.slug) + '"></label>' +
      '<div class="field-row"><label class="field"><span>학년도</span><input class="input" id="s-year" type="number" value="' + esc(s.year || "") + '"></label>' +
      '<label class="field"><span>학기</span><select class="input" id="s-sem"><option value="1"' + (s.semester === 1 ? " selected" : "") + '>1학기</option><option value="2"' + (s.semester === 2 ? " selected" : "") + ">2학기</option></select></label></div>" +
      '<label class="field span2"><span>학생 화면 안내문</span><textarea class="input" id="s-desc" rows="2">' + esc(s.description || "") + "</textarea></label>" +
      '<label class="field"><span>응답 시작 <small class="muted">(비우면 제한 없음)</small></span><input class="input" type="datetime-local" id="s-open" value="' + toLocalInput(s.opens_at) + '"></label>' +
      '<label class="field"><span>응답 마감 <small class="muted">(비우면 제한 없음)</small></span><input class="input" type="datetime-local" id="s-close" value="' + toLocalInput(s.closes_at) + '"></label>' +
      '<label class="check span2"><input type="checkbox" id="s-open-flag"' + (s.is_open ? " checked" : "") + "> 응답 받기 (끄면 기간과 관계없이 응답이 막힘)</label>" +
      '<label class="check span2"><input type="checkbox" id="s-dup"' + (st.preventDuplicate !== false ? " checked" : "") + "> 같은 기기에서 같은 강좌 중복 응답 막기 <small class=\"muted\">(학교 공용 태블릿으로 여러 학생이 응답한다면 끄세요)</small></label>" +
      '<label class="check span2"><input type="checkbox" id="s-teacher"' + (st.showTeacher !== false ? " checked" : "") + "> 학생 화면 강좌 목록에 선생님 이름 표시</label>" +
      "</div></section>";

    html += '<section class="panel"><div class="panel-head"><h2>문항 <span class="muted small">' + draft.length + "개</span></h2>" +
      '<div class="toolbar"><button class="btn sm" id="q-reset">기준표 문항으로 되돌리기</button></div></div><div class="panel-body">' +
      (state.responses.length ? '<p class="notice warn">이미 응답이 ' + num(state.responses.length) + "건 있어요. 문구 수정은 괜찮지만, 문항을 지우거나 척도를 바꾸면 기존 응답의 해당 값은 분석에서 빠집니다.</p>" : "") +
      '<div id="q-list"></div>' +
      '<div class="btn-row"><button class="btn sm" data-add="likert">+ 5점 척도 문항</button><button class="btn sm" data-add="text">+ 서술형 문항</button>' +
      '<button class="btn sm" data-add="single">+ 선택형 문항</button></div></div></section>';

    // 학생 설문 페이지 주소(SURVEY_BASE_URL)가 없으면 미리보기 버튼 대신 안내
    html += '<div class="save-bar"><span class="muted small">저장해야 학생 화면에 반영돼요.' +
      (previewUrl ? "" : " 학생 화면 미리보기는 config.js의 SURVEY_BASE_URL을 설정한 뒤 쓸 수 있어요.") + "</span>" +
      (previewUrl ? '<button class="btn" id="s-preview">학생 화면 미리보기</button>' : "") +
      '<button class="btn primary" id="s-save">설정 저장</button></div>';

    html += '<section class="panel danger-zone"><div class="panel-head"><h2>설문 삭제</h2></div><div class="panel-body"><p class="muted small">설문을 삭제하면 강좌 목록·응답·AI 분석이 모두 함께 삭제되고 복구할 수 없어요. 먼저 엑셀로 내려받아 두세요.</p>' +
      '<button class="btn danger" id="s-delete">이 설문 삭제</button></div></section>';
    root.innerHTML = html;
    renderQuestions(root);

    root.querySelector("#q-reset").addEventListener("click", function () {
      JA.confirmBox("문항 되돌리기", "편집 중인 문항을 만족도 조사 기준표(10문항 + 서술형 2개)로 바꿀까요? 저장 전까지는 반영되지 않아요.", "되돌리기").then(function (ok) {
        if (ok) { draft = JSON.parse(JSON.stringify(window.JCS_DEFAULT_QUESTIONS)); views.settings(root); }
      });
    });
    root.querySelectorAll("[data-add]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-add"), last = draft[draft.length - 1];
        var q = { id: newId(), type: t, section: t === "text" ? "서술형" : last && last.type === "likert" ? last.section : "", text: "", required: t === "likert" };
        if (t === "text") { q.textRole = "other"; q.maxLength = 1000; }
        if (t === "single") q.options = ["예", "아니요"];
        draft.push(q);
        renderQuestions(root);
        var items = root.querySelectorAll(".qb-item");
        var el = items[items.length - 1];
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.querySelector("textarea").focus();
      });
    });
    var pv = root.querySelector("#s-preview");
    if (pv) pv.addEventListener("click", function () {
      var u = surveyUrl(s);
      if (u) window.open(u, "_blank", "noopener");
      else JA.toast("학생 설문 페이지 주소(SURVEY_BASE_URL)가 아직 설정되지 않았어요.", true);
    });
    root.querySelector("#s-save").addEventListener("click", function () {
      if (!adminOnly()) return;
      var btn = this;
      var slug = root.querySelector("#s-slug").value.trim();
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) { JA.toast("주소용 코드는 영문 소문자·숫자·하이픈 2~40자로 입력하세요.", true); return; }
      var title = root.querySelector("#s-title").value.trim();
      if (!title) { JA.toast("설문 제목을 입력하세요.", true); return; }
      for (var i = 0; i < draft.length; i++) {
        var q = draft[i];
        if (!q.text || !q.text.trim()) { JA.toast((i + 1) + "번 문항 내용을 입력하세요.", true); return; }
        if ((q.type === "single" || q.type === "multi") && (!q.options || q.options.length < 2)) { JA.toast((i + 1) + "번 문항의 선택지를 2개 이상 입력하세요.", true); return; }
      }
      var open = fromLocalInput(root.querySelector("#s-open").value), close = fromLocalInput(root.querySelector("#s-close").value);
      if (open && close && open > close) { JA.toast("응답 마감이 시작보다 빨라요.", true); return; }
      var next = Object.assign({}, s, {
        title: title, slug: slug, year: Number(root.querySelector("#s-year").value) || null, semester: Number(root.querySelector("#s-sem").value),
        description: root.querySelector("#s-desc").value.trim(), opens_at: open, closes_at: close,
        is_open: root.querySelector("#s-open-flag").checked,
        settings: Object.assign({}, st, { preventDuplicate: root.querySelector("#s-dup").checked, showTeacher: root.querySelector("#s-teacher").checked }),
        questions: draft.map(function (q) {
          var o = { id: q.id, type: q.type, section: (q.section || "").trim(), text: q.text.trim(), required: !!q.required };
          if (q.type === "text") { o.textRole = q.textRole || "other"; o.maxLength = Math.round(Number(q.maxLength)) || 1000; if (q.placeholder) o.placeholder = q.placeholder; }
          if (q.type === "single" || q.type === "multi") o.options = q.options;
          if (q.type === "likert" && q.includeInScore === false) o.includeInScore = false;
          return o;
        })
      });
      btn.disabled = true;
      api.saveSurvey(next).then(function (saved) {
        JA.replaceSurvey(saved);
        draft = JSON.parse(JSON.stringify(saved.questions)); draftFor = saved.id;
        JA.toast("설정을 저장했어요.");
        if (state.tab === "settings") views.settings(root);
      }).catch(function (e) {
        if (/duplicate key|unique/i.test(e.message || "")) JA.toast("같은 주소용 코드를 쓰는 설문이 이미 있어요.", true); else JA.fail(e);
      }).then(function () { btn.disabled = false; });
    });
    root.querySelector("#s-delete").addEventListener("click", function () {
      if (!adminOnly()) return;
      var body = JA.modal({
        title: "설문 삭제",
        body: '<p>정말 삭제하려면 주소용 코드 <b>' + esc(s.slug) + '</b>를 입력하세요. 응답 ' + num(state.responses.length) + "건이 함께 삭제됩니다.</p>" +
          '<input class="input" id="del-confirm" autocomplete="off">',
        buttons: [{ label: "취소" }, {
          label: "영구 삭제", cls: "danger", onClick: function () {
            if (!adminOnly()) return false;
            if (body.querySelector("#del-confirm").value.trim() !== s.slug) { JA.toast("코드가 일치하지 않아요.", true); return false; }
            return api.deleteSurvey(s.id).then(function () { JA.toast("설문을 삭제했어요."); J.store.set("jcs_admin_survey", null); return JA.loadSurveys(); });
          }
        }]
      });
    });
  };

  function renderQuestions(root) {
    var list = root.querySelector("#q-list"), no = 0;
    list.innerHTML = draft.map(function (q, i) {
      no++;
      var typeSel = '<select class="input sm" data-k="type">' + Object.keys(TYPE_LABEL).map(function (t) {
        return '<option value="' + t + '"' + (q.type === t ? " selected" : "") + ">" + TYPE_LABEL[t] + "</option>"; }).join("") + "</select>";
      var extra = "";
      if (q.type === "text") {
        extra = '<div class="qb-extra"><label class="field"><span>분석 구분</span><select class="input sm" data-k="textRole">' + Object.keys(ROLE_LABEL).map(function (r) {
          return '<option value="' + r + '"' + ((q.textRole || "other") === r ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>"; }).join("") + "</select></label>" +
          '<label class="field"><span>최대 글자 수</span><input class="input sm" type="number" min="50" max="3000" data-k="maxLength" value="' + esc(q.maxLength || 1000) + '"></label>' +
          '<label class="field grow"><span>입력 예시(회색 글씨)</span><input class="input sm" data-k="placeholder" value="' + esc(q.placeholder || "") + '"></label></div>';
      } else if (q.type === "single" || q.type === "multi") {
        extra = '<div class="qb-extra"><label class="field grow"><span>선택지 (한 줄에 하나)</span><textarea class="input sm" rows="3" data-k="options">' + esc((q.options || []).join("\n")) + "</textarea></label></div>";
      } else if (q.type === "likert") {
        extra = '<div class="qb-extra"><label class="check"><input type="checkbox" data-k="includeInScore"' + (q.includeInScore !== false ? " checked" : "") + "> 전체 만족도 평균·보고서 집계에 포함</label></div>";
      }
      return '<div class="qb-item" data-i="' + i + '"><div class="qb-head"><span class="qb-no">' + no + "</span>" + typeSel +
        '<input class="input sm qb-section" data-k="section" placeholder="영역(예: 운영)" value="' + esc(q.section || "") + '">' +
        '<label class="check"><input type="checkbox" data-k="required"' + (q.required ? " checked" : "") + "> 필수</label><span class=\"spacer\"></span>" +
        '<button class="btn sm ghost" data-act="up" title="위로"' + (i ? "" : " disabled") + ">↑</button>" +
        '<button class="btn sm ghost" data-act="down" title="아래로"' + (i < draft.length - 1 ? "" : " disabled") + ">↓</button>" +
        '<button class="btn sm ghost danger-text" data-act="del" title="삭제">삭제</button></div>' +
        '<textarea class="input qb-text" rows="2" data-k="text" placeholder="문항 내용">' + esc(q.text || "") + "</textarea>" + extra + "</div>";
    }).join("");
    list.oninput = list.onchange = function (ev) {
      var el = ev.target, k = el.getAttribute("data-k");
      if (!k) return;
      var item = el.closest(".qb-item"), q = draft[Number(item.getAttribute("data-i"))];
      if (k === "required" || k === "includeInScore") q[k] = el.checked;
      else if (k === "options") q.options = el.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
      else if (k === "maxLength") q.maxLength = Math.min(5000, Math.max(50, Math.round(Number(el.value)) || 1000));
      else q[k] = el.value;
      if (k === "type" && ev.type === "change") {
        if (q.type === "text") { q.textRole = q.textRole || "other"; q.maxLength = q.maxLength || 1000; q.required = false; }
        if ((q.type === "single" || q.type === "multi") && !q.options) q.options = ["예", "아니요"];
        renderQuestions(root);
      }
    };
    list.onclick = function (ev) {
      var b = ev.target.closest("[data-act]");
      if (!b) return;
      var i = Number(b.closest(".qb-item").getAttribute("data-i")), act = b.getAttribute("data-act");
      if (act === "up" && i > 0) draft.splice(i - 1, 0, draft.splice(i, 1)[0]);
      if (act === "down" && i < draft.length - 1) draft.splice(i + 1, 0, draft.splice(i, 1)[0]);
      if (act === "del") draft.splice(i, 1);
      renderQuestions(root);
    };
  }

  /* ---------------- 새 설문 ---------------- */
  JA.newSurveyDialog = function () {
    if (!adminOnly()) return;
    var now = new Date(), y = now.getFullYear(), sem = now.getMonth() >= 6 ? 2 : 1;
    var others = state.surveys;
    var body = JA.modal({
      title: "새 설문 만들기",
      body: '<div class="form-grid">' +
        '<div class="field-row span2"><label class="field"><span>학년도</span><input class="input" id="n-year" type="number" value="' + y + '"></label>' +
        '<label class="field"><span>학기</span><select class="input" id="n-sem"><option value="1"' + (sem === 1 ? " selected" : "") + '>1학기</option><option value="2"' + (sem === 2 ? " selected" : "") + ">2학기</option></select></label></div>" +
        '<label class="field span2"><span>설문 제목</span><input class="input" id="n-title"></label>' +
        '<label class="field span2"><span>주소용 코드</span><input class="input" id="n-slug"></label>' +
        '<label class="field span2"><span>문항</span><select class="input" id="n-q"><option value="">만족도 조사 기준표 (10문항 + 서술형 2개)</option>' +
        others.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.title) + " 문항 복사</option>"; }).join("") + "</select></label>" +
        '<label class="field span2"><span>강좌 목록</span><select class="input" id="n-c"><option value="">비워 두기 (엑셀로 새로 등록)</option>' +
        others.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.title) + " 강좌 복사</option>"; }).join("") + "</select></label></div>",
      buttons: [{ label: "취소" }, {
        label: "만들기", cls: "primary", onClick: function () {
          if (!adminOnly()) return false;
          var title = body.querySelector("#n-title").value.trim(), slug = body.querySelector("#n-slug").value.trim();
          if (!title) { JA.toast("제목을 입력하세요.", true); return false; }
          if (!/^[a-z0-9-]{2,40}$/.test(slug)) { JA.toast("주소용 코드는 영문 소문자·숫자·하이픈 2~40자로 입력하세요.", true); return false; }
          if (state.surveys.some(function (s) { return s.slug === slug; })) { JA.toast("같은 주소용 코드를 쓰는 설문이 이미 있어요.", true); return false; }
          var qsrc = body.querySelector("#n-q").value, csrc = body.querySelector("#n-c").value;
          var src = state.surveys.find(function (s) { return s.id === qsrc; });
          var row = {
            title: title, slug: slug, year: Number(body.querySelector("#n-year").value) || null, semester: Number(body.querySelector("#n-sem").value),
            description: src ? src.description : "수강한 공동교육과정 강좌에 대한 만족도 조사입니다. 응답은 익명으로 처리되며, 다음 학기 운영 개선에 활용됩니다.",
            questions: JSON.parse(JSON.stringify(src ? src.questions : window.JCS_DEFAULT_QUESTIONS)),
            settings: src ? src.settings : { preventDuplicate: true, showTeacher: true }, is_open: false
          };
          return api.saveSurvey(row).then(function (saved) {
            if (!csrc) return saved;
            return api.listCourses(csrc).then(function (cs) {
              return api.insertCourses(cs.map(function (c) {
                return { survey_id: saved.id, seq: c.seq, school: c.school, course_type: c.course_type, name: c.name, grade: c.grade, credits: c.credits,
                  category: c.category, teacher: c.teacher, enrolled: c.enrolled, note: c.note, is_active: c.is_active };
              }));
            }).then(function () { return saved; });
          }).then(function (saved) {
            JA.toast("새 설문을 만들었어요.");
            state.tab = csrc ? "settings" : "course-admin";
            return JA.loadSurveys(saved.id);
          });
        }
      }]
    });
    var yEl = body.querySelector("#n-year"), sEl = body.querySelector("#n-sem"), tEl = body.querySelector("#n-title"), gEl = body.querySelector("#n-slug");
    function auto() {
      tEl.value = yEl.value + "학년도 " + sEl.value + "학기 " + (J.cfg.PROGRAM_NAME || "공동교육과정") + " 만족도 조사";
      gEl.value = yEl.value + "-" + sEl.value;
    }
    yEl.addEventListener("input", auto); sEl.addEventListener("change", auto);
    auto();
  };

  /* =====================================================================
   *  강좌 관리 · 엑셀 등록
   * ===================================================================== */
  var caState = { q: "" };
  var FIELD_LABEL = { seq: "연번", school: "거점학교", course_type: "유형", name: "강좌명", grade: "대상 학년", credits: "학점(시수)", category: "과목 편성", teacher: "수업교사", enrolled: "수강신청 학생 수" };
  var FIELD_PATTERNS = [
    ["name", [/교과목명/, /강좌명/, /과목명/]],
    ["school", [/거점학교/, /^학교명/, /개설학교/, /운영학교/]],
    ["course_type", [/^유형$/, /운영유형/, /운영형태/, /강좌유형/, /^형태$/]],
    ["teacher", [/지도교사/, /수업교사/, /교사명/, /교사성명/, /강사/]],
    ["enrolled", [/수강신청/, /학생수/, /수강자/, /인원/]],
    ["grade", [/대상학년/, /^학년$/]],
    ["category", [/과목편성/, /선택과목유형/, /과목유형/, /편성/]],
    ["credits", [/학점/, /시수/]],
    ["seq", [/^연번$/, /^번호$/, /^순번$/]]
  ];
  function clean(v) { return String(v == null ? "" : v).replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim(); }
  // jcs_courses.school_id 열이 있는데 비어 있는 강좌 (열이 아직 없거나 데모 자료면 false)
  function isUnlinked(c) { return !!c && Object.prototype.hasOwnProperty.call(c, "school_id") && c.school_id === null; }
  function detectHeader(rows) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var cells = rows[r].map(function (v) { return String(v == null ? "" : v).replace(/\s+/g, ""); });
      var used = {}, map = {}, score = 0;
      FIELD_PATTERNS.forEach(function (fp) {
        for (var c = 0; c < cells.length; c++) {
          if (used[c] || !cells[c]) continue;
          if (fp[1].some(function (re) { return re.test(cells[c]); })) { map[fp[0]] = c; used[c] = 1; score++; return; }
        }
      });
      if (map.name != null && map.school != null && (!best || score > best.score)) best = { row: r, map: map, score: score, headers: rows[r] };
    }
    return best;
  }
  function parseWorkbook(wb) {
    var best = null;
    wb.SheetNames.forEach(function (name) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false });
      var h = detectHeader(rows);
      if (!h) return;
      var out = [], lastSchool = "", lastType = "";
      for (var r = h.row + 1; r < rows.length; r++) {
        var row = rows[r], g = function (k) { return h.map[k] == null ? "" : row[h.map[k]]; };
        var first = clean(row[0]);
        var school = clean(g("school")), cname = clean(g("name")), ctype = clean(g("course_type"));
        if (/^\*/.test(first)) { lastSchool = ""; lastType = ""; continue; }
        // 병합된 셀(학교명·유형)은 아래 행이 비어 있으므로 위 값을 이어서 씀
        if (!school && cname) school = lastSchool;
        if (!ctype && cname && school === lastSchool) ctype = lastType;
        if (school) lastSchool = school;
        if (ctype) lastType = ctype;
        if (!school || !cname || /합계|소계/.test(school + cname)) continue;
        if (/^=/.test(cname) || /^=/.test(school)) continue;
        var en = g("enrolled"), enM = /\d+/.exec(String(en));
        var enN = typeof en === "number" ? Math.round(en) : enM ? parseInt(enM[0], 10) : NaN;
        out.push({
          seq: null, school: school, course_type: ctype, name: cname, grade: clean(g("grade")), credits: clean(g("credits")),
          category: clean(g("category")), teacher: clean(g("teacher")), enrolled: isNaN(enN) ? null : enN, note: ""
        });
      }
      if (!best || out.length > best.rows.length) best = { sheet: name, header: h, rows: out };
    });
    if (best) best.rows.forEach(function (r, i) { r.seq = i + 1; });
    return best;
  }

  views["course-admin"] = function (root) {
    if (!state.isAdmin) { denyView(root); return; }
    var cs = state.allCourses.slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0) || a.school.localeCompare(b.school, "ko"); });
    var q = caState.q.replace(/\s+/g, "");
    var shown = cs.filter(function (c) { return !q || (c.school + c.name + c.teacher).replace(/\s+/g, "").indexOf(q) >= 0; });
    var counts = {};
    state.responses.forEach(function (r) { counts[r.course_id] = (counts[r.course_id] || 0) + 1; });
    // school_id 열이 있고 값이 비어 있으면(=워크스페이스 학교와 연결 안 됨) 학교 담당자가 그 강좌 결과를 볼 수 없음
    var unlinked = cs.filter(isUnlinked).length;
    var html = '<section class="panel"><div class="panel-head"><h2>강좌 목록 <span class="muted small">' + cs.length + "개 · 거점학교 " + JA.schoolsOf(cs).length + "개교</span></h2>" +
      '<div class="toolbar"><input class="input sm search-sm" id="ca-q" type="search" placeholder="검색" value="' + esc(caState.q) + '">' +
      '<label class="btn sm primary file-btn">엑셀로 일괄 등록<input type="file" id="ca-file" accept=".xlsx,.xls,.csv" hidden></label>' +
      '<button class="btn sm" id="ca-add">+ 강좌 추가</button><button class="btn sm" id="ca-export">목록 엑셀로 받기</button>' +
      (cs.length ? '<button class="btn sm danger" id="ca-clear">전체 삭제</button>' : "") + "</div></div>" +
      '<div class="panel-body"><p class="muted small help">‘2026학년도 2학기 거점학교 공동교육과정 강좌 통계자료’처럼 <b>학교명(거점학교)·유형·교과목명(강좌명)·대상 학년·학점·과목 편성·수강신청 학생 수·지도교사 성명</b> 열이 있는 엑셀을 그대로 올리면 자동으로 인식합니다.</p>' +
      (cs.length ? "" : '<p class="notice warn">DB 권한 설정(02_permissions.sql) 적용 전이면 강좌가 보이지 않을 수 있어요.</p>') +
      (unlinked ? '<p class="notice warn">워크스페이스 학교와 연결되지 않은 강좌가 <b>' + unlinked + "개</b> 있어요(‘학교 미연결’ 표시). 거점학교 이름을 워크스페이스 학교 이름과 맞춰야 그 학교 담당자가 결과를 볼 수 있어요.</p>" : "") +
      '<div class="tbl-wrap tall"><table class="tbl sticky-head"><thead><tr><th class="num">연번</th><th>거점학교</th><th>유형</th><th>강좌명</th><th>대상 학년</th><th>학점</th><th>과목 편성</th><th>수업교사</th><th class="num">신청</th><th>비고</th><th class="num">응답</th><th></th></tr></thead><tbody>' +
      (shown.length ? shown.map(function (c) {
        return '<tr class="' + (c.is_active === false ? "inactive" : "") + '"><td class="num muted">' + (c.seq == null ? "" : c.seq) + "</td><td>" + esc(c.school) +
          (isUnlinked(c) ? ' <span class="badge warn">학교 미연결</span>' : "") + "</td><td>" + JA.typeBadge(c.course_type) + "</td><td><b>" + esc(c.name) + "</b>" +
          (c.is_active === false ? ' <span class="badge">숨김</span>' : "") + "</td><td>" + esc(c.grade) + "</td><td>" + esc(c.credits) + "</td><td>" + esc(c.category) + "</td><td>" + esc(c.teacher) +
          '</td><td class="num">' + num(c.enrolled) + "</td><td>" + esc(c.note) + '</td><td class="num">' + (counts[c.id] || "") + "</td>" +
          '<td class="actions"><button class="btn sm ghost" data-edit="' + esc(c.id) + '">수정</button></td></tr>';
      }).join("") : '<tr><td colspan="12" class="empty-row">' + (cs.length ? "검색 결과가 없어요." : "등록된 강좌가 없어요. 엑셀 파일로 일괄 등록하세요.") + "</td></tr>") +
      "</tbody></table></div></div></section>";
    root.innerHTML = html;
    var qEl = root.querySelector("#ca-q");
    qEl.addEventListener("input", JA.debounce(function () {
      if (state.tab !== "course-admin") return;
      caState.q = qEl.value; views["course-admin"](root);
      var el = root.querySelector("#ca-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    }, 250));
    root.querySelector("#ca-file").addEventListener("change", function () {
      var file = this.files[0];
      this.value = "";
      if (file) importFile(file, root);
    });
    root.querySelector("#ca-add").addEventListener("click", function () { courseForm(null, root); });
    root.querySelector("#ca-export").addEventListener("click", function () {
      if (!window.XLSX) { JA.toast("엑셀 라이브러리를 불러오지 못했어요.", true); return; }
      var aoa = [["연번", "학교명(거점학교)", "유형", "교과목명(강좌명)", "대상 학년", "학점", "과목편성", "수강신청 학생 수", "지도교사 성명", "비고"]].concat(cs.map(function (c) {
        return [c.seq, c.school, c.course_type, c.name, c.grade, c.credits, c.category, c.enrolled == null ? "" : c.enrolled, c.teacher, c.note];
      }));
      var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [6, 16, 9, 28, 8, 6, 10, 10, 12, 14].map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, "강좌 목록");
      XLSX.writeFile(wb, "강좌목록_" + state.survey.slug + ".xlsx");
    });
    var clr = root.querySelector("#ca-clear");
    if (clr) clr.addEventListener("click", function () {
      if (!adminOnly()) return;
      var nResp = state.responses.length;
      JA.confirmBox("강좌 전체 삭제", "강좌 " + cs.length + "개를 모두 삭제할까요?" + (nResp ? " <b>응답 " + num(nResp) + "건도 함께 삭제됩니다.</b>" : ""), "모두 삭제", true).then(function (ok) {
        if (!ok || !adminOnly()) return;
        api.deleteAllCourses(state.survey.id).then(function () { JA.toast("강좌를 모두 삭제했어요."); return JA.loadSurveyData(); }).catch(JA.fail);
      });
    });
    root.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { courseForm(state.allCourses.find(function (c) { return c.id === b.getAttribute("data-edit"); }), root); });
    });
  };

  function courseForm(c, root) {
    if (!adminOnly()) return;
    var isNew = !c;
    c = c || { school: "", course_type: "오프라인", name: "", grade: "", credits: "", category: "", teacher: "", enrolled: "", note: "", is_active: true,
      seq: state.allCourses.reduce(function (m, x) { return Math.max(m, x.seq || 0); }, 0) + 1 };
    var schools = JA.schoolsOf(state.allCourses);
    var f = function (k, label, type) {
      return '<label class="field"><span>' + label + '</span><input class="input" data-f="' + k + '"' + (type ? ' type="' + type + '"' : "") + ' value="' + esc(c[k] == null ? "" : c[k]) + '"' +
        (k === "school" ? ' list="school-list"' : "") + "></label>";
    };
    var counts = state.responses.filter(function (r) { return r.course_id === c.id; }).length;
    var body = JA.modal({
      title: isNew ? "강좌 추가" : "강좌 수정",
      body: '<div class="form-grid">' + f("school", "거점학교") +
        '<label class="field"><span>유형</span><select class="input" data-f="course_type">' + ["오프라인", "온라인", "진로선택형"].map(function (t) {
          return '<option' + (c.course_type === t ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select></label>" +
        '<div class="span2">' + f("name", "강좌명") + "</div>" + f("teacher", "수업교사") + f("enrolled", "수강신청 학생 수", "number") +
        f("grade", "대상 학년") + f("credits", "학점(시수)") + f("category", "과목 편성") + f("seq", "연번", "number") +
        '<div class="span2">' + f("note", "비고") + "</div>" +
        '<label class="check span2"><input type="checkbox" data-f="is_active"' + (c.is_active !== false ? " checked" : "") + "> 학생 화면에 표시</label>" +
        '<datalist id="school-list">' + schools.map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + "</datalist></div>",
      buttons: (isNew ? [] : [{
        label: "삭제", cls: "danger", onClick: function () {
          if (!adminOnly()) return false;
          JA.closeModal();
          JA.confirmBox("강좌 삭제", "‘" + esc(c.name) + "’ 강좌를 삭제할까요?" + (counts ? " <b>이 강좌 응답 " + counts + "건도 함께 삭제됩니다.</b> 학생 화면에서만 숨기려면 ‘학생 화면에 표시’를 끄세요." : ""), "삭제", true).then(function (ok) {
            if (!ok || !adminOnly()) return;
            api.deleteCourse(c.id).then(function () { JA.toast("강좌를 삭제했어요."); return JA.loadSurveyData(); }).catch(JA.fail);
          });
          return false;
        }
      }]).concat([{ label: "취소" }, {
        label: "저장", cls: "primary", onClick: function () {
          if (!adminOnly()) return false;
          var o = { id: c.id, survey_id: state.survey.id };
          body.querySelectorAll("[data-f]").forEach(function (el) {
            var k = el.getAttribute("data-f");
            o[k] = el.type === "checkbox" ? el.checked : el.value.trim();
          });
          if (!o.school || !o.name) { JA.toast("거점학교와 강좌명은 꼭 입력하세요.", true); return false; }
          return api.saveCourse(o).then(function () { JA.toast("저장했어요."); return JA.loadSurveyData({ quiet: true }); });
        }
      }])
    });
  }

  function importFile(file, root) {
    if (!adminOnly()) return;
    if (!window.XLSX) { JA.toast("엑셀 라이브러리를 불러오지 못했어요.", true); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        var wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
        parsed = parseWorkbook(wb);
      } catch (e) { JA.fail(e); return; }
      if (!parsed || !parsed.rows.length) {
        JA.modal({ title: "인식하지 못했어요", body: "<p>‘학교명(거점학교)’과 ‘교과목명(강좌명)’ 열이 있는 표를 찾지 못했어요. 머리글 행에 이 두 열이 있는지 확인해 주세요.</p>" });
        return;
      }
      var existing = state.allCourses, key = function (c) { return (c.school + "|" + c.name + "|" + c.teacher).replace(/\s+/g, ""); };
      var exist = {};
      existing.forEach(function (c) { exist[key(c)] = 1; });
      var dupN = parsed.rows.filter(function (r) { return exist[key(r)]; }).length;
      var maxSeq = existing.reduce(function (m, x) { return Math.max(m, x.seq || 0); }, 0);
      var mapHtml = Object.keys(FIELD_LABEL).map(function (k) {
        var col = parsed.header.map[k];
        return "<tr><td>" + FIELD_LABEL[k] + "</td><td>" + (col == null ? '<span class="muted">(없음)</span>' : esc(clean(parsed.header.headers[col]))) + "</td></tr>";
      }).join("");
      var prev = parsed.rows.slice(0, 6).map(function (r) {
        return "<tr><td>" + esc(r.school) + "</td><td>" + esc(r.course_type) + "</td><td>" + esc(r.name) + "</td><td>" + esc(r.teacher) + '</td><td class="num">' + num(r.enrolled) + "</td></tr>";
      }).join("");
      var nResp = state.responses.length;
      var body = JA.modal({
        title: "엑셀 강좌 등록", wide: true,
        body: '<p><b>' + esc(file.name) + "</b> · 시트 ‘" + esc(parsed.sheet) + "’에서 강좌 <b>" + parsed.rows.length + "개</b>(거점학교 " + JA.schoolsOf(parsed.rows).length + "개교)를 찾았어요.</p>" +
          '<div class="grid-2 tight"><div><h4>열 인식 결과</h4><table class="tbl small-tbl">' + mapHtml + "</table></div>" +
          '<div><h4>미리보기</h4><div class="tbl-wrap"><table class="tbl small-tbl"><thead><tr><th>거점학교</th><th>유형</th><th>강좌명</th><th>교사</th><th class="num">신청</th></tr></thead><tbody>' + prev + "</tbody></table></div>" +
          '<p class="muted small">외 ' + Math.max(0, parsed.rows.length - 6) + "개</p></div></div>" +
          (existing.length ? '<div class="radio-group"><label class="check"><input type="radio" name="imp-mode" value="add" checked> 기존 강좌 ' + existing.length + "개는 두고 추가" +
            (dupN ? " (같은 강좌 " + dupN + "개는 건너뜀)" : "") + "</label>" +
            '<label class="check"><input type="radio" name="imp-mode" value="replace"> 기존 강좌를 모두 지우고 새로 등록' +
            (nResp ? ' <b class="danger-text">— 응답 ' + num(nResp) + "건도 함께 삭제됨</b>" : "") + "</label></div>" : ""),
        buttons: [{ label: "취소" }, {
          label: "등록", cls: "primary", onClick: function () {
            if (!adminOnly()) return false;
            var modeEl = body.querySelector('input[name="imp-mode"]:checked');
            var mode = modeEl ? modeEl.value : "add";
            var rows = parsed.rows.map(function (r) { return Object.assign({ survey_id: state.survey.id, is_active: true }, r); });
            var oldIds = existing.map(function (c) { return c.id; });
            if (mode !== "replace") {
              rows = rows.filter(function (r) { return !exist[key(r)]; });
              rows.forEach(function (r, i) { r.seq = maxSeq + i + 1; });
            }
            // 새 강좌를 먼저 넣고, 성공한 뒤에 기존 강좌를 지움 (중간에 실패해도 기존 자료가 사라지지 않음)
            return (rows.length ? api.insertCourses(rows) : Promise.resolve()).then(function () {
              return mode === "replace" && oldIds.length ? api.deleteCourses(oldIds) : null;
            }).then(function () {
              JA.toast("강좌 " + rows.length + "개를 등록했어요.");
              return JA.loadSurveyData();
            }).then(function () {
              // 등록 결과 중 워크스페이스 학교와 연결되지 않은 강좌가 있으면 알려 줌
              var nUn = state.allCourses.filter(isUnlinked).length;
              if (nUn) JA.toast("학교와 연결되지 않은 강좌가 " + nUn + "개 있어요. ‘학교 미연결’ 표시를 확인해 주세요.", true);
            });
          }
        }]
      });
    };
    reader.onerror = function () { JA.toast("파일을 읽지 못했어요.", true); };
    reader.readAsArrayBuffer(file);
  }
  JA.parseWorkbook = parseWorkbook;

  // (예전 '권한 관리' 화면은 삭제됨 — 역할은 워크스페이스 profiles.role 로 정하고, 계정 관리는 management.html 에서 함)
})();
