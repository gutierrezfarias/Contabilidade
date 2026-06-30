using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class RevenueFederalPlanExperienceTests
{
    [Fact]
    public void Migration_creates_plan_and_local_agent_structures_with_rls()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260629_revenue_federal_plan_experience.sql"));

        Assert.Contains("create table if not exists public.serpro_contract_plans", sql);
        Assert.Contains("create table if not exists public.serpro_local_agents", sql);
        Assert.Contains("alter table public.serpro_contract_plans enable row level security", sql);
        Assert.Contains("alter table public.serpro_local_agents enable row level security", sql);
        Assert.Contains("public.serpro_can_access_org(organization_id)", sql);
        Assert.Contains("revoke all privileges on table public.serpro_local_agents from anon", sql);
        Assert.Contains("grant select on table public.serpro_local_agents to authenticated", sql);
    }

    [Fact]
    public void Migration_seeds_configurable_plans_and_preserves_manual_import()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260629_revenue_federal_plan_experience.sql"));

        Assert.Contains("cont_hub_full", sql);
        Assert.Contains("cont_hub_local_agent", sql);
        Assert.Contains("serpro_direct", sql);
        Assert.Contains("manual_free", sql);
        Assert.Contains("on conflict (code) do nothing", sql);
    }

    [Fact]
    public void Pairing_key_is_hashed_and_not_persisted_as_plain_text()
    {
        var repository = ReadFile("backend", "nfe-api", "Services", "SupabaseSerproRepository.cs");
        var sql = Normalize(ReadFile("supabase", "migrations", "20260629_revenue_federal_plan_experience.sql"));

        Assert.Contains("SerproSecretProtector.Fingerprint(pairingKey", repository);
        Assert.Contains("pairing_key_hash", sql);
        Assert.DoesNotContain("pairing_key_plain", sql);
        Assert.DoesNotContain("pairing_key_value", sql);
    }

    [Fact]
    public void Frontend_has_six_guided_tabs_and_keeps_manual_import_security_flow()
    {
        var tabs = ReadFile("src", "components", "revenue-federal", "ReceitaFederalTabs.tsx");
        var manual = ReadFile("src", "components", "revenue-federal", "ManualImportPanel.tsx");

        Assert.Contains("Plano e contrato", tabs);
        Assert.Contains("Credenciais e acesso", tabs);
        Assert.Contains("Servicos", tabs);
        Assert.Contains("Importacao manual", tabs);
        Assert.Contains("Autorizacoes", tabs);
        Assert.Contains("Consumo e auditoria", tabs);
        Assert.Contains("previewManualRevenueImport", manual);
        Assert.Contains("confirmManualRevenueImport", manual);
    }

    [Fact]
    public void Frontend_does_not_use_typescript_suppression_or_any_in_new_module()
    {
        var files = Directory.GetFiles(
            FindDirectory("src", "components", "revenue-federal"),
            "*.tsx",
            SearchOption.TopDirectoryOnly);

        foreach (var file in files)
        {
            var content = File.ReadAllText(file);
            Assert.DoesNotContain("@ts-ignore", content);
            Assert.DoesNotContain("@ts-nocheck", content);
            Assert.DoesNotContain(": any", content);
        }
    }

    private static string Normalize(string value) => value.Replace("\r", "").ToLowerInvariant();

    private static string ReadFile(params string[] segments) => File.ReadAllText(FindFile(segments));

    private static string FindDirectory(params string[] segments)
    {
        var path = FindPath(segments);
        if (!Directory.Exists(path)) throw new DirectoryNotFoundException(path);
        return path;
    }

    private static string FindFile(params string[] segments)
    {
        var path = FindPath(segments);
        if (!File.Exists(path)) throw new FileNotFoundException(path);
        return path;
    }

    private static string FindPath(params string[] segments)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(new[] { directory.FullName }.Concat(segments).ToArray());
            if (File.Exists(candidate) || Directory.Exists(candidate)) return candidate;
            directory = directory.Parent;
        }

        throw new FileNotFoundException(Path.Combine(segments));
    }
}
