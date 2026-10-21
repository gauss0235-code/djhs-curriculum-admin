/* =====================================================================
 *  만족도 조사 결과 화면 설정
 *  워크스페이스와 같은 Supabase 프로젝트·공개 키를 써야 로그인 세션이 공유됩니다.
 *  (publishable 키는 공개용이라 웹페이지에 넣어도 됩니다. service_role 키는 절대 넣지 마세요.)
 * ===================================================================== */
window.JCS_CONFIG = {
  SUPABASE_URL: "https://nzsgvjdotnvqpzhehfsg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ALakaYU4jTYEIQas_nWrsQ_An3IK9_h",

  // QR코드에 들어갈 학생용 설문 주소 (학부모·학생 공개 사이트 dje-hscredit 저장소의 survey/)
  // 비어 있으면 QR·배포 화면은 QR 대신 안내를 보여 줍니다.
  SURVEY_BASE_URL: "https://djhs-curriculum.kro.kr/survey/",

  // AI 서술형 분석 Edge Function 이름
  AI_FUNCTION_NAME: "jcs-ai-summary",

  // 화면에 표시되는 사업명
  PROGRAM_NAME: "너두나두 공동교육과정",
  ORG_NAME: "대전광역시교육청"
};
