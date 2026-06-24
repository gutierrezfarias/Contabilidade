using System.IO.Compression;
using System.Text;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class FiscalReadinessNcmEnrichmentTests
{
    [Fact]
    public void Migration_adds_normalized_ncm_search_fields_and_idempotent_indexes()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260623_fiscal_readiness_ncm_enrichment.sql"));

        Assert.Contains("add column if not exists normalized_code", sql);
        Assert.Contains("add column if not exists description_search", sql);
        Assert.Contains("ncm_catalog_normalized_code_uidx", sql);
        Assert.Contains("ncm_catalog_description_search_idx", sql);
        Assert.Contains("create trigger normalize_ncm_catalog_fields_trigger", sql);
        Assert.DoesNotContain("drop table", sql);
        Assert.DoesNotContain("truncate table", sql);
    }

    [Fact]
    public void Migration_seeds_known_ncm_and_tracks_sync_metadata()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260623_fiscal_readiness_ncm_enrichment.sql"));

        Assert.Contains("0102.39.11", sql);
        Assert.Contains("01023911", sql);
        Assert.Contains("prenhes ou com cria ao pe", sql);
        Assert.Contains("add column if not exists rejected_codes", sql);
        Assert.Contains("add column if not exists source_version", sql);
        Assert.Contains("add column if not exists duration_ms", sql);
        Assert.Contains("ncm_sync_jobs_single_running_idx", sql);
    }

    [Fact]
    public void Migration_keeps_fiscal_field_sources_audited_and_rls_protected()
    {
        var sql = Normalize(ReadFile("supabase", "migrations", "20260623_fiscal_readiness_ncm_enrichment.sql"));

        Assert.Contains("create table if not exists public.fiscal_field_sources", sql);
        Assert.Contains("alter table public.fiscal_field_sources enable row level security", sql);
        Assert.Contains("public.is_org_member(organization_id)", sql);
        Assert.Contains("unique (organization_id, client_id, field_name, source)", sql);
        Assert.Contains("grant select, insert, update on public.fiscal_field_sources to authenticated", sql);
    }

    [Fact]
    public void Backend_ncm_search_uses_normalized_code_and_description_search()
    {
        var repository = Normalize(ReadFile("backend", "nfe-api", "Services", "SupabaseFiscalRepository.cs"));

        Assert.Contains("normalized_code.ilike", repository);
        Assert.Contains("description_search.ilike", repository);
        Assert.Contains("normalized_code=eq", repository);
        Assert.Contains("on_conflict=normalized_code", repository);
        Assert.Contains("ncmsearchscore", repository);
    }

    [Fact]
    public void Backend_ncm_sync_deduplicates_by_normalized_code_and_reports_rejections()
    {
        var service = Normalize(ReadFile("backend", "nfe-api", "Services", "NcmCatalogService.cs"));
        var models = Normalize(ReadFile("backend", "nfe-api", "Models", "FiscalModels.cs"));

        Assert.Contains("groupby(item => item.normalizedcode", service);
        Assert.Contains("sourceversion", service);
        Assert.Contains("rejectedcodes", service);
        Assert.Contains("durationms", service);
        Assert.Contains("public int rejectedcodes", models);
        Assert.Contains("public string normalizedcode", models);
    }

    [Fact]
    public void Frontend_exposes_readiness_timeline_and_ncm_autocomplete()
    {
        var fiscalModule = Normalize(ReadFile("src", "pages", "accounting", "FiscalModule.tsx"));
        var productsPanel = Normalize(ReadFile("src", "components", "fiscal", "FiscalProductsPanel.tsx"));
        var readinessService = Normalize(ReadFile("src", "services", "fiscalReadinessService.ts"));
        var readinessTimeline = Normalize(ReadFile("src", "components", "fiscal", "FiscalReadinessTimeline.tsx"));

        Assert.Contains("fiscalreadinesstimeline", fiscalModule);
        Assert.Contains("consultfiscalclientenrichment", fiscalModule);
        Assert.Contains("recordfiscalfieldsources", fiscalModule);
        Assert.Contains("ncmautocomplete", productsPanel);
        Assert.Contains("searchncmcatalog", productsPanel);
        Assert.Contains("jornada fiscal", readinessTimeline);
        Assert.Contains("simulacao fiscal", readinessService);
    }

    [Fact]
    public void Xlsx_parser_preserves_initial_zero_for_known_ncm()
    {
        var bytes = CreateMinimalXlsx(
            ["Codigo", "Descricao", "Data_Inicio"],
            ["0102.39.11", "Prenhes ou com cria ao pe", "01/01/2026"]);

        var items = NcmXlsxParser.Parse(bytes, "Tabela_NCM_Vigente_20260622.xlsx", DateTimeOffset.UtcNow);
        var item = Assert.Single(items);

        Assert.Equal("01023911", item.NormalizedCode);
        Assert.Equal("0102.39.11", item.FormattedCode);
        Assert.Equal("Prenhes ou com cria ao pe", item.Description);
    }

    [Fact]
    public void Xlsx_parser_accepts_numeric_cell_that_lost_the_first_zero_only_as_controlled_fallback()
    {
        var bytes = CreateMinimalXlsx(
            ["Codigo", "Descricao"],
            ["1023911", "Prenhes ou com cria ao pe"]);

        var item = Assert.Single(NcmXlsxParser.Parse(bytes, "ncm.xlsx", DateTimeOffset.UtcNow));

        Assert.Equal("01023911", item.NormalizedCode);
    }

    [Fact]
    public void Xlsx_parser_rejects_html_or_json_renamed_as_xlsx()
    {
        Assert.False(NcmXlsxParser.HasZipSignature("<html></html>"u8.ToArray()));
        Assert.True(NcmXlsxParser.LooksLikeHtml("<!doctype html><html></html>"u8.ToArray()));
        Assert.True(NcmXlsxParser.LooksLikeJson("{\"detail\":\"Unsupported content type\"}"u8.ToArray()));

        Assert.Throws<NcmCatalogImportException>(() =>
            NcmXlsxParser.Parse("{\"detail\":\"Unsupported content type\"}"u8.ToArray(), "ncm.xlsx", DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Backend_and_proxy_define_dedicated_multipart_ncm_import_contract()
    {
        var program = Normalize(ReadFile("backend", "nfe-api", "Program.cs"));
        var proxy = Normalize(ReadFile("api", "_utils", "nfeBackendProxy.ts"));
        var route = Normalize(ReadFile("api", "reference-data", "ncm", "[action].ts"));
        var frontendService = Normalize(ReadFile("src", "services", "fiscalBackendService.ts"));

        Assert.Contains("/api/reference-data/ncm/import-file", program);
        Assert.Contains("hasformcontenttype", program);
        Assert.Contains("readformasync", program);
        Assert.Contains("ncm_multipart_required", program);
        Assert.Contains("proxymultipartbackend", proxy);
        Assert.Contains("readrawbody", proxy);
        Assert.Contains("content-type': contenttype", proxy);
        Assert.Contains("bodyparser: false", route);
        Assert.Contains("new formdata", frontendService);
        Assert.DoesNotContain("'content-type': 'multipart/form-data'", frontendService);
    }

    [Fact]
    public void Backend_ncm_import_rejects_unauthenticated_requests_before_content_type_validation()
    {
        var program = Normalize(ReadFile("backend", "nfe-api", "Program.cs"));

        Assert.Contains("path.equals(/api/reference-data/ncm/import-file", program);
        Assert.Contains("headers.authorization.tostring()", program);
        Assert.Contains("statuscodes.status401unauthorized", program);
        Assert.DoesNotContain(".accepts<iformfile>(multipart/form-data)", program);
    }

    [Fact]
    public void Backend_ncm_sync_and_import_require_platform_admin_before_global_catalog_writes()
    {
        var program = Normalize(ReadFile("backend", "nfe-api", "Program.cs"));
        var nfeRepository = Normalize(ReadFile("backend", "nfe-api", "Services", "SupabaseNfeRepository.cs"));
        var forbiddenException = Normalize(ReadFile("backend", "nfe-api", "Services", "ForbiddenAccessException.cs"));

        Assert.Contains("ensureplatformadminasync(userid", program);
        Assert.Contains("statuscodes.status403forbidden", program);
        Assert.Contains("public async task ensureplatformadminasync", nfeRepository);
        Assert.Contains("user_roles?select=role", nfeRepository);
        Assert.Contains("forbiddenaccessexception", forbiddenException);
    }

    [Fact]
    public void Backend_standardizes_ncm_content_type_errors()
    {
        var service = Normalize(ReadFile("backend", "nfe-api", "Services", "NcmCatalogService.cs"));

        Assert.Contains("ncm_source_content_type_not_supported", service);
        Assert.Contains("ncm_file_type_not_supported", service);
        Assert.Contains("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", service);
        Assert.Contains("application/octet-stream", service);
        Assert.Contains("ncm_file_signature_invalid", service);
        Assert.Contains("ncm_source_html_unexpected", service);
    }

    [Fact]
    public void Google_business_api_uses_explicit_supabase_database_types_for_vercel_build()
    {
        var googleBusiness = Normalize(ReadFile("api", "google-business.ts"));

        Assert.Contains("type googlebusinessdatabase", googleBusiness);
        Assert.Contains("type googlesupabaseclient", googleBusiness);
        Assert.Contains("createclient<googlebusinessdatabase>", googleBusiness);
        Assert.DoesNotContain("returntype<typeof createclient>", googleBusiness);
        Assert.DoesNotContain("@ts-ignore", googleBusiness);
        Assert.DoesNotContain("@ts-nocheck", googleBusiness);
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

    private static byte[] CreateMinimalXlsx(string[] header, string[] row)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            AddEntry(archive, "[Content_Types].xml", """
                <?xml version="1.0" encoding="UTF-8"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                </Types>
                """);
            AddEntry(archive, "xl/workbook.xml", """
                <?xml version="1.0" encoding="UTF-8"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheets><sheet name="NCM" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>
                </workbook>
                """);
            AddEntry(archive, "xl/worksheets/sheet1.xml", $"""
                <?xml version="1.0" encoding="UTF-8"?>
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheetData>
                    {RowXml(1, header)}
                    {RowXml(2, row)}
                  </sheetData>
                </worksheet>
                """);
        }

        return stream.ToArray();
    }

    private static string RowXml(int rowIndex, IReadOnlyList<string> values)
    {
        var cells = values.Select((value, index) =>
            $"""<c r="{ColumnName(index)}{rowIndex}" t="inlineStr"><is><t>{System.Security.SecurityElement.Escape(value)}</t></is></c>""");
        return $"""<row r="{rowIndex}">{string.Concat(cells)}</row>""";
    }

    private static string ColumnName(int zeroBasedIndex)
    {
        var index = zeroBasedIndex + 1;
        var name = "";
        while (index > 0)
        {
            var modulo = (index - 1) % 26;
            name = (char)('A' + modulo) + name;
            index = (index - modulo) / 26;
        }

        return name;
    }

    private static void AddEntry(ZipArchive archive, string name, string content)
    {
        var entry = archive.CreateEntry(name);
        using var writer = new StreamWriter(entry.Open(), Encoding.UTF8);
        writer.Write(content);
    }
}
