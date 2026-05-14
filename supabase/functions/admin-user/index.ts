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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid token" }, 401);
    }

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

    const body = await req.json().catch(() => ({}));
    const action = body.action;

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

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createError) return json({ error: createError.message }, 400);

      const { error: insertError } = await adminClient
        .from("profiles")
        .insert({
          id: newUser.user.id,
          display_name,
          role,
          school_id: role === "school" ? school_id : null,
        });

      if (insertError) {
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        return json({ error: "프로필 생성 실패: " + insertError.message }, 400);
      }
      return json({ success: true, user_id: newUser.user.id });
    }

    if (action === "password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return json({ error: "user_id와 new_password가 필요합니다" }, 400);
      }
      if (new_password.length < 6) {
        return json({ error: "비밀번호는 최소 6자 이상이어야 합니다" }, 400);
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        user_id,
        { password: new_password }
      );
      if (updateError) return json({ error: updateError.message }, 400);
      return json({ success: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id가 필요합니다" }, 400);
      if (user_id === user.id) {
        return json({ error: "본인 계정은 삭제할 수 없습니다" }, 400);
      }

      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) return json({ error: deleteError.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});