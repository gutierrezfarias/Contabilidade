using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class AccountingObligationsTaxesPhase2Tests
{
    [Fact]
    public void Migration_extends_existing_tables_without_dropping_data()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260622_obligations_taxes_alerts_regularidade.sql"));

        Assert.Contains("alter table public.accounting_obligations", sql);
        Assert.Contains("alter table public.accounting_tax_records", sql);
        Assert.Contains("add column if not exists guide_document_id", sql);
        Assert.Contains("add column if not exists receipt_document_id", sql);
        Assert.DoesNotContain("drop table", sql);
        Assert.DoesNotContain("truncate table", sql);
    }

    [Fact]
    public void Migration_has_natural_uniqueness_and_alert_idempotency()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260622_obligations_taxes_alerts_regularidade.sql"));

        Assert.Contains("accounting_obligations_natural_unique_idx", sql);
        Assert.Contains("organization_id, client_id, lower(obligation_type), competence", sql);
        Assert.Contains("accounting_alert_events_idempotency_idx", sql);
        Assert.Contains("upsert_accounting_alert_event", sql);
    }

    [Fact]
    public void Migration_preserves_multi_tenant_rls_for_new_alert_tables()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260622_obligations_taxes_alerts_regularidade.sql"));

        Assert.Contains("alter table public.%i enable row level security", sql);
        Assert.Contains("public.accounting_can_access_org(organization_id)", sql);
        Assert.Contains("grant select, insert, update on public.accounting_alert_settings to authenticated", sql);
        Assert.Contains("grant select, insert, update on public.accounting_alert_events to authenticated", sql);
    }

    [Fact]
    public void Frontend_uses_real_supabase_crud_instead_of_local_mock()
    {
        var service = Normalize(ReadFile("src", "services", "accountingComplianceService.ts"));
        var page = Normalize(ReadFile("src", "pages", "accounting", "ObligationsTaxes.tsx"));

        Assert.Contains(".from('accounting_obligations')", service);
        Assert.Contains(".from('accounting_tax_records')", service);
        Assert.Contains("insert({ ...payload", service);
        Assert.Contains(".update(payload)", service);
        Assert.Contains("deleted_at", service);
        Assert.Contains("uploadcompliancedocument", page);
        Assert.DoesNotContain("mock", page);
    }

    [Fact]
    public void Portal_reads_linked_guide_and_receipt_documents()
    {
        var service = Normalize(ReadFile("src", "services", "accountingDocumentsService.ts"));
        var portal = Normalize(ReadFile("src", "pages", "portal", "ClientPortal.tsx"));

        Assert.Contains("guide_document_id", service);
        Assert.Contains("receipt_document_id", service);
        Assert.Contains("createaccountingdocumentsignedurlbyid", service);
        Assert.Contains("baixar guia", portal);
        Assert.Contains("baixar comprovante", portal);
    }

    private static string Normalize(string value)
    {
        return value.Replace("\"", "").ToLowerInvariant();
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
