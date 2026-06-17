using System.Text;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class DuplicatePreventionRulesTests
{
    [Fact]
    public void Manual_duplicate_same_csv_twice_has_same_hash()
    {
        AssertSameHash("cnpj;valor\n48013461000125;10,00");
    }

    [Fact]
    public void Manual_duplicate_same_json_twice_has_same_hash()
    {
        AssertSameHash("{\"cnpj\":\"48013461000125\",\"valor\":10}");
    }

    [Fact]
    public void Manual_duplicate_same_pdf_twice_has_same_hash()
    {
        AssertSameHash("%PDF-1.7\n48013461000125");
    }

    [Fact]
    public void Manual_duplicate_same_file_with_different_name_uses_content_hash()
    {
        var first = ManualRevenueImportRules.Sha256("conteudo fiscal"u8.ToArray());
        var renamed = ManualRevenueImportRules.Sha256("conteudo fiscal"u8.ToArray());

        Assert.Equal(first, renamed);
    }

    [Fact]
    public void Manual_duplicate_same_document_inside_different_zips_uses_internal_file_hash()
    {
        var internalFile = "DAS 01/2026 CNPJ 48.013.461/0001-25";

        Assert.Equal(
            ManualRevenueImportRules.Sha256(Encoding.UTF8.GetBytes(internalFile)),
            ManualRevenueImportRules.Sha256(Encoding.UTF8.GetBytes(internalFile)));
    }

    [Fact]
    public void Manual_logical_key_allows_same_document_in_different_organizations()
    {
        var first = LogicalKey("org-a", "client-1");
        var second = LogicalKey("org-b", "client-1");

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void Manual_logical_key_allows_same_document_for_different_clients()
    {
        var first = LogicalKey("org-a", "client-1");
        var second = LogicalKey("org-a", "client-2");

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void Manual_external_id_is_stable_when_protocol_returns_again()
    {
        var first = ManualRevenueImportRules.BuildExternalId("manual_ecac", "CND", "48.013.461/0001-25", "", "PROTO-123", "", "01/2026");
        var second = ManualRevenueImportRules.BuildExternalId("manual_ecac", "cnd", "48013461000125", "", "PROTO-123", "", "01/2026");

        Assert.Equal(first, second);
    }

    [Fact]
    public void Manual_external_id_is_empty_without_official_identifier()
    {
        var externalId = ManualRevenueImportRules.BuildExternalId("manual_ecac", "DAS", "48.013.461/0001-25", "", "", "1234", "01/2026");

        Assert.Empty(externalId);
    }

    [Fact]
    public void Automatic_same_idempotency_key_reuses_request_key()
    {
        var first = AutomaticKey("hash-1");
        var second = AutomaticKey("hash-1");

        Assert.Equal(first, second);
    }

    [Fact]
    public void Automatic_different_payload_hash_generates_different_key()
    {
        Assert.NotEqual(AutomaticKey("hash-1"), AutomaticKey("hash-2"));
    }

    [Fact]
    public void Automatic_operation_lock_key_matches_idempotency_scope()
    {
        var idempotency = SerproDomainRules.BuildRevenueRequestIdempotencyKey("org-1", "client-1", "cnd", "01/2026", "producao", "hash-1");
        var lockKey = SerproDomainRules.BuildOperationLockKey("org-1", "client-1", "cnd", "01/2026", "producao", "hash-1");

        Assert.Equal(idempotency, lockKey);
    }

    [Fact]
    public void Wallet_reserve_idempotency_key_is_stable()
    {
        var first = SerproDomainRules.BuildWalletTransactionIdempotencyKey("request-1", "reserve");
        var second = SerproDomainRules.BuildWalletTransactionIdempotencyKey("request-1", "reserve");

        Assert.Equal(first, second);
    }

    [Fact]
    public void Wallet_capture_and_reserve_do_not_share_key()
    {
        Assert.NotEqual(
            SerproDomainRules.BuildWalletTransactionIdempotencyKey("request-1", "reserve"),
            SerproDomainRules.BuildWalletTransactionIdempotencyKey("request-1", "capture"));
    }

    [Fact]
    public void Retry_after_timeout_keeps_same_operation_key()
    {
        Assert.Equal(AutomaticKey("same-timeout-payload"), AutomaticKey("same-timeout-payload"));
    }

    [Fact]
    public void Retry_after_error_keeps_same_operation_key()
    {
        Assert.Equal(AutomaticKey("same-error-payload"), AutomaticKey("same-error-payload"));
    }

    [Fact]
    public void Csv_injection_is_blocked_in_manual_import_rules()
    {
        Assert.True(ManualRevenueImportRules.IsCsvFormula("=IMPORTXML(\"http://example.com\")"));
    }

    [Fact]
    public void Zip_path_traversal_is_blocked_in_manual_import_rules()
    {
        Assert.True(ManualRevenueImportRules.HasPathTraversal("../evil.pdf"));
    }

    [Fact]
    public void Duplicate_prevention_migration_creates_required_unique_indexes()
    {
        var sql = ReadMigration();

        Assert.Contains("serpro_requests_idempotency_unique_idx", sql);
        Assert.Contains("serpro_documents_external_id_unique_idx", sql);
        Assert.Contains("serpro_documents_document_hash_unique_idx", sql);
        Assert.Contains("serpro_wallet_transactions_once_per_request_type_idx", sql);
    }

    [Fact]
    public void Duplicate_prevention_migration_creates_operation_lock_table()
    {
        var sql = ReadMigration();

        Assert.Contains("create table if not exists public.serpro_operation_locks", sql);
        Assert.Contains("serpro_operation_locks_active_key_unique_idx", sql);
    }

    private static void AssertSameHash(string content)
    {
        var first = ManualRevenueImportRules.Sha256(Encoding.UTF8.GetBytes(content));
        var second = ManualRevenueImportRules.Sha256(Encoding.UTF8.GetBytes(content));

        Assert.Equal(first, second);
    }

    private static string LogicalKey(string organizationId, string clientId)
    {
        return ManualRevenueImportRules.BuildLogicalKey(
            organizationId,
            clientId,
            "manual_ecac",
            "DAS",
            "01/2026",
            "2026-02-20",
            10,
            "",
            "48013461000125");
    }

    private static string AutomaticKey(string payloadHash)
    {
        return SerproDomainRules.BuildRevenueRequestIdempotencyKey(
            "org-1",
            "client-1",
            "integra-contador-cnd-cpend",
            "01/2026",
            "producao",
            payloadHash);
    }

    private static string ReadMigration()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(
                directory.FullName,
                "supabase",
                "migrations",
                "20260616_duplicate_prevention_serpro_revenue.sql");
            if (File.Exists(candidate))
            {
                return File.ReadAllText(candidate);
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException("Migration de prevencao de duplicidade nao encontrada.");
    }
}
