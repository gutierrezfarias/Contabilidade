using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class ClientPortalAccessManagementTests
{
    [Fact]
    public void Migration_adds_non_destructive_access_management()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260622_client_portal_access_management.sql"));

        Assert.Contains("add column if not exists disabled_at", sql);
        Assert.Contains("add column if not exists removed_at", sql);
        Assert.Contains("create or replace function public.update_client_portal_user_access", sql);
        Assert.Contains("create or replace function public.set_client_portal_user_status", sql);
        Assert.Contains("create or replace function public.remove_client_portal_user_link", sql);
        Assert.Contains("create or replace function public.record_client_portal_password_reset_request", sql);
        Assert.DoesNotContain("delete from auth.users", sql);
        Assert.DoesNotContain("drop table public.client_portal_users", sql);
    }

    [Fact]
    public void Migration_preserves_audit_and_reduces_direct_table_writes()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260622_client_portal_access_management.sql"));

        Assert.Contains("client_portal_access_logs", sql);
        Assert.Contains("portal_access_disabled", sql);
        Assert.Contains("portal_access_reactivated", sql);
        Assert.Contains("portal_access_removed", sql);
        Assert.Contains("portal_password_reset_requested", sql);
        Assert.Contains("revoke insert, update, delete, truncate, references, trigger on public.client_portal_users from authenticated", sql);
        Assert.Contains("grant execute on function public.update_client_portal_user_access", sql);
    }

    [Fact]
    public void Frontend_uses_rpcs_for_sensitive_access_changes()
    {
        var service = Normalize(ReadFile("src", "services", "accountingDocumentsService.ts"));
        var page = Normalize(ReadFile("src", "pages", "accounting", "AccountingDocuments.tsx"));

        Assert.Contains("supabase.rpc('update_client_portal_user_access'", service);
        Assert.Contains("supabase.rpc('set_client_portal_user_status'", service);
        Assert.Contains("supabase.rpc('remove_client_portal_user_link'", service);
        Assert.Contains("supabase.rpc('record_client_portal_password_reset_request'", service);
        Assert.Contains("este acesso ainda nao possui usuario auth vinculado", service);
        Assert.Contains("troca de e-mail exige endpoint administrativo seguro", page);
        Assert.Contains("remover vinculo", page);
    }

    [Fact]
    public void Reset_password_page_requires_recovery_session()
    {
        var page = Normalize(ReadFile("src", "pages", "auth", "ResetPassword.tsx"));

        Assert.Contains("supabase.auth.getsession()", page);
        Assert.Contains("supabase.auth.onauthstatechange", page);
        Assert.Contains("password_recovery", page);
        Assert.Contains("link de redefinicao invalido ou expirado", page);
        Assert.Contains("navigate('/login'", page);
    }

    private static string Normalize(string value)
    {
        return value.Replace("\"", "'").ToLowerInvariant();
    }

    private static string ReadFile(params string[] segments)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(new[] { directory.FullName }.Concat(segments).ToArray());
            if (File.Exists(candidate))
            {
                return File.ReadAllText(candidate);
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Arquivo nao encontrado: {Path.Combine(segments)}");
    }
}
