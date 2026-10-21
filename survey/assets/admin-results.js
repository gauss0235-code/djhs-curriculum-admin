/* 관리자 화면 — 결과 분석(대시보드·강좌별 결과·서술형/AI·결과 보고서·엑셀) */
(function () {
  "use strict";
  var JA = window.JA, S = JA.S, esc = JA.esc, state = JA.state, num = JA.num, views = JA.views;
  var LK = { 5: "매우 그렇다", 4: "그렇다", 3: "보통이다", 2: "그렇지 않다", 1: "전혀 그렇지 않다" };
  var ROLE = { positive: "좋았던 점", improve: "개선할 점", other: "서술형 의견" };
  // 이 설문에 실제로 있는 서술형 구분만 (좋았던 점·개선할 점을 한 문항으로 받으면 'other' 하나뿐)
  function textRoles(Q) {
    var out = [];
    (Q.text || []).forEach(function (q) { var r = q.textRole || "other"; if (out.indexOf(r) < 0) out.push(r); });
    return ["positive", "improve", "other"].filter(function (r) { return out.indexOf(r) >= 0; });
  }
  var f2 = function (v) { return S.f(v, 2); };

  /* ---------------- 공통 조각 ---------------- */
  function filterBar(extra) {
    var schools = JA.schoolsOf(), types = JA.typesOf(), f = state.filters;
    var html = '<div class="toolbar filters">';
    // 학교 담당자는 DB 권한(RLS)이 이미 자기 학교 강좌만 돌려주므로 학교 이름만 표시
    // (한 학교 강좌가 서로 다른 학교 표기로 들어온 드문 경우에만 고를 수 있게 둠)
    if (!state.scopeSchool || schools.length > 1) {
      html += '<select class="input sm" data-filter="school"><option value="">거점학교 전체 (' + schools.length + ")</option>" +
        schools.map(function (s) { return '<option value="' + esc(s) + '"' + (s === f.school ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select>";
    } else {
      html += '<span class="badge">' + esc(state.scopeSchool) + " 결과만 표시</span>";
    }
    html += '<select class="input sm" data-filter="type"><option value="">운영 유형 전체</option>' +
      types.map(function (t) { return '<option value="' + esc(t) + '"' + (t === f.type ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select>";
    if (f.school || f.type) html += '<button class="btn sm ghost" data-filter-reset>필터 해제</button>';
    html += '<span class="spacer"></span>' + (extra || "") + "</div>";
    return html;
  }
  function bindFilters(root, rerender) {
    root.querySelectorAll("[data-filter]").forEach(function (sel) {
      sel.addEventListener("change", function () { state.filters[sel.getAttribute("data-filter")] = sel.value; rerender(); });
    });
    var r = root.querySelector("[data-filter-reset]");
    if (r) r.addEventListener("click", function () { state.filters = { school: "", type: "" }; rerender(); });
  }
  function meanTrack(mean) {
    var w = mean == null ? 0 : Math.max(0, Math.min(100, (mean - 1) / 4 * 100));
    return '<span class="track" title="1~5점 척도"><i style="width:' + w.toFixed(1) + '%"></i></span>';
  }
  function distBar(dist, compact) {
    var total = dist[1] + dist[2] + dist[3] + dist[4] + dist[5];
    if (!total) return '<span class="dist empty"></span>';
    var html = '<span class="dist' + (compact ? " compact" : "") + '">';
    [5, 4, 3, 2, 1].forEach(function (k) {
      if (!dist[k]) return;
      var p = dist[k] / total * 100;
      html += '<i class="s' + k + '" style="width:' + p.toFixed(2) + '%" title="' + k + "점(" + LK[k] + "): " + dist[k] + "명 · " +
        p.toFixed(1) + '%">' + (!compact && p >= 9 ? Math.round(p) + "%" : "") + "</i>";
    });
    return html + "</span>";
  }
  function legend() {
    return '<div class="legend">' + [5, 4, 3, 2, 1].map(function (k) {
      return '<span><i class="s' + k + '"></i>' + k + " " + LK[k] + "</span>";
    }).join("") + "</div>";
  }
  function rateCell(rate) {
    if (rate == null) return '<span class="muted">–</span>';
    var cls = rate > 1 ? "bad" : rate < 0.3 ? "warn" : "";
    return '<span class="rate ' + cls + '">' + S.pct(rate) + "</span>";
  }
  function meanCell(m, n) {
    if (m == null) return '<span class="muted">–</span>';
    var cls = n >= 3 && m < 3.5 ? "low" : "";
    return '<b class="mean ' + cls + '">' + f2(m) + "</b>";
  }
  function qShort(q, len) {
    var t = q.text || "";
    return t.length > (len || 34) ? t.slice(0, len || 34) + "…" : t;
  }
  // 쓰기 동작(AI 분석 실행·응답 삭제·AI 결과 삭제)은 관리자만. 화면에서 숨기고, 함수 입구에서도 한 번 더 막음
  function adminOnly() {
    if (state.isAdmin) return true;
    JA.toast("관리자만 할 수 있는 작업이에요.", true);
    return false;
  }

  /* ---------------- 강좌가 하나도 없을 때 안내 ---------------- */
  var NO_COURSE_ICON = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 10.5 12 5l9 5.5-9 5.5z"/><path d="M7 13v4.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V13"/></svg>';
  function hasCourses() { return JA.scopedCourses().length > 0; }
  function noCoursesHtml() {
    var title, desc, note = "";
    if (state.isSchool) {
      var nm = state.scopeSchool || (state.profile && state.profile.schools && state.profile.schools.name) || "";
      title = "이번 설문에 우리 학교가 개설한 거점 강좌가 없어요(또는 권한 설정 전)";
      desc = (nm ? esc(nm) + " 이름으로 " : "") + "개설된 공동교육과정 거점 강좌가 이번 설문에 없거나, 아직 학교별 열람 권한이 설정되기 전일 수 있어요. " +
        "위에서 다른 설문을 골라 보거나 교육과정지원단에 문의해 주세요.";
    } else if (state.isAdmin) {
      title = "이번 설문에 등록된 강좌가 없어요";
      desc = "‘강좌 관리’ 탭에서 거점학교 운영자료 엑셀로 강좌를 등록하면 결과가 표시돼요.";
      note = '<p class="notice warn">DB 권한 설정(02_permissions.sql) 적용 전이면 강좌가 보이지 않을 수 있어요.</p>';
    } else {
      title = "이번 설문에 등록된 강좌가 아직 없어요";
      desc = "관리자가 강좌를 등록하면 결과가 표시돼요. 강좌가 있는데도 보이지 않으면 교육과정지원단 관리자에게 문의해 주세요.";
    }
    return note + '<div class="empty-state"><div class="icon">' + NO_COURSE_ICON + "</div><p>" + title + "</p><p>" + desc + "</p></div>";
  }

  /* =====================================================================
   *  대시보드
   * ===================================================================== */
  var schoolSort = { key: "mean", dir: -1 };
  views.dashboard = function (root) {
    if (!hasCourses()) { root.innerHTML = noCoursesHtml(); return; }
    var model = state.model, Q = model.Q;
    var cs = JA.filteredCourses();
    var rs = S.responsesOf(model, cs);
    var a = S.agg(Q, rs);
    var ro = S.rateOf(model, cs);
    var answered = cs.filter(function (c) { return (model.respByCourse[c.id] || []).length; }).length;
    var texts = S.textsOf(model, cs);
    var tPos = texts.filter(function (t) { return t.role === "positive"; }).length;
    var tImp = texts.filter(function (t) { return t.role === "improve"; }).length;

    var html = filterBar('<button class="btn sm" id="dash-xlsx">엑셀 다운로드</button>');

    html += '<div class="kpis">' +
      kpi("응답 수", num(rs.length) + "<small>명</small>", ro.den ? "수강신청 " + num(ro.den) + "명 중 · 응답률 <b>" + S.pct(ro.rate) + "</b>" : "수강신청 인원 미입력",
        { ic: KI.users, bar: ro.rate }) +
      kpi("전체 만족도", f2(a.mean) + "<small>/ 5</small>", a.pos == null ? "응답 없음" : "긍정 응답(4·5점) <b>" + S.pct(a.pos) + "</b>",
        { ic: KI.star, cls: "g", bar: a.mean == null ? null : (a.mean - 1) / 4, barColor: "var(--good)" }) +
      kpi("응답한 강좌", num(answered) + "<small>/ " + num(cs.length) + "</small>", cs.length - answered ? "아직 응답 없는 강좌 <b>" + (cs.length - answered) + "개</b>" : "모든 강좌 응답 있음",
        { ic: KI.book, cls: "v", bar: cs.length ? answered / cs.length : null, barColor: "var(--t-offline)" }) +
      kpi("서술형 의견", num(texts.length) + "<small>건</small>",
        textRoles(Q).some(function (r) { return r !== "other"; })
          ? "좋았던 점 <b>" + num(tPos) + "</b> · 개선할 점 <b>" + num(tImp) + "</b>"
          : "좋았던 점·개선할 점 함께 받음",
        { ic: KI.msg, cls: "o" }) +
      "</div>";

    // 영역별 평균 + 확인 필요
    html += '<div class="grid-2">';
    html += '<section class="panel"><div class="panel-head"><h2>영역별 평균</h2><span class="muted small">5점 만점</span></div><div class="panel-body">' +
      '<div class="sec-list">' + Q.sections.map(function (s) {
        var m = a.sections[s.name];
        return '<div class="sec-row"><span class="sec-name">' + esc(s.name) + '<small>' + s.qids.map(function (id) { return Q.no[id]; }).join("·") + "번</small></span>" +
          meanTrack(m) + '<b class="sec-val">' + f2(m) + "</b></div>";
      }).join("") + '</div><div class="track-axis"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div></div></section>';

    html += '<section class="panel"><div class="panel-head"><h2>확인이 필요한 항목</h2></div><div class="panel-body">' + attentionList(model, cs, a) + "</div></section>";
    html += "</div>";

    // 문항별 분포
    html += '<section class="panel"><div class="panel-head"><h2>문항별 응답 분포</h2>' + legend() + '</div><div class="panel-body"><div class="qdist">' +
      Q.likert.map(function (q) {
        var it = a.items[q.id];
        return '<div class="qrow"><div class="qlabel" title="' + esc(q.text) + '"><b>' + Q.no[q.id] + ".</b> " + esc(qShort(q, 40)) + "</div>" +
          distBar(it.dist) + '<div class="qmean">' + f2(it.mean) + "</div></div>";
      }).join("") + "</div></div></section>";

    // 일자별 + 유형별
    var days = S.daily(rs);
    html += '<div class="grid-2">';
    html += '<section class="panel"><div class="panel-head"><h2>일자별 응답 수</h2><span class="muted small">제출 시각 기준</span></div><div class="panel-body">' + dailyChart(days) + "</div></section>";
    var byType = S.groupRows(model, cs, function (c) { return c.course_type; });
    byType.sort(function (x, y) { return (S.TYPE_ORDER[x.key] || 9) - (S.TYPE_ORDER[y.key] || 9); });
    html += '<section class="panel"><div class="panel-head"><h2>운영 유형별</h2></div><div class="panel-body"><table class="tbl"><thead><tr><th>유형</th><th class="num">강좌</th><th class="num">신청</th><th class="num">응답</th><th class="num">응답률</th><th class="num">평균</th></tr></thead><tbody>' +
      byType.map(function (g) {
        return "<tr><td>" + JA.typeBadge(g.key) + '</td><td class="num">' + g.courses.length + '</td><td class="num">' + num(g.enrolled) +
          '</td><td class="num">' + num(g.n) + '</td><td class="num">' + rateCell(g.rate) + '</td><td class="num">' + meanCell(g.agg.mean, g.n) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
    html += "</div>";

    // 거점학교별
    if (!state.scopeSchool) {
      var bySchool = S.groupRows(model, cs, function (c) { return c.school; });
      var key = schoolSort.key, dir = schoolSort.dir;
      bySchool.sort(function (x, y) {
        var vx = key === "key" ? x.key : key === "mean" ? x.agg.mean : key === "rate" ? x.rate : key === "courses" ? x.courses.length : x[key];
        var vy = key === "key" ? y.key : key === "mean" ? y.agg.mean : key === "rate" ? y.rate : key === "courses" ? y.courses.length : y[key];
        if (vx == null && vy == null) return 0;
        if (vx == null) return 1;
        if (vy == null) return -1;
        if (typeof vx === "string") return vx.localeCompare(vy, "ko") * dir;
        return (vx - vy) * dir;
      });
      var th = function (k, label, cls) {
        var on = schoolSort.key === k;
        return '<th class="sortable ' + (cls || "") + (on ? " on" : "") + '" data-ssort="' + k + '">' + label + (on ? (dir > 0 ? " ▲" : " ▼") : "") + "</th>";
      };
      html += '<section class="panel"><div class="panel-head"><h2>거점학교별 현황</h2><span class="muted small">행을 누르면 그 학교 강좌 결과로 이동</span></div>' +
        '<div class="panel-body"><div class="tbl-wrap"><table class="tbl hover"><thead><tr>' +
        th("key", "거점학교") + th("courses", "강좌", "num") + '<th class="num">응답 강좌</th>' + th("enrolled", "신청", "num") + th("n", "응답", "num") +
        th("rate", "응답률", "num") + th("mean", "평균", "num") + '<th class="w-track">평균 (1~5)</th></tr></thead><tbody>' +
        bySchool.map(function (g) {
          return '<tr data-school="' + esc(g.key) + '"><td><b>' + esc(g.key) + '</b></td><td class="num">' + g.courses.length + '</td><td class="num">' + g.answered +
            '</td><td class="num">' + num(g.enrolled) + '</td><td class="num">' + num(g.n) + '</td><td class="num">' + rateCell(g.rate) +
            '</td><td class="num">' + meanCell(g.agg.mean, g.n) + "</td><td>" + meanTrack(g.agg.mean) + "</td></tr>";
        }).join("") + "</tbody></table></div></div></section>";
    }

    root.innerHTML = html;
    bindFilters(root, function () { views.dashboard(root); });
    root.querySelector("#dash-xlsx").addEventListener("click", exportExcel);
    root.querySelectorAll("[data-ssort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-ssort");
        if (schoolSort.key === k) schoolSort.dir *= -1; else { schoolSort.key = k; schoolSort.dir = k === "key" ? 1 : -1; }
        views.dashboard(root);
      });
    });
    root.querySelectorAll("tr[data-school]").forEach(function (tr) {
      tr.addEventListener("click", function () { JA.go("courses", { filters: { school: tr.getAttribute("data-school") } }); });
    });
    root.querySelectorAll("[data-goto-course]").forEach(function (el) {
      el.addEventListener("click", function () { openCourse(el.getAttribute("data-goto-course")); });
    });
    root.querySelectorAll("[data-goto-view]").forEach(function (el) {
      el.addEventListener("click", function () { courseState.view = el.getAttribute("data-goto-view"); JA.go("courses"); });
    });
  };

  var KSVG = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>"; };
  var KI = {
    users: KSVG('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
    star: KSVG('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    book: KSVG('<path d="M3 10.5 12 5l9 5.5-9 5.5z"/><path d="M7 13v4.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V13"/>'),
    msg: KSVG('<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>')
  };
  function kpi(label, value, sub, o) {
    o = o || {};
    var bar = o.bar == null || isNaN(o.bar) ? "" : '<div class="kpi-bar"><i style="width:' + Math.max(0, Math.min(100, o.bar * 100)).toFixed(1) + "%" +
      (o.barColor ? ";background:" + o.barColor : "") + '"></i></div>';
    return '<div class="kpi"><div class="kpi-label">' + (o.ic ? '<span class="kpi-ic ' + (o.cls || "") + '">' + o.ic + "</span>" : "") + label + "</div>" +
      '<div class="kpi-value">' + value + "</div>" + bar + '<div class="kpi-sub">' + sub + "</div></div>";
  }
  function dailyChart(days) {
    if (!days.length) return '<p class="muted">아직 응답이 없어요.</p>';
    var shown = days.slice(-31), max = 1;
    shown.forEach(function (d) { if (d.n > max) max = d.n; });
    var step = shown.length > 16 ? Math.ceil(shown.length / 10) : 1;
    return '<div class="cols">' + shown.map(function (d, i) {
      var h = d.n / max * 100;
      return '<div class="col" title="' + d.date + ": " + d.n + '명"><span class="col-val">' + (d.n && (d.n === max || shown.length <= 14) ? d.n : "") +
        '</span><i style="height:' + h.toFixed(1) + '%"></i><span class="col-lab">' + (i % step === 0 ? d.label : "") + "</span></div>";
    }).join("") + "</div>";
  }
  function attentionList(model, cs, a) {
    var rows = S.courseRows(model, cs), items = [];
    var low = rows.filter(function (r) { return r.n >= 3 && r.agg.mean != null && r.agg.mean < 3.5; })
      .sort(function (x, y) { return x.agg.mean - y.agg.mean; });
    var over = rows.filter(function (r) { return r.enrolled && r.n > r.enrolled; });
    var none = rows.filter(function (r) { return !r.n; });
    var lowRate = rows.filter(function (r) { return r.n && r.rate != null && r.rate < 0.3; });
    low.slice(0, 5).forEach(function (r) {
      items.push('<li class="att bad" data-goto-course="' + esc(r.course.id) + '"><span class="att-ic">!</span><span><b>' + esc(r.course.school) + " · " + esc(r.course.name) +
        "</b> 평균 " + f2(r.agg.mean) + "점 (응답 " + r.n + "명)</span></li>");
    });
    if (low.length > 5) items.push('<li class="att" data-goto-view="low"><span class="att-ic">…</span><span>평균 3.5점 미만 강좌 ' + low.length + "개 모두 보기</span></li>");
    over.forEach(function (r) {
      items.push('<li class="att bad" data-goto-course="' + esc(r.course.id) + '"><span class="att-ic">!</span><span><b>' + esc(r.course.school) + " · " + esc(r.course.name) +
        "</b> 응답 " + r.n + "명이 신청 인원(" + r.enrolled + "명)보다 많음 — 강좌 오선택·중복 응답 확인</span></li>");
    });
    if (none.length) items.push('<li class="att warn" data-goto-view="none"><span class="att-ic">0</span><span>아직 응답이 없는 강좌 <b>' + none.length + "개</b> — 목록 보기</span></li>");
    if (lowRate.length) items.push('<li class="att warn" data-goto-view="lowrate"><span class="att-ic">%</span><span>응답률 30% 미만 강좌 <b>' + lowRate.length + "개</b> — 목록 보기</span></li>");
    var lowest = null;
    model.Q.likert.forEach(function (q) { var it = a.items[q.id]; if (it.mean != null && (!lowest || it.mean < lowest.m)) lowest = { q: q, m: it.mean }; });
    if (lowest) items.push('<li class="att info"><span class="att-ic">↓</span><span>가장 낮은 문항: <b>' + model.Q.no[lowest.q.id] + "번</b> " + esc(qShort(lowest.q, 30)) + " (" + f2(lowest.m) + ")</span></li>");
    if (!items.length) return '<p class="muted">특이 사항이 없어요.</p>';
    return '<ul class="att-list">' + items.join("") + "</ul>";
  }

  /* =====================================================================
   *  강좌별 결과
   * ===================================================================== */
  var courseState = { q: "", view: "all", sort: "seq", dir: 1 };
  var VIEW_OPTS = [["all", "모든 강좌"], ["none", "응답 없는 강좌"], ["lowrate", "응답률 30% 미만"], ["low", "평균 3.5점 미만"], ["over", "응답 수 > 신청 인원"]];
  views.courses = function (root) {
    if (!hasCourses()) { root.innerHTML = noCoursesHtml(); return; }
    var model = state.model, Q = model.Q;
    var rows = S.courseRows(model, JA.filteredCourses());
    var q = courseState.q.trim().toLowerCase().replace(/\s+/g, "");
    rows = rows.filter(function (r) {
      var c = r.course;
      if (q && (c.name + c.school + c.teacher).toLowerCase().replace(/\s+/g, "").indexOf(q) < 0) return false;
      switch (courseState.view) {
        case "none": return !r.n;
        case "lowrate": return r.n > 0 && r.rate != null && r.rate < 0.3;
        case "low": return r.n >= 3 && r.agg.mean != null && r.agg.mean < 3.5;
        case "over": return r.enrolled && r.n > r.enrolled;
        default: return true;
      }
    });
    var key = courseState.sort, dir = courseState.dir;
    function val(r) {
      if (key === "seq") return r.course.seq;
      if (key === "school") return r.course.school + "\u0000" + String(r.course.seq || 0).padStart(5, "0");
      if (key === "type") return (S.TYPE_ORDER[r.course.course_type] || 9);
      if (key === "name") return r.course.name;
      if (key === "teacher") return r.course.teacher;
      if (key === "enrolled") return r.enrolled;
      if (key === "n") return r.n;
      if (key === "rate") return r.rate;
      if (key === "mean") return r.agg.mean;
      if (key === "texts") return r.agg.texts;
      if (key.indexOf("sec:") === 0) return r.agg.sections[key.slice(4)];
      return null;
    }
    rows.sort(function (x, y) {
      var a = val(x), b = val(y);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      if (typeof a === "string") return a.localeCompare(b, "ko") * dir;
      return (a - b) * dir;
    });
    var th = function (k, label, cls) {
      var on = key === k;
      return '<th class="sortable ' + (cls || "") + (on ? " on" : "") + '" data-csort="' + esc(k) + '">' + label + (on ? (dir > 0 ? " ▲" : " ▼") : "") + "</th>";
    };

    var html = filterBar(
      '<input class="input sm search-sm" id="c-q" type="search" name="jcs-course-q" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" onpointerdown="this.removeAttribute(\'readonly\')" placeholder="강좌·교사 검색" value="' + esc(courseState.q) + '">' +
      '<select class="input sm" id="c-view">' + VIEW_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === courseState.view ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
      '<button class="btn sm" id="c-xlsx">엑셀 다운로드</button>');
    html += '<section class="panel"><div class="panel-head"><h2>강좌별 결과 <span class="muted small">' + rows.length + '개</span></h2><span class="muted small">행을 누르면 상세 결과·서술형·보고서용 표를 볼 수 있어요</span></div>' +
      '<div class="tbl-wrap tall"><table class="tbl hover sticky-head"><thead><tr>' +
      th("seq", "연번", "num") + th("school", "거점학교") + th("type", "유형") + th("name", "강좌명") + th("teacher", "수업교사") +
      th("enrolled", "신청", "num") + th("n", "응답", "num") + th("rate", "응답률", "num") +
      Q.sections.map(function (s) { return th("sec:" + s.name, esc(s.name), "num sec-th"); }).join("") +
      th("mean", "전체 평균", "num") + th("texts", "의견", "num") + "</tr></thead><tbody>" +
      (rows.length ? rows.map(function (r) {
        var c = r.course;
        return '<tr data-id="' + esc(c.id) + '"' + (c.is_active === false ? ' class="inactive"' : "") + '><td class="num muted">' + (c.seq == null ? "" : c.seq) + "</td><td>" + esc(c.school) + "</td><td>" + JA.typeBadge(c.course_type) +
          "</td><td><b>" + esc(c.name) + "</b>" + (c.note ? ' <span class="badge">' + esc(c.note) + "</span>" : "") + "</td><td>" + esc(c.teacher) + '</td><td class="num">' + num(c.enrolled) +
          '</td><td class="num">' + num(r.n) + '</td><td class="num">' + rateCell(r.rate) + "</td>" +
          Q.sections.map(function (s) { return '<td class="num">' + f2(r.agg.sections[s.name]) + "</td>"; }).join("") +
          '<td class="num">' + meanCell(r.agg.mean, r.n) + '</td><td class="num">' + (r.agg.texts || "") + "</td></tr>";
      }).join("") : '<tr><td colspan="' + (11 + Q.sections.length) + '" class="empty-row">조건에 맞는 강좌가 없어요.</td></tr>') +
      "</tbody></table></div></section>";

    root.innerHTML = html;
    bindFilters(root, function () { views.courses(root); });
    var qEl = root.querySelector("#c-q");
    qEl.addEventListener("input", JA.debounce(function () {
      if (state.tab !== "courses") return;
      courseState.q = qEl.value; views.courses(root);
      var el = root.querySelector("#c-q"); el.removeAttribute("readonly"); el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    }, 250));
    root.querySelector("#c-view").addEventListener("change", function () { courseState.view = this.value; views.courses(root); });
    root.querySelector("#c-xlsx").addEventListener("click", exportExcel);
    root.querySelectorAll("[data-csort]").forEach(function (el) {
      el.addEventListener("click", function () {
        var k = el.getAttribute("data-csort");
        if (courseState.sort === k) courseState.dir *= -1;
        else { courseState.sort = k; courseState.dir = /^(mean|n|rate|enrolled|texts)$|^sec:/.test(k) ? -1 : 1; }
        views.courses(root);
      });
    });
    root.querySelectorAll("tr[data-id]").forEach(function (tr) {
      tr.addEventListener("click", function () { openCourse(tr.getAttribute("data-id")); });
    });
  };

  /* ---------------- 강좌 상세(서랍) ---------------- */
  function reportTableHtml(Q, a, digits) {
    return '<table class="tbl rpt-tbl"><thead><tr><th rowspan="2">질문<br>번호</th><th colspan="5">설문결과 (명)</th><th rowspan="2">평균<br>(5점 만점)</th></tr>' +
      "<tr><th>5</th><th>4</th><th>3</th><th>2</th><th>1</th></tr></thead><tbody><tr><td>" + esc(Q.scoreLabel) + "</td>" +
      [5, 4, 3, 2, 1].map(function (k) { return "<td>" + (a.scale[k] || "-") + "</td>"; }).join("") +
      "<td><b>" + S.f(a.mean, digits) + "</b></td></tr></tbody></table>";
  }
  function reportTableTsv(Q, a, digits) {
    return ["질문 번호\t5\t4\t3\t2\t1\t평균(5점 만점)",
      Q.scoreLabel + "\t" + [5, 4, 3, 2, 1].map(function (k) { return a.scale[k] || "-"; }).join("\t") + "\t" + S.f(a.mean, digits)].join("\n");
  }
  function latestAi(scope, key) {
    return state.ai.find(function (r) {
      return r.scope === scope && (scope === "course" ? r.course_id === key : scope === "school" ? r.school === key : true);
    });
  }

  var drawerCourse = null;
  function openCourse(id) {
    var model = state.model, Q = model.Q, c = model.courseMap[id];
    if (!c) return;
    var rs = model.respByCourse[id] || [];
    var a = S.agg(Q, rs);
    var all = S.agg(Q, model.responses);
    var texts = S.textsOf(model, [c]);
    var title = '<div class="drawer-kicker">' + JA.typeBadge(c.course_type) + " " + esc(c.school) + "</div>" +
      '<h2 id="drawer-title">' + esc(c.name) + "</h2>" +
      '<div class="muted small">' + [c.teacher && "수업교사 " + esc(c.teacher), c.category && esc(c.category), c.credits && esc(c.credits) + (/[^0-9]/.test(c.credits) ? "" : "학점"), c.grade && "대상 " + esc(c.grade) + "학년"].filter(Boolean).join(" · ") + "</div>";

    var html = '<div class="kpis mini">' +
      kpi("응답", num(rs.length) + "<small>명</small>", c.enrolled ? "신청 " + c.enrolled + "명 · " + S.pct(rs.length / c.enrolled) : "신청 인원 미입력") +
      kpi("평균", f2(a.mean) + "<small>/ 5</small>", "전체 평균 " + f2(all.mean)) +
      kpi("긍정 응답", S.pct(a.pos), "4·5점 비율") + "</div>";

    if (!rs.length) {
      html += '<div class="empty-state small"><p>아직 이 강좌에 응답이 없어요.</p></div>';
    } else {
      html += '<section class="sub"><div class="sub-head"><h3>운영 결과 보고서용 표 <span class="muted small">[부록 15] 수업 만족도 결과</span></h3>' +
        '<button class="btn sm" id="copy-rpt">표 복사</button></div>' +
        '<p class="rpt-cap">• 수업 만족도(참여인원: ' + rs.length + "명)</p>" + reportTableHtml(Q, a, 1) + "</section>";

      html += '<section class="sub"><div class="sub-head"><h3>문항별 결과</h3>' + legend() + '</div><table class="tbl qtbl"><thead><tr><th>문항</th><th>분포</th><th class="num">평균</th><th class="num">전체 대비</th></tr></thead><tbody>' +
        Q.likert.map(function (q) {
          var it = a.items[q.id], base = all.items[q.id].mean;
          var diff = it.mean != null && base != null ? it.mean - base : null;
          var dcls = diff == null ? "" : diff <= -0.3 ? "down" : diff >= 0.3 ? "up" : "";
          return '<tr><td class="qcell" title="' + esc(q.text) + '"><b>' + Q.no[q.id] + ".</b> " + esc(qShort(q, 26)) + "</td><td>" + distBar(it.dist, true) +
            '</td><td class="num"><b>' + f2(it.mean) + '</b></td><td class="num diff ' + dcls + '">' +
            (diff == null ? "–" : (diff > 0 ? "+" : "") + diff.toFixed(2)) + "</td></tr>";
        }).join("") + "</tbody></table></section>";

      html += '<section class="sub"><div class="sub-head"><h3>서술형 의견 <span class="muted small">' + texts.length + "건</span></h3></div>";
      var roles = textRoles(Q);
      ["positive", "improve", "other"].forEach(function (role) {
        var list = texts.filter(function (t) { return t.role === role; });
        if (!list.length && roles.indexOf(role) < 0) return;
        html += '<div class="op-group"><div class="op-title ' + role + '">' + ROLE[role] + " (" + list.length + ")</div>" +
          (list.length ? '<ul class="op-list">' + list.map(function (t) { return "<li>" + esc(t.text) + "</li>"; }).join("") + "</ul>" : '<p class="muted small">없음</p>') + "</div>";
      });
      html += "</section>";

      var rep = latestAi("course", id);
      html += '<section class="sub"><div class="sub-head"><h3>AI 요약</h3>' +
        (state.isAdmin && texts.length ? '<button class="btn sm" id="ai-course">' + (rep ? "다시 분석" : "AI 요약 만들기") + "</button>" : "") + "</div>" +
        '<div id="ai-course-box">' + (rep ? aiCard(rep, true) : '<p class="muted small">' + (texts.length ? "아직 AI 요약이 없어요." : "서술형 의견이 없어 요약할 내용이 없어요.") + "</p>") + "</div></section>";

      html += '<details class="sub raw"><summary>응답 원자료 ' + rs.length + "건 보기</summary>" +
        '<div class="tbl-wrap"><table class="tbl small-tbl"><thead><tr><th>제출 시각</th>' + Q.likert.map(function (q) { return '<th class="num">' + Q.no[q.id] + "</th>"; }).join("") +
        "<th>서술형</th>" + (state.isAdmin ? "<th></th>" : "") + "</tr></thead><tbody>" +
        rs.slice().sort(function (x, y) { return x.created_at < y.created_at ? 1 : -1; }).map(function (r) {
          var tx = Q.text.map(function (q) { return r.answers[q.id]; }).filter(Boolean).join(" / ");
          return "<tr><td>" + JA.fmtDT(r.created_at) + "</td>" + Q.likert.map(function (q) {
            var v = r.answers[q.id];
            return '<td class="num">' + (typeof v === "number" && v >= 1 && v <= 5 ? v : "") + "</td>";
          }).join("") +
            '<td class="txt" title="' + esc(tx) + '">' + esc(tx.length > 30 ? tx.slice(0, 30) + "…" : tx) + "</td>" +
            (state.isAdmin ? '<td><button class="btn sm ghost danger-text" data-del-resp="' + r.id + '">삭제</button></td>' : "") + "</tr>";
        }).join("") + "</tbody></table></div>" +
        (state.isAdmin ? '<p class="muted small">장난·오선택 응답은 삭제할 수 있어요. 삭제한 응답은 복구되지 않습니다.</p>' : "") + "</details>";
    }
    html += '<div class="drawer-actions"><button class="btn" id="print-course">이 강좌 결과지 인쇄</button></div>';

    var body = JA.openDrawer(title, html);
    drawerCourse = id;
    var cp = body.querySelector("#copy-rpt");
    if (cp) cp.addEventListener("click", function () { JA.copyText(reportTableTsv(Q, a, 1)); });
    body.querySelector("#print-course").addEventListener("click", function () {
      JA.printHtml(reportDoc([c.school], { digits: 1, opinion: "raw", includeEmpty: true, onlyCourse: id }));
    });
    var aiBtn = body.querySelector("#ai-course");
    if (aiBtn) aiBtn.addEventListener("click", function () {
      if (!adminOnly()) return;
      runAi({ scope: "course", course_id: id }, aiBtn, function (rep2) {
        var box = body.querySelector("#ai-course-box");
        if (box && drawerCourse === id) box.innerHTML = aiCard(rep2, true);
      });
    });
    body.querySelectorAll("[data-del-resp]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!adminOnly()) return;
        var rid = Number(b.getAttribute("data-del-resp"));
        JA.confirmBox("응답 삭제", "이 응답 1건을 삭제할까요? 삭제하면 복구할 수 없어요.", "삭제", true).then(function (ok) {
          if (!ok || !adminOnly()) return;
          JA.api.deleteResponse(rid).then(function () {
            state.responses = state.responses.filter(function (r) { return r.id !== rid; });
            JA.rebuild();
            JA.render();
            openCourse(id);
            JA.toast("응답을 삭제했어요.");
          }).catch(JA.fail);
        });
      });
    });
  }
  JA.openCourse = openCourse;

  /* =====================================================================
   *  서술형 · AI 분석
   * ===================================================================== */
  var opState = { role: "", q: "", limit: 200, aiScope: "all", aiSchool: "", aiCourse: "" };
  function aiScopeLabel(r) {
    if (r.scope === "course") {
      var c = state.model.courseMap[r.course_id];
      return c ? c.school + " · " + c.name : "강좌";
    }
    if (r.scope === "school") return r.school + " 전체";
    return "전체 강좌";
  }
  function aiCard(r, compact) {
    var c = r.content || {};
    function list(arr, withCount) {
      if (!arr || !arr.length) return '<p class="muted small">없음</p>';
      return "<ul>" + arr.map(function (x) {
        if (typeof x === "string") return "<li>" + esc(x) + "</li>";
        var label = x.point || x.theme || x.target || "";
        var cnt = withCount && (x.count || x.evidence_count) ? ' <span class="cnt">' + esc(x.count || x.evidence_count) + "건</span>" : "";
        var reason = x.reason ? ' — <span class="muted">' + esc(x.reason) + "</span>" : "";
        return "<li>" + esc(label) + cnt + reason + "</li>";
      }).join("") + "</ul>";
    }
    var html = '<article class="ai-card">' +
      '<div class="ai-meta"><span class="badge">' + esc(aiScopeLabel(r)) + "</span><span>" + JA.fmtDT(r.created_at) + " · 응답 " + num(r.response_count) + "건 기반" +
      (r.model ? " · " + esc(r.model) : "") + "</span>" + (state.isAdmin && !compact ? '<button class="btn sm ghost danger-text" data-del-ai="' + r.id + '">삭제</button>' : "") + "</div>" +
      (c.overview ? '<p class="ai-overview">' + esc(c.overview) + "</p>" : "") +
      '<div class="ai-grid"><div><h4 class="pos">좋았던 점</h4>' + list(c.strengths, true) + "</div>" +
      '<div><h4 class="neg">개선이 필요한 점</h4>' + list(c.improvements, true) + "</div></div>" +
      (c.suggestions && c.suggestions.length ? '<h4>다음 학기 운영 제안</h4>' + list(c.suggestions) : "") +
      (c.attention && c.attention.length ? '<h4>살펴볼 강좌</h4>' + list(c.attention) : "") +
      (c.report_opinions && c.report_opinions.length ? '<details class="ai-rpt"><summary>운영 결과 보고서용 문장</summary><h5>학생 의견</h5>' + list(c.report_opinions) +
        "<h5>수업 후 개선 사항 / 요구 사항</h5>" + list(c.report_requests) + "</details>" : "") +
      "</article>";
    return html;
  }
  function runAi(body, btn, done) {
    if (!adminOnly()) return Promise.resolve();
    var label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner tiny"></span> 분석 중… (최대 1분)';
    body.survey_id = state.survey.id;
    return JA.api.generateAiReport(body).then(function (rep) {
      if (rep && rep.report) rep = rep.report;
      state.ai.unshift(rep);
      JA.toast("AI 분석을 완료했어요.");
      if (done) done(rep);
    }).catch(JA.fail).then(function () { btn.disabled = false; btn.textContent = label; });
  }

  views.opinions = function (root) {
    if (!hasCourses()) { root.innerHTML = noCoursesHtml(); return; }
    var model = state.model;
    var cs = JA.filteredCourses();
    var all = S.textsOf(model, cs);
    var q = opState.q.trim();
    if (textRoles(model.Q).indexOf(opState.role) < 0) opState.role = "";
    var list = all.filter(function (t) {
      if (opState.role && t.role !== opState.role) return false;
      if (q && (t.text + t.course.name + t.course.school).indexOf(q) < 0) return false;
      return true;
    });
    var schools = JA.schoolsOf();
    var html = filterBar("");

    // AI 패널
    html += '<section class="panel"><div class="panel-head"><h2>AI 서술형 분석</h2><span class="muted small">서술형 응답을 주제별로 묶어 요약하고 개선 제안을 만듭니다 (Gemini)</span></div><div class="panel-body">';
    if (state.isAdmin) {
      html += '<div class="toolbar ai-controls"><select class="input sm" id="ai-scope">' +
        (state.scopeSchool ? "" : '<option value="all"' + (opState.aiScope === "all" ? " selected" : "") + ">전체 강좌</option>") +
        '<option value="school"' + (opState.aiScope === "school" ? " selected" : "") + ">거점학교별</option>" +
        '<option value="course"' + (opState.aiScope === "course" ? " selected" : "") + ">강좌별</option></select>" +
        '<select class="input sm' + (opState.aiScope === "school" ? "" : " hidden") + '" id="ai-school">' + schools.map(function (s) {
          return '<option value="' + esc(s) + '"' + (s === opState.aiSchool ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select>" +
        '<select class="input sm wide' + (opState.aiScope === "course" ? "" : " hidden") + '" id="ai-course">' + JA.scopedCourses().map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === opState.aiCourse ? " selected" : "") + ">" + esc(c.school + " · " + c.name) + "</option>"; }).join("") + "</select>" +
        '<button class="btn primary sm" id="ai-run">AI 분석 실행</button><span class="muted small" id="ai-hint"></span></div>';
    }
    var reps = state.ai.filter(function (r) {
      if (state.filters.school) return r.scope !== "all" && (r.school === state.filters.school || (r.scope === "course" && model.courseMap[r.course_id] && model.courseMap[r.course_id].school === state.filters.school));
      return true;
    });
    html += '<div id="ai-list">' + (reps.length ? reps.slice(0, 20).map(function (r) { return aiCard(r); }).join("") :
      '<p class="muted">아직 AI 분석 결과가 없어요.' + (state.isAdmin ? " 위에서 범위를 고르고 <b>AI 분석 실행</b>을 누르세요." : " 관리자가 AI 분석을 실행하면 여기에 표시돼요.") + "</p>") + "</div>";
    html += "</div></section>";

    // 원문 (서술형이 한 종류뿐이면 구분 고르기·꼬리표를 숨김)
    var opRoles = textRoles(state.model.Q), multiRole = opRoles.length > 1;
    html += '<section class="panel"><div class="panel-head"><h2>서술형 원문 <span class="muted small">' + list.length + "건</span></h2>" +
      '<div class="toolbar">' + (multiRole ? '<select class="input sm" id="op-role"><option value="">전체</option>' +
      opRoles.map(function (k) { return '<option value="' + k + '"' + (k === opState.role ? " selected" : "") + ">" + ROLE[k] + "</option>"; }).join("") + "</select>" : "") +
      '<input class="input sm search-sm" id="op-q" type="search" name="jcs-opinion-q" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" onpointerdown="this.removeAttribute(\'readonly\')" placeholder="키워드 검색" value="' + esc(opState.q) + '"></div></div><div class="panel-body">' +
      (list.length ? '<ul class="op-feed">' + list.slice(0, opState.limit).map(function (t) {
        return '<li>' + (multiRole ? '<span class="op-role ' + esc(t.role) + '">' + esc(ROLE[t.role] || "기타 의견") + "</span>" : "") + '<div><p>' + highlight(t.text, q) + '</p><div class="muted small">' + esc(t.course.school) + " · " +
          '<a href="#" data-goto-course="' + esc(t.course.id) + '">' + esc(t.course.name) + "</a> · " + JA.fmtDT(t.at) + "</div></div></li>";
      }).join("") + "</ul>" + (list.length > opState.limit ? '<button class="btn sm" id="op-more">더 보기 (' + (list.length - opState.limit) + "건 남음)</button>" : "") :
        '<p class="muted">조건에 맞는 의견이 없어요.</p>') + "</div></section>";

    root.innerHTML = html;
    bindFilters(root, function () { views.opinions(root); });
    var sc = state.isAdmin ? root.querySelector("#ai-scope") : null;
    if (sc) {
      var updHint = function () {
        var body = aiBody();
        var n = 0;
        if (body) {
          var cs2 = body.scope === "course" ? [model.courseMap[body.course_id]] : body.scope === "school" ? JA.scopedCourses().filter(function (c) { return c.school === body.school; }) : JA.scopedCourses();
          n = S.textsOf(model, cs2.filter(Boolean)).length;
        }
        root.querySelector("#ai-hint").textContent = "분석 대상 서술형 " + num(n) + "건";
        root.querySelector("#ai-run").disabled = !n;
      };
      sc.addEventListener("change", function () {
        opState.aiScope = sc.value;
        root.querySelector("#ai-school").classList.toggle("hidden", sc.value !== "school");
        root.querySelector("#ai-course").classList.toggle("hidden", sc.value !== "course");
        updHint();
      });
      root.querySelector("#ai-school").addEventListener("change", function () { opState.aiSchool = this.value; updHint(); });
      root.querySelector("#ai-course").addEventListener("change", function () { opState.aiCourse = this.value; updHint(); });
      root.querySelector("#ai-run").addEventListener("click", function () {
        if (!adminOnly()) return;
        var body = aiBody();
        if (!body) return;
        runAi(body, this, function () { if (state.tab === "opinions") views.opinions(root); });
      });
      updHint();
    }
    function aiBody() {
      var s = root.querySelector("#ai-scope").value;
      if (s === "school") return { scope: "school", school: root.querySelector("#ai-school").value };
      if (s === "course") return { scope: "course", course_id: root.querySelector("#ai-course").value };
      return { scope: "all" };
    }
    root.querySelectorAll("[data-del-ai]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!adminOnly()) return;
        var id = Number(b.getAttribute("data-del-ai"));
        JA.confirmBox("AI 분석 삭제", "이 분석 결과를 삭제할까요?", "삭제", true).then(function (ok) {
          if (!ok || !adminOnly()) return;
          JA.api.deleteAiReport(id).then(function () {
            state.ai = state.ai.filter(function (r) { return r.id !== id; });
            views.opinions(root);
          }).catch(JA.fail);
        });
      });
    });
    var roleSel = root.querySelector("#op-role");
    if (roleSel) roleSel.addEventListener("change", function () { opState.role = this.value; opState.limit = 200; views.opinions(root); });
    var oq = root.querySelector("#op-q");
    oq.addEventListener("input", JA.debounce(function () {
      if (state.tab !== "opinions") return;
      opState.q = oq.value; views.opinions(root);
      var el = root.querySelector("#op-q"); el.removeAttribute("readonly"); el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    }, 300));
    var more = root.querySelector("#op-more");
    if (more) more.addEventListener("click", function () { opState.limit += 300; views.opinions(root); });
    root.querySelectorAll("[data-goto-course]").forEach(function (a) {
      a.addEventListener("click", function (ev) { ev.preventDefault(); openCourse(a.getAttribute("data-goto-course")); });
    });
  };
  function highlight(text, q) {
    var e = esc(text);
    if (!q) return e;
    var eq = esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return e.replace(new RegExp(eq, "g"), "<mark>$&</mark>");
  }

  /* =====================================================================
   *  결과 보고서 ([부록 15] 양식 기반, 거점학교별)
   * ===================================================================== */
  var rptState = { school: "", digits: 1, opinion: "raw", includeEmpty: true };
  function reportDoc(schools, opts) {
    var model = state.model, Q = model.Q, sv = state.survey;
    var period = sv.year && sv.semester ? sv.year + "학년도 " + sv.semester + "학기" : "";
    var today = new Date();
    var printed = today.getFullYear() + ". " + (today.getMonth() + 1) + ". " + today.getDate() + ".";
    var cfg = JA.J.cfg;
    return schools.map(function (school, si) {
      var cs = S.sortCoursesForReport(JA.scopedCourses().filter(function (c) {
        return c.school === school && (!opts.onlyCourse || c.id === opts.onlyCourse);
      }));
      if (!opts.includeEmpty) cs = cs.filter(function (c) { return (model.respByCourse[c.id] || []).length; });
      var rows = S.courseRows(model, cs);
      var total = S.agg(Q, S.responsesOf(model, cs));
      var html = '<section class="rpt' + (si ? " page-break" : "") + '">' +
        '<div class="rpt-kicker">' + esc(period) + "</div>" +
        "<h1>" + esc(school) + " " + esc(cfg.PROGRAM_NAME || "공동교육과정") + " 만족도 조사 결과</h1>" +
        '<p class="rpt-meta">강좌 ' + cs.length + "개 · 응답 " + total.n + "명 · 전체 평균 " + S.f(total.mean, opts.digits) + "점(5점 만점) · 출력일 " + printed + "</p>";
      if (!opts.onlyCourse) {
        html += "<h2>Ⅰ. 강좌별 만족도 현황</h2>" +
          '<table class="rtbl"><thead><tr><th>연번</th><th>유형</th><th>강좌명</th><th>선택 과목<br>유형</th><th>학점수<br>(시수)</th><th>대상<br>학년</th><th>수업교사</th>' +
          "<th>수강<br>신청</th><th>응답자</th><th>응답률<br>(%)</th><th>만족도 평균<br>(5점 만점)</th></tr></thead><tbody>" +
          rows.map(function (r, i) {
            var c = r.course;
            return "<tr><td>" + (i + 1) + "</td><td>" + esc(c.course_type) + '</td><td class="l">' + esc(c.name) + "</td><td>" + esc(c.category) + "</td><td>" +
              esc(c.credits) + "</td><td>" + esc(c.grade) + "</td><td>" + esc(c.teacher) + "</td><td>" + (c.enrolled == null ? "" : c.enrolled) + "</td><td>" + r.n +
              "</td><td>" + (r.rate == null ? "" : (r.rate * 100).toFixed(1)) + "</td><td><b>" + (r.n ? S.f(r.agg.mean, opts.digits) : "-") + "</b></td></tr>";
          }).join("") + "</tbody></table>" +
          '<p class="rpt-note">※ 온라인, 오프라인, 진로선택형 순으로 작성 · 응답률 = 응답자 ÷ 수강신청 학생 수</p>' +
          "<h2>Ⅱ. 강좌별 수업 만족도 결과</h2>";
      }
      rows.forEach(function (r, i) {
        var c = r.course, op = reportOpinions(Q, c, opts.opinion);
        var srcNote = op.ai ? '<span class="rpt-src">AI 요약</span>' : "";
        html += '<div class="rpt-course"><h3>' + (opts.onlyCourse ? "" : (i + 1) + ". ") + esc(c.name) + " <small>" + esc([c.course_type, c.teacher && "수업교사 " + c.teacher].filter(Boolean).join(" · ")) + "</small></h3>";
        if (!r.n) {
          html += '<p class="rpt-empty">응답 없음</p></div>';
          return;
        }
        html += '<p class="rpt-cap">• 수업 만족도(참여인원: ' + r.n + "명)</p>" + reportTableHtml(Q, r.agg, opts.digits).replace('class="tbl rpt-tbl"', 'class="rtbl narrow"') +
          '<p class="rpt-cap">• 문항별 평균</p><table class="rtbl qavg"><thead><tr>' + Q.likert.map(function (q) { return "<th>" + Q.no[q.id] + "</th>"; }).join("") +
          "</tr></thead><tbody><tr>" + Q.likert.map(function (q) { return "<td>" + S.f(r.agg.items[q.id].mean, opts.digits) + "</td>"; }).join("") + "</tr></tbody></table>" +
          '<p class="rpt-cap">• 학생 의견' + (op.merged ? "(좋았던 점·개선할 점)" : "") + " " + srcNote + "</p>" + bullets(op.pos) +
          '<p class="rpt-cap">• 수업 후 개선 사항 / 요구 사항 ' + srcNote + "</p>" +
          (op.merged ? '<p class="rpt-empty">' + MERGED_NOTE + "</p>" : bullets(op.imp)) + "</div>";
      });
      return html + "</section>";
    }).join("");
  }
  // 보고서의 '학생 의견'·'개선 사항' 두 칸. AI 요약을 골랐고 그 강좌 AI 결과가 있으면 AI 문장, 아니면 원문을 구분대로 나눔.
  // 서술형을 한 문항으로 받은 설문(개선할 점 문항 없음)은 원문을 나눌 수 없으니 merged로 알려 개선 칸에 안내를 넣음
  var MERGED_NOTE = "※ 위 학생 의견에 함께 기재";
  function reportOpinions(Q, c, mode) {
    var ai = mode === "ai" ? latestAi("course", c.id) : null, ct = ai && ai.content;
    if (ct && ((ct.report_opinions && ct.report_opinions.length) || (ct.report_requests && ct.report_requests.length))) {
      return { ai: true, merged: false, pos: ct.report_opinions || [], imp: ct.report_requests || [] };
    }
    var texts = S.textsOf(state.model, [c]);
    function of(fn) { return texts.filter(fn).map(function (t) { return t.text; }); }
    return {
      ai: false,
      merged: textRoles(Q).indexOf("improve") < 0,
      pos: of(function (t) { return t.role === "positive"; }).concat(of(function (t) { return t.role !== "positive" && t.role !== "improve"; })),
      imp: of(function (t) { return t.role === "improve"; })
    };
  }
  function bullets(arr) {
    if (!arr.length) return '<p class="rpt-empty">-</p>';
    return '<ul class="rpt-list">' + arr.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  }

  views.report = function (root) {
    if (!hasCourses()) { root.innerHTML = noCoursesHtml(); return; }
    // 학교 목록은 DB 권한으로 걸러진 강좌(scopedCourses) 기준
    var schools = JA.schoolsOf();
    if (state.scopeSchool) {
      // 학교 담당자: '모든 거점학교' 없이 자기 학교로 고정 (강좌 표기가 둘 이상이면 그 안에서만 고름)
      if (!rptState.school || rptState.school === "__all" || schools.indexOf(rptState.school) < 0) {
        rptState.school = schools.indexOf(state.scopeSchool) >= 0 ? state.scopeSchool : schools[0] || "";
      }
    }
    if (rptState.school && rptState.school !== "__all" && schools.indexOf(rptState.school) < 0) rptState.school = "";
    if (!rptState.school && schools.length) rptState.school = schools[0];
    var sel = rptState.school === "__all" ? schools : rptState.school ? [rptState.school] : [];
    var html = '<div class="toolbar">' +
      '<select class="input sm" id="r-school">' + (state.scopeSchool ? "" : '<option value="__all"' + (rptState.school === "__all" ? " selected" : "") + ">모든 거점학교 (학교별 쪽 나눔)</option>") +
      schools.map(function (s) { return '<option value="' + esc(s) + '"' + (s === rptState.school ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select>" +
      '<select class="input sm" id="r-digits"><option value="1"' + (rptState.digits === 1 ? " selected" : "") + '>평균 소수 첫째 자리</option><option value="2"' + (rptState.digits === 2 ? " selected" : "") + ">평균 소수 둘째 자리</option></select>" +
      '<select class="input sm" id="r-op"><option value="raw"' + (rptState.opinion === "raw" ? " selected" : "") + '>학생 의견: 원문 전체</option><option value="ai"' + (rptState.opinion === "ai" ? " selected" : "") + ">학생 의견: AI 요약 문장(있는 강좌)</option></select>" +
      '<label class="check"><input type="checkbox" id="r-empty"' + (rptState.includeEmpty ? " checked" : "") + "> 응답 없는 강좌 포함</label>" +
      '<span class="spacer"></span><button class="btn" id="r-xlsx">엑셀(보고서용)</button><button class="btn primary" id="r-print">인쇄 · PDF 저장</button></div>' +
      '<p class="muted small help">운영 안내서 [부록 15] 운영 결과 보고서의 ‘수업 만족도 결과’ 칸에 그대로 옮길 수 있는 형식입니다. 인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 저장돼요.' +
      (textRoles(state.model.Q).indexOf("improve") < 0 ? " 이 설문은 좋았던 점·개선할 점을 한 문항으로 받아서, ‘원문 전체’로 두면 개선 사항이 학생 의견 칸에 함께 들어가요. 두 칸으로 나누려면 " +
        (state.isAdmin ? "강좌별 AI 분석을 실행한 뒤" : "관리자가 강좌별 AI 분석을 실행한 강좌에서") + " ‘학생 의견: AI 요약 문장’을 고르세요." : "") + "</p>" +
      '<div class="rpt-preview" id="r-doc">' + (sel.length ? reportDoc(sel, rptState) : '<p class="muted">거점학교를 선택하세요.</p>') + "</div>";
    root.innerHTML = html;
    root.querySelector("#r-school").addEventListener("change", function () { rptState.school = this.value; views.report(root); });
    root.querySelector("#r-digits").addEventListener("change", function () { rptState.digits = Number(this.value); views.report(root); });
    root.querySelector("#r-op").addEventListener("change", function () { rptState.opinion = this.value; views.report(root); });
    root.querySelector("#r-empty").addEventListener("change", function () { rptState.includeEmpty = this.checked; views.report(root); });
    root.querySelector("#r-print").addEventListener("click", function () { JA.printHtml(reportDoc(sel, rptState)); });
    root.querySelector("#r-xlsx").addEventListener("click", function () { exportReportExcel(sel); });
  };

  /* =====================================================================
   *  엑셀 내보내기
   * ===================================================================== */
  function r2(v) { return v == null || isNaN(v) ? "" : Math.round(v * 100) / 100; }
  function r1p(v) { return v == null || isNaN(v) ? "" : Math.round(v * 1000) / 10; }
  function sheet(aoa, widths) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    if (widths) ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
  }
  function needXlsx() {
    if (window.XLSX) return true;
    JA.toast("엑셀 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인하세요.", true);
    return false;
  }
  function exportExcel() {
    if (!needXlsx()) return;
    var model = state.model, Q = model.Q, cs = JA.scopedCourses();
    var wb = XLSX.utils.book_new();
    var rows = S.courseRows(model, S.sortCoursesForReport(cs).sort(function (a, b) {
      return a.school.localeCompare(b.school, "ko") || (S.TYPE_ORDER[a.course_type] || 9) - (S.TYPE_ORDER[b.course_type] || 9) || (a.seq || 0) - (b.seq || 0);
    }));

    var h1 = ["연번", "거점학교", "유형", "강좌명", "과목 편성", "대상 학년", "학점(시수)", "수업교사", "수강신청", "응답 수", "응답률(%)"]
      .concat(Q.likert.map(function (q) { return Q.no[q.id] + "번 평균"; }))
      .concat(Q.sections.map(function (s) { return s.name + " 평균"; }))
      .concat(["전체 평균", "긍정 응답률(%)", "5점 수", "4점 수", "3점 수", "2점 수", "1점 수", "서술형 수"]);
    var d1 = rows.map(function (r) {
      var c = r.course, a = r.agg;
      return [c.seq, c.school, c.course_type, c.name, c.category, c.grade, c.credits, c.teacher, c.enrolled == null ? "" : c.enrolled, r.n, r1p(r.rate)]
        .concat(Q.likert.map(function (q) { return r2(a.items[q.id].mean); }))
        .concat(Q.sections.map(function (s) { return r2(a.sections[s.name]); }))
        .concat([r2(a.mean), r1p(a.pos), a.scale[5], a.scale[4], a.scale[3], a.scale[2], a.scale[1], a.texts]);
    });
    XLSX.utils.book_append_sheet(wb, sheet([h1].concat(d1), [6, 14, 9, 28, 10, 8, 9, 12, 8, 8, 9]), "강좌별 결과");

    var groups = S.groupRows(model, cs, function (c) { return c.school; }).sort(function (a, b) { return a.key.localeCompare(b.key, "ko"); });
    var h2 = ["거점학교", "강좌 수", "응답 강좌 수", "수강신청", "응답 수", "응답률(%)"].concat(Q.sections.map(function (s) { return s.name + " 평균"; })).concat(["전체 평균", "긍정 응답률(%)"]);
    var d2 = groups.map(function (g) {
      return [g.key, g.courses.length, g.answered, g.enrolled == null ? "" : g.enrolled, g.n, r1p(g.rate)]
        .concat(Q.sections.map(function (s) { return r2(g.agg.sections[s.name]); })).concat([r2(g.agg.mean), r1p(g.agg.pos)]);
    });
    var tot = S.agg(Q, S.responsesOf(model, cs)), totR = S.rateOf(model, cs);
    d2.push(["합계", cs.length, groups.reduce(function (s, g) { return s + g.answered; }, 0), totR.den == null ? "" : totR.den, tot.n, r1p(totR.rate)]
      .concat(Q.sections.map(function (s) { return r2(tot.sections[s.name]); })).concat([r2(tot.mean), r1p(tot.pos)]));
    XLSX.utils.book_append_sheet(wb, sheet([h2].concat(d2), [16, 8, 10, 9, 8, 9]), "거점학교별");

    var h3 = ["번호", "영역", "문항", "응답 수", "평균", "5점", "4점", "3점", "2점", "1점", "5점(%)", "4점(%)", "3점(%)", "2점(%)", "1점(%)"];
    var d3 = Q.likert.map(function (q) {
      var it = tot.items[q.id], n = it.n || 1;
      return [Q.no[q.id], q.section || "", q.text, it.n, r2(it.mean), it.dist[5], it.dist[4], it.dist[3], it.dist[2], it.dist[1]]
        .concat([5, 4, 3, 2, 1].map(function (k) { return it.n ? Math.round(it.dist[k] / n * 1000) / 10 : ""; }));
    });
    XLSX.utils.book_append_sheet(wb, sheet([h3].concat(d3), [6, 16, 60, 8, 7]), "문항별 결과");

    var h4 = ["응답 번호", "제출 시각", "거점학교", "유형", "강좌명", "수업교사"]
      .concat(Q.all.map(function (q) { return Q.no[q.id] + ". " + (q.type === "likert" ? "" : "[" + (ROLE[q.textRole] || "응답") + "] ") + qShort(q, 20); }));
    var d4 = [];
    rows.forEach(function (r) {
      (model.respByCourse[r.course.id] || []).forEach(function (resp) {
        d4.push([resp.id, JA.fmtDT(resp.created_at), r.course.school, r.course.course_type, r.course.name, r.course.teacher].concat(Q.all.map(function (q) {
          var v = resp.answers[q.id];
          return Array.isArray(v) ? v.join(", ") : v == null ? "" : v;
        })));
      });
    });
    XLSX.utils.book_append_sheet(wb, sheet([h4].concat(d4), [8, 16, 14, 9, 26, 10]), "응답 원자료");

    var texts = S.textsOf(model, cs);
    var d5 = texts.map(function (t) { return [t.course.school, t.course.course_type, t.course.name, t.course.teacher, ROLE[t.role] || "", t.text, JA.fmtDT(t.at)]; });
    XLSX.utils.book_append_sheet(wb, sheet([["거점학교", "유형", "강좌명", "수업교사", "구분", "의견", "제출 시각"]].concat(d5), [14, 9, 26, 10, 10, 80, 16]), "서술형 의견");

    XLSX.writeFile(wb, "공동교육과정_만족도_" + state.survey.slug + (state.scopeSchool ? "_" + state.scopeSchool : "") + "_" + stamp() + ".xlsx");
    JA.toast("엑셀 파일을 내려받았어요.");
  }
  function exportReportExcel(schools) {
    if (!needXlsx()) return;
    var model = state.model, Q = model.Q, d = rptState.digits;
    var wb = XLSX.utils.book_new();
    var aoa = [["거점학교", "연번", "유형", "강좌명", "선택 과목 유형", "학점수(시수)", "대상 학년", "수업교사", "수강신청", "참여인원(응답자)", "응답률(%)",
      "질문 번호", "5", "4", "3", "2", "1", "평균(5점 만점)", "학생 의견", "수업 후 개선 사항 / 요구 사항"]];
    schools.forEach(function (school) {
      var cs = S.sortCoursesForReport(JA.scopedCourses().filter(function (c) { return c.school === school; }));
      S.courseRows(model, cs).forEach(function (r, i) {
        // 화면 미리보기·인쇄와 같은 규칙(AI 요약 선택 반영, 한 문항 설문은 개선 칸에 안내)
        var c = r.course, op = reportOpinions(Q, c, rptState.opinion);
        function lines(arr) { return arr.map(function (t) { return "- " + t; }).join("\n"); }
        var pos = lines(op.pos), imp = op.merged ? (op.pos.length ? MERGED_NOTE : "") : lines(op.imp);
        aoa.push([school, i + 1, c.course_type, c.name, c.category, c.credits, c.grade, c.teacher, c.enrolled == null ? "" : c.enrolled, r.n, r1p(r.rate),
          Q.scoreLabel, r.agg.scale[5] || "-", r.agg.scale[4] || "-", r.agg.scale[3] || "-", r.agg.scale[2] || "-", r.agg.scale[1] || "-",
          r.n ? Number(S.f(r.agg.mean, d)) : "", pos, imp]);
      });
    });
    XLSX.utils.book_append_sheet(wb, sheet(aoa, [14, 5, 9, 26, 10, 9, 7, 10, 7, 9, 8, 7, 5, 5, 5, 5, 5, 9, 60, 60]), "부록15 만족도 결과");
    var name = schools.length === 1 ? schools[0] : "전체";
    XLSX.writeFile(wb, "만족도결과_보고서용_" + name + "_" + stamp() + ".xlsx");
    JA.toast("보고서용 엑셀을 내려받았어요.");
  }
  JA.exportExcel = exportExcel;
})();
