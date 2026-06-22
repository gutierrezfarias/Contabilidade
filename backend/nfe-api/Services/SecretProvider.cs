namespace ContHub.NfeApi.Services;

public interface ISecretProvider
{
    SecretLookupResult GetRequired(string name);
    SecretLookupResult GetOptional(string name);
}

public sealed record SecretLookupResult(string Name, bool Found, string Value)
{
    public static SecretLookupResult Missing(string name) => new(name, false, "");

    public static SecretLookupResult Present(string name, string value) => new(name, true, value);
}

public sealed class EnvironmentSecretProvider : ISecretProvider
{
    public SecretLookupResult GetRequired(string name)
    {
        var result = GetOptional(name);
        if (!result.Found)
        {
            throw new InvalidOperationException($"Segredo obrigatorio nao configurado: {name}.");
        }

        return result;
    }

    public SecretLookupResult GetOptional(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("O nome do segredo e obrigatorio.", nameof(name));
        }

        var value = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(value)
            ? SecretLookupResult.Missing(name)
            : SecretLookupResult.Present(name, value);
    }
}
