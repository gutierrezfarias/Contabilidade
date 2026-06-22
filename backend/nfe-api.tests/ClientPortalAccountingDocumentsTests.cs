using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class ClientPortalAccountingDocumentsTests
{
    [Fact]
    public void Migration_creates_client_portal_tables_and_access_functions()
    {
        var sql = NormalizeSql(ReadMigration());

        Assert.Contains("create table if not exists public.client_portal_users", sql);
        Assert.Contains("create table if not exists public.client_portal_invites", sql);
        Assert.Contains("create table if not exists public.client_portal_access_logs", sql);
        Assert.Contains("create or replace function public.client_portal_can_access", sql);
        Assert.Contains("create or replace function public.claim_client_portal_access", sql);
        Assert.Contains("create or replace function public.upsert_client_portal_user", sql);
    }

    [Fact]
    public void Portal_access_is_scoped_by_organization_and_client()
    {
        var sql = NormalizeSql(ReadMigration());

        Assert.Contains("cpu.organization_id = target_org", sql);
        Assert.Contains("cpu.client_id = target_client", sql);
        Assert.Contains("cpu.status = 'active'", sql);
        Assert.Contains("cpu.deleted_at is null", sql);
        Assert.Contains("public.client_portal_can_access(organization_id, client_id)", sql);
    }

    [Fact]
    public void Accounting_documents_are_extended_without_recreating_table()
    {
        var sql = NormalizeSql(ReadMigration());

        Assert.Contains("alter table public.accounting_documents", sql);
        Assert.Contains("add column if not exists category", sql);
        Assert.Contains("add column if not exists approval_status", sql);
        Assert.Contains("add column if not exists version_number", sql);
        Assert.Contains("add column if not exists replaced_by_document_id", sql);
        Assert.DoesNotContain("drop table public.accounting_documents", sql);
    }

    [Fact]
    public void Private_storage_bucket_and_policies_are_declared()
    {
        var sql = NormalizeSql(ReadMigration());

        Assert.Contains("'accounting-documents'", sql);
        Assert.Contains("false", sql);
        Assert.Contains("create policy accounting_documents_storage_read", sql);
        Assert.Contains("create policy accounting_documents_storage_insert", sql);
        Assert.Contains("bucket_id = 'accounting-documents'", sql);
    }

    [Fact]
    public void Portal_can_only_select_existing_business_records()
    {
        var sql = NormalizeSql(ReadMigration());

        Assert.Contains("create policy accounting documents portal read own client", sql);
        Assert.Contains("create policy accounting tax records portal read own client", sql);
        Assert.Contains("create policy accounting obligations portal read own client", sql);
        Assert.Contains("create policy nfe documents portal read own client", sql);
        Assert.DoesNotContain("for all using (public.client_portal_can_access", sql);
    }

    [Fact]
    public void Frontend_blocks_dangerous_document_uploads()
    {
        var source = NormalizeSql(ReadFile("src", "utils", "accountingDocumentSecurity.ts"));

        Assert.Contains("'exe'", source);
        Assert.Contains("'ps1'", source);
        Assert.Contains("'xlsm'", source);
        Assert.Contains("haspathtraversal", source);
        Assert.Contains("accounting_document_max_size_bytes", source);
    }

    private static string ReadMigration()
    {
        return ReadFile("supabase", "migrations", "20260622_client_portal_and_accounting_documents.sql");
    }

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
