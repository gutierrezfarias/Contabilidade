using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class SerproLeastPrivilegeGrantTests
{
    [Fact]
    public void Migration_revokes_all_privileges_from_anon_on_sensitive_serpro_tables()
    {
        var sql = ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql");

        foreach (var table in SensitiveTables)
        {
            Assert.Contains($"revoke all privileges on table public.%i from anon", NormalizeSql(sql));
            Assert.Contains(table, sql);
        }

        Assert.DoesNotContain("grant all privileges on table public.%i to anon", NormalizeSql(sql));
        Assert.DoesNotContain("grant select on table public.serpro_documents to anon", NormalizeSql(sql));
        Assert.DoesNotContain("grant select on table public.serpro_requests to anon", NormalizeSql(sql));
        Assert.DoesNotContain("grant select on table public.serpro_wallet_transactions to anon", NormalizeSql(sql));
    }

    [Fact]
    public void Migration_revokes_authenticated_write_truncate_trigger_and_references()
    {
        var sql = NormalizeSql(ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql"));

        Assert.Contains("revoke all privileges on table public.%i from authenticated", sql);
        Assert.DoesNotContain("grant insert", sql);
        Assert.DoesNotContain("grant update", sql);
        Assert.DoesNotContain("grant delete", sql);
        Assert.DoesNotContain("grant truncate", sql);
        Assert.DoesNotContain("grant trigger", sql);
        Assert.DoesNotContain("grant references", sql);
    }

    [Fact]
    public void Authenticated_keeps_only_select_on_readable_tables()
    {
        var sql = NormalizeSql(ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql"));

        Assert.Contains("grant select on table public.serpro_documents to authenticated", sql);
        Assert.Contains("grant select on table public.serpro_requests to authenticated", sql);
        Assert.Contains("grant select on table public.serpro_wallet_transactions to authenticated", sql);
    }

    [Fact]
    public void Operation_locks_are_backend_only()
    {
        var sql = NormalizeSql(ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql"));

        Assert.Contains("revoke all privileges on table public.serpro_operation_locks from authenticated", sql);
        Assert.DoesNotContain("grant select on table public.serpro_operation_locks to authenticated", sql);
        Assert.DoesNotContain("grant insert on table public.serpro_operation_locks to authenticated", sql);
    }

    [Fact]
    public void Wallet_transactions_are_read_only_for_authenticated_users()
    {
        var sql = NormalizeSql(ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql"));

        Assert.Contains("grant select on table public.serpro_wallet_transactions to authenticated", sql);
        Assert.DoesNotContain("grant insert on table public.serpro_wallet_transactions to authenticated", sql);
        Assert.DoesNotContain("grant update on table public.serpro_wallet_transactions to authenticated", sql);
        Assert.DoesNotContain("grant delete on table public.serpro_wallet_transactions to authenticated", sql);
    }

    [Fact]
    public void Service_role_and_postgres_keep_all_privileges()
    {
        var sql = NormalizeSql(ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql"));

        Assert.Contains("grant all privileges on table public.%i to service_role", sql);
        Assert.Contains("grant all privileges on table public.%i to postgres", sql);
    }

    [Fact]
    public void Migration_keeps_rls_enabled_on_sensitive_tables()
    {
        var sql = NormalizeSql(ReadFile("supabase", "migrations", "20260616_serpro_least_privilege_grants.sql"));

        foreach (var table in SensitiveTables)
        {
            Assert.Contains($"alter table public.{table} enable row level security", sql);
        }
    }

    [Fact]
    public void Existing_rls_policies_restrict_authenticated_reads_by_organization()
    {
        var serproMigration = ReadFile("supabase", "migrations", "20260616_serpro_dual_contract_mode.sql");
        var duplicateMigration = ReadFile("supabase", "migrations", "20260616_duplicate_prevention_serpro_revenue.sql");

        Assert.Contains("public.serpro_can_access_org(organization_id)", serproMigration);
        Assert.Contains("public.serpro_can_access_org(organization_id)", duplicateMigration);
    }

    [Fact]
    public void Diagnostic_lists_final_privileges_for_target_roles()
    {
        var sql = ReadFile("supabase", "diagnostics", "20260616_serpro_privileges_diagnostic.sql");

        Assert.Contains("anon", sql);
        Assert.Contains("authenticated", sql);
        Assert.Contains("service_role", sql);
        Assert.Contains("postgres", sql);
        Assert.Contains("serpro_operation_locks", sql);
        Assert.Contains("expected_privileges", sql);
    }

    private static readonly string[] SensitiveTables =
    [
        "serpro_documents",
        "serpro_requests",
        "serpro_operation_locks",
        "serpro_wallet_transactions"
    ];

    private static string NormalizeSql(string sql)
    {
        return sql.Replace("\"", "").ToLowerInvariant();
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
