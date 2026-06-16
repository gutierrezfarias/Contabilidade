using System.Net;
using System.Text;
using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class SupabaseDfeRepositoryLockTests
{
    [Fact]
    public async Task AcquireLockAsync_blocks_when_state_is_in_cooldown_without_calling_sefaz()
    {
        ConfigureSupabaseEnv();
        var handler = new RecordingHandler(_ => Task.FromResult(Json("[]")));
        var repository = Repository(handler);
        var state = State() with
        {
            LastStatusCode = "656",
            NextAllowedSyncAt = DateTimeOffset.UtcNow.AddMinutes(30)
        };

        var error = await Assert.ThrowsAsync<DfeSyncCooldownException>(() =>
            repository.AcquireLockAsync(state, "lock-1", CancellationToken.None));

        Assert.Equal("DFE_SYNC_COOLDOWN", error.Code);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task AcquireLockAsync_blocks_other_running_sync_for_same_cnpj_and_environment()
    {
        ConfigureSupabaseEnv();
        var handler = new RecordingHandler(request =>
        {
            if (request.Method == HttpMethod.Get)
            {
                return Task.FromResult(Json($"[{StateJson("state-2")}]"));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);

        var error = await Assert.ThrowsAsync<DfeSyncAlreadyRunningException>(() =>
            repository.AcquireLockAsync(State(), "lock-1", CancellationToken.None));

        Assert.Equal("DFE_SYNC_ALREADY_RUNNING", error.Code);
        Assert.DoesNotContain(handler.Requests, item => item.Method == HttpMethod.Patch);
    }

    [Fact]
    public async Task AcquireLockAsync_sets_running_when_no_cooldown_or_active_lock_exists()
    {
        ConfigureSupabaseEnv();
        var handler = new RecordingHandler(request =>
        {
            if (request.Method == HttpMethod.Get)
            {
                return Task.FromResult(Json("[]"));
            }

            return Task.FromResult(Empty(HttpStatusCode.NoContent));
        });
        var repository = Repository(handler);

        await repository.AcquireLockAsync(State(), "lock-1", CancellationToken.None);

        Assert.Contains(handler.Requests, item => item.Method == HttpMethod.Patch);
    }

    private static DfeSyncState State() => new()
    {
        CertificateId = "cert-1",
        ClientId = "client-1",
        Cnpj = "48013461000125",
        Environment = "producao",
        Id = "state-1",
        LastNsu = "000000000001219",
        MaxNsu = "000000000001500",
        OrganizationId = "org-1",
        Status = "idle"
    };

    private static string StateJson(string id) =>
        $$"""
        {
          "id":"{{id}}",
          "organization_id":"org-1",
          "client_id":"client-2",
          "certificate_id":"cert-2",
          "cnpj":"48013461000125",
          "environment":"producao",
          "last_nsu":"000000000001219",
          "max_nsu":"000000000001500",
          "status":"running",
          "locked_at":"{{DateTimeOffset.UtcNow:O}}"
        }
        """;

    private static SupabaseDfeRepository Repository(RecordingHandler handler) =>
        new(new StaticHttpClientFactory(new HttpClient(handler)));

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static HttpResponseMessage Empty(HttpStatusCode status) => new(status);

    private static void ConfigureSupabaseEnv()
    {
        Environment.SetEnvironmentVariable("SUPABASE_URL", "https://unit-test.supabase.co");
        Environment.SetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-key");
    }

    private sealed record CapturedRequest(HttpMethod Method, Uri Uri);

    private sealed class RecordingHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> responder)
        : HttpMessageHandler
    {
        public List<CapturedRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Requests.Add(new CapturedRequest(request.Method, request.RequestUri!));
            return await responder(request);
        }
    }

    private sealed class StaticHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }
}
