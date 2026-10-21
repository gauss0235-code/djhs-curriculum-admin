/* 집계·분석 함수 (화면과 엑셀·보고서가 같은 계산을 쓰도록 한곳에 모음) */
window.JCSStats = (function () {
  "use strict";
  var TYPE_ORDER = { "온라인": 1, "오프라인": 2, "진로선택형": 3 };

  function questionsOf(survey) {
    var all = (survey.questions || []).filter(function (q) { return q && q.id && q.type !== "section"; });
    var likert = all.filter(function (q) { return q.type === "likert"; });
    var Q = {
      all: all,
      likert: likert,
      score: likert.filter(function (q) { return q.includeInScore !== false; }),
      text: all.filter(function (q) { return q.type === "text"; }),
      choice: all.filter(function (q) { return q.type === "single" || q.type === "multi"; }),
      no: {}
    };
    all.forEach(function (q, i) { Q.no[q.id] = i + 1; });
    var secs = [], idx = {};
    likert.forEach(function (q) {
      var name = q.section || "문항";
      if (!(name in idx)) { idx[name] = secs.length; secs.push({ name: name, qids: [] }); }
      secs[idx[name]].qids.push(q.id);
    });
    Q.sections = secs;
    // 보고서 '질문 번호' 표기 (예: 1~10)
    var nums = Q.score.map(function (q) { return Q.no[q.id]; });
    var contiguous = nums.every(function (n, i) { return i === 0 || n === nums[i - 1] + 1; });
    Q.scoreLabel = !nums.length ? "-" : contiguous ? (nums.length > 1 ? nums[0] + "~" + nums[nums.length - 1] : String(nums[0])) : nums.join(",");
    return Q;
  }

  function validScore(v) { return typeof v === "number" && v >= 1 && v <= 5 && Math.floor(v) === v; }

  function agg(Q, responses) {
    var items = {};
    Q.likert.forEach(function (q) { items[q.id] = { n: 0, sum: 0, dist: [0, 0, 0, 0, 0, 0], mean: null }; });
    var scale = [0, 0, 0, 0, 0, 0], sn = 0, ss = 0, choice = {}, texts = 0;
    Q.choice.forEach(function (q) { choice[q.id] = {}; });
    var scoreIds = {};
    Q.score.forEach(function (q) { scoreIds[q.id] = 1; });
    responses.forEach(function (r) {
      var a = r.answers || {};
      Q.likert.forEach(function (q) {
        var v = a[q.id];
        if (!validScore(v)) return;
        var it = items[q.id];
        it.n++; it.sum += v; it.dist[v]++;
        if (scoreIds[q.id]) { scale[v]++; sn++; ss += v; }
      });
      Q.choice.forEach(function (q) {
        var v = a[q.id], m = choice[q.id];
        (Array.isArray(v) ? v : v ? [v] : []).forEach(function (o) { m[o] = (m[o] || 0) + 1; });
      });
      Q.text.forEach(function (q) { if (typeof a[q.id] === "string" && a[q.id].trim()) texts++; });
    });
    Object.keys(items).forEach(function (k) { var it = items[k]; it.mean = it.n ? it.sum / it.n : null; });
    var sections = {};
    Q.sections.forEach(function (s) {
      var n = 0, sum = 0;
      s.qids.forEach(function (id) { n += items[id].n; sum += items[id].sum; });
      sections[s.name] = n ? sum / n : null;
    });
    return {
      n: responses.length, items: items, sections: sections, scale: scale, scoreN: sn,
      mean: sn ? ss / sn : null,
      pos: sn ? (scale[4] + scale[5]) / sn : null,
      neg: sn ? (scale[1] + scale[2]) / sn : null,
      choice: choice, texts: texts
    };
  }

  function build(survey, courses, responses) {
    var Q = questionsOf(survey);
    var courseMap = {}, respByCourse = {};
    courses.forEach(function (c) { courseMap[c.id] = c; respByCourse[c.id] = []; });
    responses.forEach(function (r) { if (respByCourse[r.course_id]) respByCourse[r.course_id].push(r); });
    return { survey: survey, Q: Q, courses: courses, courseMap: courseMap, responses: responses, respByCourse: respByCourse };
  }

  function responsesOf(model, courseList) {
    var out = [];
    courseList.forEach(function (c) { out = out.concat(model.respByCourse[c.id] || []); });
    return out;
  }

  function courseRows(model, courseList) {
    return courseList.map(function (c) {
      var rs = model.respByCourse[c.id] || [];
      var a = agg(model.Q, rs);
      return { course: c, agg: a, n: rs.length, enrolled: c.enrolled, rate: c.enrolled ? rs.length / c.enrolled : null };
    });
  }

  // 응답률: 수강신청 인원이 입력된 강좌만 분자·분모에 넣음
  function rateOf(model, courseList) {
    var num = 0, den = 0;
    courseList.forEach(function (c) {
      if (!c.enrolled) return;
      den += c.enrolled;
      num += (model.respByCourse[c.id] || []).length;
    });
    return { num: num, den: den || null, rate: den ? num / den : null };
  }

  function groupRows(model, courseList, keyFn) {
    var groups = {}, order = [];
    courseList.forEach(function (c) {
      var k = keyFn(c) || "(미지정)";
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(c);
    });
    return order.map(function (k) {
      var cs = groups[k], rs = responsesOf(model, cs), ro = rateOf(model, cs);
      var answered = cs.filter(function (c) { return (model.respByCourse[c.id] || []).length > 0; }).length;
      return {
        key: k, courses: cs, n: rs.length, enrolled: ro.den, rate: ro.rate, answered: answered, agg: agg(model.Q, rs)
      };
    });
  }

  function textsOf(model, courseList) {
    var out = [];
    courseList.forEach(function (c) {
      (model.respByCourse[c.id] || []).forEach(function (r) {
        model.Q.text.forEach(function (q) {
          var t = r.answers && r.answers[q.id];
          if (typeof t === "string" && t.trim()) {
            out.push({ id: r.id + ":" + q.id, response: r, course: c, q: q, role: q.textRole || "other", text: t.trim(), at: r.created_at });
          }
        });
      });
    });
    out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return out;
  }

  function daily(responses) {
    if (!responses.length) return [];
    var m = {}, min = null, max = null;
    responses.forEach(function (r) {
      var d = new Date(r.created_at);
      var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
      m[key] = (m[key] || 0) + 1;
      var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (min == null || t < min) min = t;
      if (max == null || t > max) max = t;
    });
    var out = [];
    min = Math.max(min, max - 119 * 864e5);
    for (var t = min; t <= max + 36e5; t += 864e5) {
      var d2 = new Date(t);
      var k = d2.getFullYear() + "-" + ("0" + (d2.getMonth() + 1)).slice(-2) + "-" + ("0" + d2.getDate()).slice(-2);
      if (out.length && out[out.length - 1].date === k) continue;
      out.push({ date: k, label: (d2.getMonth() + 1) + "/" + d2.getDate(), n: m[k] || 0 });
    }
    return out;
  }

  function sortCoursesForReport(list) {
    return list.slice().sort(function (a, b) {
      return (TYPE_ORDER[a.course_type] || 9) - (TYPE_ORDER[b.course_type] || 9) ||
        (a.seq || 0) - (b.seq || 0) || a.name.localeCompare(b.name, "ko");
    });
  }

  function f(v, d) { return v == null || isNaN(v) ? "–" : v.toFixed(d == null ? 2 : d); }
  function pct(v, d) { return v == null || isNaN(v) ? "–" : (v * 100).toFixed(d == null ? 0 : d) + "%"; }

  return {
    questionsOf: questionsOf, agg: agg, build: build, responsesOf: responsesOf, courseRows: courseRows, rateOf: rateOf,
    groupRows: groupRows, textsOf: textsOf, daily: daily, sortCoursesForReport: sortCoursesForReport,
    f: f, pct: pct, TYPE_ORDER: TYPE_ORDER
  };
})();
