/* 만족도 조사 결과 화면 — 공통 기반(로그인 확인·역할, 설문 선택, 데이터 로딩, 탭, 모달·서랍, 비밀번호 변경)
 * 워크스페이스 로그인 세션과 profiles(role: admin | support | school)를 그대로 씁니다. */
window.JA = (function () {
  "use strict";
  var J = window.JCS, api = J.api, S = window.JCSStats;
  var $ = function (id) { return document.getElementById(id); };

  var LOGIN_URL = "../login.html";
  var TITLE_SUFFIX = " — 대전광역시 고등학교 교육과정 업무담당자 워크스페이스";
  var ROLE_LABEL = { admin: "관리자", support: "교육과정지원단", school: "학교 담당자" };
  // 관리자만 쓸 수 있는 쓰기 기능(설문·강좌·응답·AI 분석). 버튼을 숨기는 것과 별개로 호출 자체를 막습니다.
  var ADMIN_ONLY_API = ["saveSurvey", "deleteSurvey", "saveCourse", "insertCourses", "deleteCourse", "deleteCourses",
    "deleteAllCourses", "deleteResponse", "upsertMember", "deleteMember", "deleteAiReport", "generateAiReport"];

  var ICO = function (d) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  };
  var TABS = [
    { id: "dashboard", group: "결과 분석", label: "대시보드", desc: "응답 현황과 만족도를 한눈에 봅니다.",
      icon: ICO('<rect x="3" y="3" width="7.5" height="9" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.8"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.8"/><rect x="3" y="15" width="7.5" height="6" rx="1.8"/>') },
    { id: "courses", group: "결과 분석", label: "강좌별 결과", desc: "강좌를 누르면 문항별 결과·서술형·보고서용 표를 볼 수 있어요.",
      icon: ICO('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M9 9.5V20"/>') },
    { id: "opinions", group: "결과 분석", label: "서술형·AI 분석", desc: "서술형 의견을 주제별로 요약하고 원문을 찾아봅니다.",
      icon: ICO('<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>') },
    { id: "report", group: "결과 분석", label: "결과 보고서", desc: "운영 안내서 [부록 15] 형식의 거점학교별 결과지를 만듭니다.",
      icon: ICO('<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>') },
    { id: "distribute", group: "운영", label: "QR·배포", desc: "QR코드와 안내물을 출력하고 응답 접수를 열고 닫습니다.", admin: true,
      icon: ICO('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20.5 14v.01M14 20.5h.01M17.5 20.5H21v-3.5"/>') },
    { id: "settings", group: "운영", label: "설문 설정", desc: "제목·응답 기간·문항을 편집합니다.", admin: true,
      icon: ICO('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>') },
    { id: "course-admin", group: "운영", label: "강좌 관리", desc: "거점학교 운영자료 엑셀로 강좌를 등록하고 수정합니다.", admin: true,
      icon: ICO('<path d="M3 10.5 12 5l9 5.5-9 5.5z"/><path d="M7 13v4.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V13M21 10.5V16"/>') }
  ];

  var state = {
    me: null,            // { user, profile }
    profile: null,       // profiles 행: display_name, role, school_id, schools{name, code}
    role: null,          // "admin" | "support" | "school"
    isAdmin: false,      // 관리자: 설문·강좌 쓰기, AI 분석, 응답 삭제
    canViewAll: false,   // 관리자·지원단: 모든 거점학교 결과
    isSchool: false,     // 학교 담당자: 우리 학교 거점 강좌만 (DB 권한이 걸러 줌)
    scopeSchool: null,   // 학교 담당자일 때 화면에 쓰는 학교 문자열(강좌 표기 기준), 그 외 null
    surveys: [], survey: null, allCourses: [], responses: [], ai: [], model: null,
    tab: "dashboard", filters: { school: "", type: "" }, loadedAt: null, loading: false
  };
  var views = {};

  // 쓰기 기능 진입부 가드 — 관리자가 아니면 FORBIDDEN 오류(화면 문구: 권한이 없어요)
  ADMIN_ONLY_API.forEach(function (name) {
    var orig = api[name];
    if (typeof orig !== "function") return;
    api[name] = function () {
      if (!state.isAdmin) return Promise.reject(new Error("FORBIDDEN"));
      return orig.apply(api, arguments);
    };
  });

  /* ---------------- 공통 도우미 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg, isError) {
    var t = document.createElement("div");
    t.className = "toast" + (isError ? " error" : "");
    t.textContent = msg;
    $("toasts").appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function fail(e) { toast(J.errorInfo(e).message, true); console.error(e); }
  // 관리자 전용 동작의 진입부 가드: 관리자가 아니면 안내 후 false
  function requireAdmin() {
    if (state.isAdmin) return true;
    toast("관리자만 할 수 있는 작업이에요.", true);
    return false;
  }
  function fmtDT(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " " +
      ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function num(n) { return n == null ? "–" : Number(n).toLocaleString("ko-KR"); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function typeBadge(t) {
    if (!t) return "";
    var cls = t === "온라인" ? "online" : t === "진로선택형" ? "career" : "offline";
    return '<span class="badge ' + cls + '">' + esc(t) + "</span>";
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* 무시 */ }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { toast("복사했어요."); }, function () { fallback(); toast("복사했어요."); });
    }
    fallback(); toast("복사했어요.");
    return Promise.resolve();
  }
  function surveyStatus(s) {
    if (!s) return { cls: "", label: "" };
    var now = Date.now();
    if (!s.is_open) return { cls: "", label: "닫힘" };
    if (s.opens_at && now < Date.parse(s.opens_at)) return { cls: "warn", label: "시작 전" };
    if (s.closes_at && now > Date.parse(s.closes_at)) return { cls: "", label: "기간 종료" };
    return { cls: "good", label: "응답 받는 중" };
  }

  /* ---------------- 모달 ---------------- */
  var modalOnClose = null;
  function modal(opts) {
    $("modal-title").textContent = opts.title || "";
    var body = $("modal-body");
    body.innerHTML = "";
    if (typeof opts.body === "string") body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var foot = $("modal-foot");
    foot.innerHTML = "";
    (opts.buttons || [{ label: "닫기" }]).forEach(function (b) {
      var btn = document.createElement("button");
      btn.className = "btn " + (b.cls || "");
      btn.textContent = b.label;
      btn.addEventListener("click", function () {
        var r = b.onClick ? b.onClick(btn) : undefined;
        if (r && typeof r.then === "function") {
          btn.disabled = true;
          r.then(function (keep) { btn.disabled = false; if (keep !== false) closeModal(); }, function (e) { btn.disabled = false; fail(e); });
        } else if (r !== false) closeModal();
      });
      foot.appendChild(btn);
    });
    document.querySelector("#modal-backdrop .modal").className = "modal" + (opts.wide ? " wide" : "");
    $("modal-backdrop").classList.remove("hidden");
    modalOnClose = opts.onClose || null;
    var first = body.querySelector("input, select, textarea");
    if (first) setTimeout(function () { first.focus(); }, 50);
    return body;
  }
  function closeModal() {
    $("modal-backdrop").classList.add("hidden");
    if (modalOnClose) { var f = modalOnClose; modalOnClose = null; f(); }
  }
  function confirmBox(title, html, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      modal({
        title: title, body: "<p>" + html + "</p>",
        buttons: [
          { label: "취소", onClick: function () { done = true; resolve(false); } },
          { label: okLabel || "확인", cls: danger ? "danger" : "primary", onClick: function () { done = true; resolve(true); } }
        ],
        onClose: function () { if (!done) resolve(false); }
      });
    });
  }

  /* ---------------- 서랍(강좌 상세) ---------------- */
  function openDrawer(titleHtml, bodyHtml) {
    $("drawer-title-wrap").innerHTML = titleHtml;
    $("drawer-body").innerHTML = bodyHtml;
    $("drawer").classList.remove("hidden");
    $("drawer-backdrop").classList.remove("hidden");
    $("drawer-body").scrollTop = 0;
    document.body.classList.add("noscroll");
    return $("drawer-body");
  }
  function closeDrawer() {
    $("drawer").classList.add("hidden");
    $("drawer-backdrop").classList.add("hidden");
    document.body.classList.remove("noscroll");
  }

  /* ---------------- 인쇄 ---------------- */
  function printHtml(html, landscape) {
    var root = $("print-root");
    root.innerHTML = html;
    document.body.classList.add("printing");
    var st = document.getElementById("print-page-style");
    if (!st) { st = document.createElement("style"); st.id = "print-page-style"; document.head.appendChild(st); }
    st.textContent = "@page { size: A4 " + (landscape ? "landscape" : "portrait") + "; margin: 14mm 12mm; }";
    function cleanup() {
      document.body.classList.remove("printing");
      root.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
    }
    window.addEventListener("afterprint", cleanup);
    setTimeout(function () { window.print(); }, 150);
  }

  /* ---------------- 데이터 ---------------- */
  // 강좌는 DB 권한(RLS)이 이미 학교별로 걸러 주므로 화면에서 다시 거르지 않음
  // (워크스페이스 학교명 '대전여고'와 강좌 표기 '대전여자고'가 달라 0건이 되는 문제 방지)
  function scopedCourses() {
    return state.allCourses.slice();
  }
  function profileSchoolName() {
    var p = state.profile;
    return p && p.schools && p.schools.name || "";
  }
  // 학교 담당자: 불러온 강좌가 있으면 첫 강좌의 학교 표기, 없으면 워크스페이스 학교명
  function updateScope() {
    if (!state.isSchool) { state.scopeSchool = null; return; }
    var first = state.allCourses.find(function (c) { return c && c.school; });
    state.scopeSchool = first ? first.school : (profileSchoolName() || "우리 학교");
  }
  function rebuild() {
    state.model = S.build(state.survey, scopedCourses(), state.responses);
  }
  function filteredCourses() {
    var f = state.filters;
    return scopedCourses().filter(function (c) {
      return (!f.school || c.school === f.school) && (!f.type || c.course_type === f.type);
    });
  }
  function schoolsOf(list) {
    var out = [];
    (list || scopedCourses()).forEach(function (c) { if (out.indexOf(c.school) < 0) out.push(c.school); });
    return out.sort(function (a, b) { return a.localeCompare(b, "ko"); });
  }
  function typesOf(list) {
    var out = [];
    (list || scopedCourses()).forEach(function (c) { if (c.course_type && out.indexOf(c.course_type) < 0) out.push(c.course_type); });
    return out.sort(function (a, b) { return (S.TYPE_ORDER[a] || 9) - (S.TYPE_ORDER[b] || 9); });
  }

  function loadSurveyData(opts) {
    opts = opts || {};
    if (!state.survey) { render(); return Promise.resolve(); }
    state.loading = true;
    setRefreshLabel("불러오는 중…");
    if (!opts.quiet) $("view").innerHTML = '<div class="loading"><div class="spinner"></div><p>응답을 불러오는 중…</p></div>';
    var sid = state.survey.id;
    var coursesP = opts.onlyResponses ? Promise.resolve(state.allCourses) : api.listCourses(sid);
    return Promise.all([
      coursesP,
      api.fetchResponses(sid, function (n) { if (!opts.quiet) setRefreshLabel(num(n) + "건…"); }),
      api.listAiReports(sid).catch(function () { return []; })
    ]).then(function (r) {
      if (!state.survey || state.survey.id !== sid) return;
      state.allCourses = r[0] || [];
      state.responses = r[1] || [];
      state.ai = r[2] || [];
      state.loadedAt = new Date();
      updateScope();
      rebuild();
      render();
    }).catch(function (e) {
      fail(e);
      if (opts.quiet && state.model && state.model.survey && state.model.survey.id === sid) return;
      state.model = null;
      $("view").innerHTML = '<div class="empty-state"><h2>응답을 불러오지 못했어요</h2><p class="muted">' + esc(J.errorInfo(e).message) +
        '</p><p><button class="btn primary" id="retry-load">다시 시도</button></p></div>';
      var rb = $("retry-load");
      if (rb) rb.addEventListener("click", function () { loadSurveyData(); });
    }).then(function () {
      state.loading = false;
      setRefreshLabel();
    });
  }
  function setRefreshLabel(t) {
    $("refresh-label").textContent = t || (state.loadedAt ? "새로고침 · " +
      ("0" + state.loadedAt.getHours()).slice(-2) + ":" + ("0" + state.loadedAt.getMinutes()).slice(-2) : "새로고침");
  }

  function loadSurveys(selectId) {
    return api.listSurveys().then(function (list) {
      state.surveys = list || [];
      var sel = $("survey-select");
      if (!state.surveys.length) {
        sel.innerHTML = '<option value="">설문 없음</option>';
        state.survey = null;
        updateSurveyStatus();
        render();
        return;
      }
      var want = selectId || J.store.get("jcs_admin_survey", null);
      var found = state.surveys.find(function (s) { return s.id === want; }) ||
        state.surveys.find(function (s) { return s.is_open; }) || state.surveys[0];
      sel.innerHTML = state.surveys.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (s.id === found.id ? " selected" : "") + ">" + esc(s.title) + "</option>";
      }).join("");
      return selectSurvey(found.id);
    }).catch(function (e) {
      // 설문 목록을 못 불러오면 빈 화면 대신 오류 안내 + 다시 시도
      fail(e);
      $("view").innerHTML = '<div class="empty-state"><h2>설문 목록을 불러오지 못했어요</h2><p class="muted">' + esc(J.errorInfo(e).message) +
        '</p><p><button class="btn primary" id="retry-surveys" type="button">다시 시도</button></p></div>';
      var rb = $("retry-surveys");
      if (rb) rb.addEventListener("click", function () { loadSurveys(selectId); });
    });
  }
  function selectSurvey(id) {
    state.survey = state.surveys.find(function (s) { return s.id === id; }) || null;
    J.store.set("jcs_admin_survey", id);
    state.filters = { school: "", type: "" };
    state.allCourses = []; state.responses = []; state.ai = [];
    updateScope();
    updateSurveyStatus();
    return loadSurveyData();
  }
  function updateSurveyStatus() {
    var st = surveyStatus(state.survey);
    $("survey-status").innerHTML = st.label ? '<span class="badge ' + st.cls + '"><i class="dot"></i>' + st.label + "</span>" : "";
  }
  function replaceSurvey(s) {
    var i = state.surveys.findIndex(function (x) { return x.id === s.id; });
    if (i >= 0) state.surveys[i] = s; else state.surveys.unshift(s);
    if (state.survey && state.survey.id === s.id) state.survey = s;
    var opt = $("survey-select").querySelector('option[value="' + s.id + '"]');
    if (opt) opt.textContent = s.title;
    updateSurveyStatus();
    rebuild();
  }

  /* ---------------- 탭 ---------------- */
  function render() {
    var tabs = TABS.filter(function (t) { return !t.admin || state.isAdmin; });
    if (!tabs.some(function (t) { return t.id === state.tab; })) state.tab = "dashboard";
    var lastGroup = null, cur = null;
    $("tabs").innerHTML = tabs.map(function (t, i) {
      var on = t.id === state.tab;
      var sep = i > 0 && t.group !== lastGroup ? '<span class="tab-sep" aria-hidden="true"></span>' : "";
      lastGroup = t.group;
      if (on) cur = t;
      return sep + '<button type="button" role="tab" class="tab' + (on ? " on" : "") + '" data-tab="' + t.id + '" aria-selected="' +
        on + '">' + t.icon + "<span>" + esc(t.label) + "</span></button>";
    }).join("");
    var v = $("view");
    if (!state.survey) {
      v.innerHTML = '<div class="empty-state"><h2>아직 설문이 없어요</h2><p class="muted">' +
        (state.isAdmin ? "위쪽 <b>새 설문 만들기</b>로 첫 설문을 만들어 주세요." : "관리자가 설문을 만들면 여기에 표시됩니다.") + "</p></div>";
      return;
    }
    if (!state.model || state.model.survey.id !== state.survey.id) {
      v.innerHTML = '<div class="loading"><div class="spinner"></div><p>불러오는 중…</p></div>';
      if (!state.loading) loadSurveyData();
      return;
    }
    var fn = views[state.tab];
    // 강좌 0개 안내는 각 탭 화면(admin-results.js noCoursesHtml, admin-manage.js 강좌 관리)이 직접 그림 — 여기서 또 넣으면 두 번 보임
    v.innerHTML = '<header class="page-head"><div><h1>' + esc(cur.label) + '</h1><p>' + esc(cur.desc) + "</p></div></header>" +
      '<div class="page-body" id="view-body"></div>';
    var body = $("view-body");
    if (fn) {
      try { fn(body); } catch (e) { console.error(e); body.innerHTML = '<div class="empty-state"><p>화면을 그리는 중 오류가 발생했어요: ' + esc(e.message) + "</p></div>"; }
    }
  }
  function go(tab, extra) {
    var t = TABS.find(function (x) { return x.id === tab; });
    if (!t || (t.admin && !state.isAdmin)) tab = "dashboard";
    if (extra && extra.filters) state.filters = Object.assign({}, state.filters, extra.filters);
    state.tab = tab;
    closeDrawer();
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- 로그인 확인·역할 (워크스페이스 세션 공유) ---------------- */
  var GATE_ICONS = {
    clock: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    lock: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
    warn: '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
  };
  // 헤더 버튼 아이콘 — dashboard.html과 같은 SVG
  var ICON_GEAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var ICON_LOGOUT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

  // #gate-view 안내(로그인 확인 중 / 권한 없음 / 오류). retry가 true면 '다시 시도' 버튼
  function showGate(icon, title, desc, retry) {
    var g = $("gate-view");
    g.innerHTML = '<div class="empty-state"><div class="icon">' + (GATE_ICONS[icon] || GATE_ICONS.warn) + "</div>" +
      "<p>" + esc(title) + "</p><p>" + esc(desc) +
      (retry ? '<span style="display:block;margin-top:18px"><button class="btn primary" id="gate-retry" type="button">다시 시도</button></span>' : "") +
      "</p></div>";
    g.classList.remove("hidden");
    $("app-view").classList.add("hidden");
    $("refresh-btn").classList.add("hidden");
    if (retry) $("gate-retry").addEventListener("click", start);
  }
  function showApp() {
    $("gate-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    $("refresh-btn").classList.remove("hidden");
  }
  function goLogin() {
    alert("로그인이 필요합니다.");
    location.href = LOGIN_URL;
  }
  function renderUserInfo() {
    var p = state.profile || {};
    var badge;
    if (state.isAdmin) badge = '<span class="badge badge-admin">관리자</span>';
    else if (state.role === "support") badge = '<span class="badge badge-admin">교육과정지원단</span>';
    else badge = '<span class="badge badge-school">' + esc(profileSchoolName() || "소속 학교 미지정") + "</span>";
    // 학교 계정은 배지에 학교명이 있으므로 이름 앞의 학교명은 빼고 표시 (충남고 | 교육과정 업무담당자)
    var name = String(p.display_name || ""), sn = profileSchoolName();
    if (!state.isAdmin && state.role !== "support" && sn && name.indexOf(sn + " ") === 0) name = name.slice(sn.length + 1);
    $("userInfo").innerHTML = badge +
      '<span class="user-name">' + esc(name) + "</span>" +
      '<button class="profile-btn" type="button" onclick="openPasswordModal()">' + ICON_GEAR + "정보수정</button>" +
      '<button class="logout-btn" type="button" onclick="handleLogout()">' + ICON_LOGOUT + "로그아웃</button>";
  }
  function setPageHeader() {
    var title, desc;
    if (state.isAdmin) {
      title = "공동교육과정 만족도 조사";
      desc = "만족도 조사 결과를 확인하고 설문·강좌를 관리합니다.";
    } else if (state.isSchool) {
      title = "공동교육과정 만족도 조사 결과";
      desc = (profileSchoolName() || "우리 학교") + " 거점 강좌의 만족도 조사 결과입니다.";
    } else {
      title = "공동교육과정 만족도 조사 결과";
      desc = "모든 거점학교의 만족도 조사 결과를 조회합니다.";
    }
    $("pageTitle").textContent = title;
    $("pageDesc").textContent = desc;
    document.title = title + TITLE_SUFFIX;
  }
  function showDemoBanner() {
    var b = $("demo-banner");
    b.textContent = "데모 모드(" + (ROLE_LABEL[J.demoRole] || "관리자") + ") — 가상 학교·강좌·응답으로 화면을 미리 보는 중입니다. " +
      "변경 사항은 저장되지 않습니다. (역할 바꾸기: 주소 끝 ?demo=admin · support · school)";
    b.classList.remove("hidden");
  }
  function applyProfile(me) {
    var p = me.profile;
    state.me = me;
    state.profile = p;
    state.role = p.role;
    state.isAdmin = p.role === "admin";
    state.isSchool = p.role === "school";
    state.canViewAll = state.isAdmin || p.role === "support";
    updateScope();
    renderUserInfo();
    setPageHeader();
    $("new-survey-btn").classList.toggle("hidden", !state.isAdmin);
  }
  var starting = false;
  function start() {
    if (starting) return;
    starting = true;
    showGate("clock", "불러오는 중...", "로그인 정보를 확인하고 있어요.");
    // supabase-js를 못 불러오면 api.getMe()가 바로 예외를 던지므로 Promise 안에서 불러 오류 안내(다시 시도)로 이어지게 함
    Promise.resolve().then(function () { return api.getMe(); }).then(function (me) {
      if (!me || !me.user) { goLogin(); return; }
      var p = me.profile;
      if (!p || !Object.prototype.hasOwnProperty.call(ROLE_LABEL, p.role)) {
        showGate("lock", "접근 권한이 없어요", "워크스페이스 계정 정보(프로필)를 찾을 수 없어요. 관리자에게 문의해 주세요.");
        return;
      }
      applyProfile(me);
      showApp();
      return loadSurveys();
    }).catch(function (e) {
      console.error(e);
      showGate("warn", "화면을 불러오지 못했어요", J.errorInfo(e).message, true);
    }).then(function () { starting = false; });
  }

  /* ---------------- 로그아웃·비밀번호 변경 (index.html의 onclick이 부르는 전역 함수) ---------------- */
  window.handleLogout = function () {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    Promise.resolve().then(function () { return api.signOut(); })
      .catch(function (e) { console.error(e); })
      .then(function () { location.href = LOGIN_URL; });
  };
  // 비밀번호 칸은 모달이 열려 있을 때만 페이지에 둔다.
  // (비밀번호 칸이 있으면 브라우저가 검색창에 로그인 이메일을 자동으로 채움)
  function mountPasswordInputs() {
    document.querySelectorAll("#pwModal .pw-slot").forEach(function (slot) {
      if (slot.firstChild) return;
      var inp = document.createElement("input");
      inp.type = "password";
      inp.id = slot.getAttribute("data-pw");
      inp.setAttribute("autocomplete", slot.getAttribute("data-ac"));
      slot.appendChild(inp);
    });
  }
  function unmountPasswordInputs() {
    document.querySelectorAll("#pwModal .pw-slot").forEach(function (slot) { slot.innerHTML = ""; });
  }
  window.openPasswordModal = function () {
    mountPasswordInputs();
    $("pwCurrent").value = "";
    $("pwNew").value = "";
    $("pwConfirm").value = "";
    $("pwModal").classList.remove("hidden");
    setTimeout(function () { $("pwCurrent").focus(); }, 50);
  };
  window.closePasswordModal = function () {
    $("pwModal").classList.add("hidden");
    unmountPasswordInputs();
  };
  window.submitPasswordChange = function () {
    var currentPw = $("pwCurrent").value;
    var newPw = $("pwNew").value;
    var confirmPw = $("pwConfirm").value;
    if (!currentPw || !newPw || !confirmPw) { toast("❌ 모든 항목을 입력하세요", true); return; }
    if (newPw.length < 6) { toast("❌ 새 비밀번호는 6자 이상이어야 합니다", true); return; }
    if (newPw !== confirmPw) { toast("❌ 새 비밀번호와 확인이 일치하지 않습니다", true); return; }
    if (currentPw === newPw) { toast("❌ 현재 비밀번호와 새 비밀번호가 같습니다", true); return; }

    var btn = $("pwSubmitBtn");
    btn.disabled = true;
    btn.textContent = "변경 중...";
    // 1. 현재 비밀번호 검증(별도 요청 — 지금 세션에 영향 없음) → 2. 비밀번호 업데이트
    return Promise.resolve().then(function () { return api.currentUser(); }).then(function (user) {
      if (!user || !user.email) { toast("❌ 사용자 정보를 가져올 수 없습니다", true); return; }
      return api.verifyPassword(user.email, currentPw).then(function (ok) {
        if (!ok) { toast("❌ 현재 비밀번호가 올바르지 않습니다", true); return; }
        return api.changePassword(newPw).then(function () {
          toast("✅ 비밀번호가 변경되었습니다");
          window.closePasswordModal();
        }, function (e) {
          toast("❌ 비밀번호 변경 실패: " + (e && e.message || ""), true);
        });
      });
    }).catch(function (e) {
      toast("❌ 오류: " + (e && e.message || String(e)), true);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "변경";
    });
  };

  function init() {
    $("survey-select").addEventListener("change", function () { selectSurvey(this.value); });
    $("refresh-btn").addEventListener("click", function () { if (!state.loading) loadSurveyData({ quiet: true, onlyResponses: false }); });
    $("tabs").addEventListener("click", function (ev) {
      var b = ev.target.closest(".tab");
      if (b) go(b.getAttribute("data-tab"));
    });
    $("new-survey-btn").addEventListener("click", function () {
      if (!requireAdmin()) return;
      if (JA.newSurveyDialog) JA.newSurveyDialog();
    });
    $("modal-close").addEventListener("click", closeModal);
    $("modal-backdrop").addEventListener("mousedown", function (ev) { if (ev.target === this) closeModal(); });
    $("drawer-close").addEventListener("click", closeDrawer);
    $("drawer-backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (!$("pwModal").classList.contains("hidden")) window.closePasswordModal();
      else if (!$("modal-backdrop").classList.contains("hidden")) closeModal();
      else if (!$("drawer").classList.contains("hidden")) closeDrawer();
    });

    if (J.isDemo) showDemoBanner();
    if (J.configError) {
      showGate("warn", "결과 화면 설정이 비어 있어요",
        "설정 파일(config.js)에 Supabase 주소와 공개 키가 없어 결과를 불러올 수 없어요. 관리자에게 문의해 주세요.");
      return;
    }
    start();
  }
  document.addEventListener("DOMContentLoaded", init);

  return {
    J: J, api: api, S: S, state: state, views: views, TABS: TABS, ROLE_LABEL: ROLE_LABEL,
    esc: esc, toast: toast, fail: fail, requireAdmin: requireAdmin, fmtDT: fmtDT, num: num, debounce: debounce, download: download,
    typeBadge: typeBadge, copyText: copyText, surveyStatus: surveyStatus,
    modal: modal, closeModal: closeModal, confirmBox: confirmBox, openDrawer: openDrawer, closeDrawer: closeDrawer,
    printHtml: printHtml, scopedCourses: scopedCourses, filteredCourses: filteredCourses, schoolsOf: schoolsOf, typesOf: typesOf,
    rebuild: rebuild, render: render, go: go, loadSurveyData: loadSurveyData, loadSurveys: loadSurveys,
    replaceSurvey: replaceSurvey, updateSurveyStatus: updateSurveyStatus, updateScope: updateScope
  };
})();
