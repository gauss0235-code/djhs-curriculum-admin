// Edge Function: admin-user
// 관리자만 사용할 수 있는 사용자 계정 관리 API
// body의 action 필드로 분기: create / password / delete

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight 응답
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Authorization header missing" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 요청자 검증
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid token" }, 401);
    }

    // admin 권한 확인
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return json({ error: "Profile not found" }, 403);
    }
    if (profile.role !== "admin") {
      return json({ error: "관리자 권한이 필요합니다" }, 403);
    }

    // body 파싱
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ====== 사용자 목록 (profile + email) ======
    if (action === "list-users") {
      const { data: profiles, error: profilesError } = await adminClient
        .from("profiles")
        .select("*, schools(id, name, code)")
        .order("role")
        .order("display_name");
      if (profilesError) {
        return json({ error: profilesError.message }, 500);
      }

      const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (authError) {
        return json({ error: authError.message }, 500);
      }

      const emailMap = new Map(authData.users.map((u: any) => [u.id, u.email]));
      const result = profiles.map((p: any) => ({
        ...p,
        email: emailMap.get(p.id) || null,
      }));

      return json({ success: true, users: result });
    }

    // ====== 사용자 생성 ======
    if (action === "create") {
      const { email, password, display_name, role, school_id } = body;
      if (!email || !password || !display_name || !role) {
        return json({ error: "필수 필드가 누락되었습니다" }, 400);
      }
      if (!["admin", "support", "school"].includes(role)) {
        return json({ error: "유효하지 않은 role" }, 400);
      }
      if (role === "school" && !school_id) {
        return json({ error: "학교 담당자는 school_id가 필요합니다" }, 400);
      }

      // 담당자 이름 중복 체크
      const { data: existingName } = await adminClient
        .from("profiles")
        .select("id")
        .eq("display_name", display_name.trim())
        .maybeSingle();
      if (existingName) {
        return json({ error: "이미 같은 이름의 담당자가 존재합니다" }, 400);
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) {
        return json({ error: createError.message }, 400);
      }

      const { error: insertError } = await adminClient
        .from("profiles")
        .insert({
          id: newUser.user.id,
          display_name: display_name.trim(),
          role,
          school_id: role === "school" ? school_id : null,
        });

      if (insertError) {
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        return json({ error: "프로필 생성 실패: " + insertError.message }, 400);
      }
      return json({ success: true, user_id: newUser.user.id });
    }

    // ====== 비밀번호 변경 ======
    if (action === "password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return json({ error: "user_id와 new_password가 필요합니다" }, 400);
      }
      if (new_password.length < 6) {
        return json({ error: "비밀번호는 최소 6자 이상이어야 합니다" }, 400);
      }

      // 대상 사용자의 이메일 조회
      const { data: targetUser, error: getUserError } = await adminClient.auth.admin.getUserById(user_id);
      if (getUserError || !targetUser?.user?.email) {
        return json({ error: "대상 사용자를 찾을 수 없습니다" }, 404);
      }

      // 새 비밀번호로 로그인 시도 → 성공하면 이전과 동일하다는 의미
      const testClient = createClient(supabaseUrl, anonKey);
      const { data: signInData } = await testClient.auth.signInWithPassword({
        email: targetUser.user.email,
        password: new_password,
      });
      if (signInData?.session) {
        // 로그인 성공했으므로 즉시 로그아웃 (테스트 세션 정리)
        await testClient.auth.signOut();
        return json({ error: "현재 비밀번호와 동일합니다. 다른 비밀번호를 입력하세요." }, 400);
      }
      // 로그인 실패 = 다른 비밀번호 → 변경 진행

      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        user_id,
        { password: new_password }
      );
      if (updateError) {
        return json({ error: updateError.message }, 400);
      }
      return json({ success: true });
    }

    // ====== 사용자 삭제 ======
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return json({ error: "user_id가 필요합니다" }, 400);
      }
      if (user_id === user.id) {
        return json({ error: "본인 계정은 삭제할 수 없습니다" }, 400);
      }

      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return json({ error: deleteError.message }, 400);
      }
      return json({ success: true });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
