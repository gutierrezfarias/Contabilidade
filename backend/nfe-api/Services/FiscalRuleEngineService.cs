using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class FiscalRuleEngineService(
    SupabaseNfeRepository nfeRepository,
    SupabaseFiscalRepository fiscalRepository)
{
    public async Task<NfeTaxPreviewResult> PreviewAsync(
        NfeTaxPreviewRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.OrganizationId) || string.IsNullOrWhiteSpace(request.ClientId))
            {
                return Fail(Block("ORG_CLIENT_REQUIRED", "Informe organizacao e cliente.", "", "organizationId", "", "Selecione uma empresa/cliente valido."));
            }

            var userId = await nfeRepository.RequireUserAsync(authorizationHeader, cancellationToken);
            await nfeRepository.EnsureOrganizationAccessAsync(userId, request.OrganizationId, cancellationToken);
            var company = await nfeRepository.GetCompanyAsync(request.OrganizationId, request.ClientId, cancellationToken);
            var profile = await fiscalRepository.GetFiscalProfileAsync(request.OrganizationId, request.ClientId, cancellationToken);
            var products = await fiscalRepository.ListFiscalProductsAsync(request.OrganizationId, request.ClientId, cancellationToken);
            var rules = await fiscalRepository.ListRulesAsync(request.OrganizationId, request.ClientId, cancellationToken);

            var errors = new List<FiscalBlockError>();
            var warnings = new List<string>();
            errors.AddRange(ValidateProfile(profile, company));

            if (request.Itens.Count == 0)
            {
                errors.Add(Block("NFE_ITEM_REQUIRED", "Informe ao menos um item para calcular impostos.", "", "itens", "", "Adicione produto/servico na NF-e."));
            }

            var items = new List<NfeTaxPreviewItem>();
            foreach (var itemWithIndex in request.Itens.Select((item, index) => (item, index: index + 1)))
            {
                var preview = await PreviewItemAsync(
                    itemWithIndex.index,
                    itemWithIndex.item,
                    company,
                    profile,
                    request,
                    products,
                    rules,
                    userId,
                    cancellationToken);

                items.Add(preview);
                errors.AddRange(preview.BlockingErrors);
                warnings.AddRange(preview.Warnings);
            }

            var textErrors = errors
                .Select(error => error.Message)
                .Where(message => !string.IsNullOrWhiteSpace(message))
                .Distinct()
                .ToList();

            return new NfeTaxPreviewResult
            {
                AppliedRuleIds = items
                    .Select(item => item.AppliedRuleId)
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Distinct()
                    .ToList(),
                BlockingErrors = errors
                    .DistinctBy(error => $"{error.Code}|{error.ProductCode}|{error.Field}|{error.RuleId}")
                    .ToList(),
                Errors = textErrors,
                FiscalProfileId = profile?.Id ?? "",
                FiscalProfileStatus = profile?.ApprovalStatus ?? "Nao encontrado",
                Items = items,
                Message = errors.Count == 0
                    ? "Previa fiscal calculada com regras aprovadas."
                    : "Previa fiscal possui pendencias bloqueantes.",
                Status = errors.Count == 0 ? "Valida" : "Bloqueada",
                Success = errors.Count == 0,
                Warnings = warnings.Distinct().ToList()
            };
        }
        catch (UnauthorizedAccessException)
        {
            throw;
        }
        catch (Exception error)
        {
            return Fail(Block("FISCAL_ENGINE_ERROR", error.Message, "", "", "", "Revise a configuracao fiscal e tente novamente."));
        }
    }

    public async Task SaveBlockAuditAsync(
        EmitirNfeRequest request,
        string authorizationHeader,
        NfeTaxPreviewResult fiscalResult,
        string operation,
        string documentId,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = await nfeRepository.RequireUserAsync(authorizationHeader, cancellationToken);
            await fiscalRepository.SaveAuditAsync(
                new FiscalAuditWrite
                {
                    Action = "tentativa_emissao_bloqueada",
                    ClientId = request.ClientId,
                    CreatedBy = userId,
                    EntityId = documentId,
                    EntityType = "nfe_documents",
                    Metadata = new
                    {
                        operation,
                        fiscalResult.Status,
                        fiscalResult.Message,
                        blockingErrors = fiscalResult.BlockingErrors.Select(SafeBlockError).ToList()
                    },
                    NewData = new
                    {
                        request.Nota.NaturezaOperacao,
                        request.Nota.Serie,
                        request.Nota.Numero,
                        itemCount = request.Nota.Itens.Count
                    },
                    OrganizationId = request.OrganizationId,
                    Origin = "backend:nfe",
                    Reason = fiscalResult.Message
                },
                cancellationToken);
        }
        catch
        {
            // Auditoria nao deve mascarar o erro fiscal bloqueante retornado ao frontend.
        }
    }

    private async Task<NfeTaxPreviewItem> PreviewItemAsync(
        int index,
        NfeItem item,
        SupabaseCompany company,
        FiscalCompanyProfile? profile,
        NfeTaxPreviewRequest request,
        IReadOnlyList<FiscalProduct> products,
        IReadOnlyList<FiscalRule> rules,
        string userId,
        CancellationToken cancellationToken)
    {
        var errors = new List<FiscalBlockError>();
        var warnings = new List<string>();
        var product = ResolveProduct(item, products);
        errors.AddRange(ValidateItem(index, item, product));

        var candidates = rules
            .Select(rule => new RuleCandidate(
                Rule: rule,
                MatchRank: MatchRank(rule, item, product, company, profile, request),
                IsAllowed: RuleCanBeUsed(rule),
                IneligibilityReason: RuleIneligibilityReason(rule)))
            .Where(candidate => candidate.MatchRank is not null)
            .OrderBy(candidate => candidate.MatchRank)
            .ThenBy(candidate => candidate.Rule.Priority)
            .ThenByDescending(candidate => candidate.Rule.Version)
            .ToList();

        var eligible = candidates.Where(candidate => candidate.IsAllowed).ToList();
        if (eligible.Count == 0)
        {
            var reason = candidates.Count == 0
                ? "nenhuma regra fiscal encontrada para produto/NCM/grupo."
                : $"regra encontrada, mas nao pode ser usada: {string.Join(", ", candidates.Select(candidate => candidate.IneligibilityReason).Distinct())}.";
            errors.Add(Block(
                "FISCAL_RULE_MISSING",
                $"Item {index}: {reason}",
                item.Codigo,
                "fiscal_rules",
                candidates.FirstOrDefault()?.Rule.Id ?? "",
                "Crie/aprove uma regra fiscal vigente para este produto, NCM ou grupo."));

            return PreviewWithErrors(index, item, errors, warnings, product);
        }

        var selectedRank = eligible[0].MatchRank!.Value;
        var selectedPriority = eligible[0].Rule.Priority;
        var selectedTier = eligible
            .Where(candidate => candidate.MatchRank == selectedRank && candidate.Rule.Priority == selectedPriority)
            .ToList();

        if (selectedTier.Count > 1)
        {
            var selected = selectedTier[0].Rule;
            foreach (var conflict in selectedTier.Skip(1))
            {
                var reason = $"Conflito fiscal entre regras {selected.RuleCode} e {conflict.Rule.RuleCode} para item {index}.";
                var conflictKey = string.Join(
                    ":",
                    "fiscal-rule",
                    request.OrganizationId,
                    request.ClientId,
                    string.Compare(selected.Id, conflict.Rule.Id, StringComparison.Ordinal) <= 0 ? selected.Id : conflict.Rule.Id,
                    string.Compare(selected.Id, conflict.Rule.Id, StringComparison.Ordinal) <= 0 ? conflict.Rule.Id : selected.Id,
                    product?.Id ?? "",
                    NfeText.Digits(item.Ncm),
                    NfeText.Digits(item.Cest));

                await fiscalRepository.SaveFiscalConflictAsync(
                    new FiscalConflictWrite
                    {
                        Cest = item.Cest,
                        ClientId = request.ClientId,
                        ConflictKey = conflictKey,
                        ConflictingRuleId = conflict.Rule.Id,
                        CreatedBy = userId,
                        Ncm = item.Ncm,
                        OrganizationId = request.OrganizationId,
                        ProductCode = item.Codigo,
                        ProductId = product?.Id ?? "",
                        Reason = reason,
                        RuleId = selected.Id
                    },
                    cancellationToken);
            }

            errors.Add(Block(
                "FISCAL_RULE_CONFLICT",
                $"Item {index}: conflito entre regras fiscais. A emissao foi bloqueada ate resolver o conflito.",
                item.Codigo,
                "fiscal_rule_conflicts",
                selectedTier[0].Rule.Id,
                "Resolva ou ignore justificadamente o conflito antes de emitir."));

            return PreviewWithErrors(index, item, errors, warnings, product);
        }

        var selectedRule = eligible[0].Rule;
        errors.AddRange(ValidateRule(index, item, selectedRule));
        if (errors.Count > 0)
        {
            return PreviewWithErrors(index, item, errors, warnings, product, selectedRule);
        }

        var calculated = ApplyRule(CompleteItemFromProduct(item, product), selectedRule);
        return new NfeTaxPreviewItem
        {
            AppliedRuleCode = selectedRule.RuleCode,
            AppliedRuleId = selectedRule.Id,
            AppliedRuleVersion = selectedRule.Version,
            CalculatedItem = calculated,
            Errors = [],
            Index = index,
            Justification = $"Regra {selectedRule.RuleCode} aplicada por {MatchRankLabel(selectedRank)}.",
            OriginalItem = item,
            Warnings = warnings
        };
    }

    private static IEnumerable<FiscalBlockError> ValidateProfile(FiscalCompanyProfile? profile, SupabaseCompany company)
    {
        if (profile is null)
        {
            yield return Block("FISCAL_PROFILE_MISSING", "Perfil fiscal da empresa nao encontrado.", "", "fiscal_company_profiles", "", "Cadastre e aprove o perfil fiscal antes de emitir.");
            yield break;
        }

        if (!profile.Active)
        {
            yield return Block("FISCAL_PROFILE_INACTIVE", "Perfil fiscal da empresa esta inativo.", "", "active", profile.Id, "Ative o perfil fiscal.");
        }

        if (!profile.ApprovalStatus.Equals("Aprovado", StringComparison.OrdinalIgnoreCase))
        {
            yield return Block("FISCAL_PROFILE_NOT_APPROVED", "Perfil fiscal precisa estar Aprovado.", "", "approval_status", profile.Id, "Aprove formalmente o perfil fiscal.");
        }

        if (NfeText.Digits(company.Cnpj).Length != 14)
        {
            yield return Block("COMPANY_CNPJ_INVALID", "CNPJ da empresa emissora invalido.", "", "cnpj", profile.Id, "Corrija o CNPJ do cliente/empresa.");
        }

        if (string.IsNullOrWhiteSpace(profile.Crt))
        {
            yield return Block("FISCAL_PROFILE_CRT_REQUIRED", "CRT do perfil fiscal nao informado.", "", "crt", profile.Id, "Informe o CRT correto.");
        }

        if (string.IsNullOrWhiteSpace(profile.StateUf) || profile.StateUf.Length != 2)
        {
            yield return Block("FISCAL_PROFILE_UF_REQUIRED", "UF do perfil fiscal nao informada.", "", "state_uf", profile.Id, "Informe a UF da empresa.");
        }

        if (NfeText.Digits(profile.CityIbgeCode).Length != 7)
        {
            yield return Block("FISCAL_PROFILE_CITY_IBGE_REQUIRED", "Codigo IBGE municipal do perfil fiscal nao informado.", "", "city_ibge_code", profile.Id, "Preencha o codigo IBGE do municipio.");
        }
    }

    private static IEnumerable<FiscalBlockError> ValidateItem(int index, NfeItem item, FiscalProduct? product)
    {
        var productCode = string.IsNullOrWhiteSpace(item.Codigo) ? $"item-{index}" : item.Codigo;
        if (product is null)
        {
            yield return Block("FISCAL_PRODUCT_NOT_RESOLVED", $"Item {index}: produto fiscal nao resolvido.", productCode, "product_id", "", "Cadastre o produto fiscal e vincule por codigo interno, NCM/CEST ou grupo.");
        }
        else
        {
            if (!product.Active || product.FiscalStatus.Equals("Bloqueado", StringComparison.OrdinalIgnoreCase))
            {
                yield return Block("FISCAL_PRODUCT_INACTIVE", $"Item {index}: produto fiscal esta inativo ou bloqueado.", productCode, "active", product.Id, "Ative ou revise o cadastro fiscal do produto.");
            }

            if (!product.FiscalStatus.Equals("Completo", StringComparison.OrdinalIgnoreCase))
            {
                yield return Block("FISCAL_PRODUCT_INCOMPLETE", $"Item {index}: produto fiscal precisa estar Completo.", productCode, "fiscal_status", product.Id, "Complete o cadastro fiscal do produto.");
            }
        }

        if (string.IsNullOrWhiteSpace(item.Codigo) && string.IsNullOrWhiteSpace(product?.ProductCode))
        {
            yield return Block("PRODUCT_CODE_REQUIRED", $"Item {index}: codigo interno do produto nao informado.", productCode, "codigo", product?.Id ?? "", "Informe o codigo interno do produto.");
        }

        var ncm = NfeText.Digits(string.IsNullOrWhiteSpace(item.Ncm) ? product?.Ncm ?? "" : item.Ncm);
        if (ncm.Length != 8)
        {
            yield return Block("NCM_REQUIRED", $"Item {index}: NCM deve possuir 8 digitos.", productCode, "ncm", product?.Id ?? "", "Informe um NCM valido.");
        }

        if (string.IsNullOrWhiteSpace(item.Descricao) && string.IsNullOrWhiteSpace(product?.Description))
        {
            yield return Block("PRODUCT_DESCRIPTION_REQUIRED", $"Item {index}: descricao do produto nao informada.", productCode, "descricao", product?.Id ?? "", "Informe a descricao do produto.");
        }
    }

    private static IEnumerable<FiscalBlockError> ValidateRule(int index, NfeItem item, FiscalRule rule)
    {
        var productCode = string.IsNullOrWhiteSpace(item.Codigo) ? $"item-{index}" : item.Codigo;
        if (NfeText.Digits(rule.Cfop).Length != 4)
        {
            yield return Block("CFOP_REQUIRED", $"Item {index}: regra fiscal sem CFOP valido.", productCode, "cfop", rule.Id, "Informe o CFOP da regra.");
        }

        if (string.IsNullOrWhiteSpace(rule.IcmsCst) && string.IsNullOrWhiteSpace(rule.IcmsCsosn))
        {
            yield return Block("ICMS_CODE_REQUIRED", $"Item {index}: regra fiscal sem CST/CSOSN de ICMS.", productCode, "icms_cst", rule.Id, "Informe CST ou CSOSN compativel com o regime.");
        }

        if (!string.IsNullOrWhiteSpace(rule.IcmsCst) && !string.IsNullOrWhiteSpace(rule.IcmsCsosn))
        {
            yield return Block("ICMS_CODE_CONFLICT", $"Item {index}: regra fiscal possui CST e CSOSN ao mesmo tempo.", productCode, "icms_cst", rule.Id, "Mantenha apenas CST ou CSOSN conforme o CRT.");
        }

        if (string.IsNullOrWhiteSpace(rule.PisCst))
        {
            yield return Block("PIS_CST_REQUIRED", $"Item {index}: regra fiscal sem CST de PIS.", productCode, "pis_cst", rule.Id, "Informe CST de PIS.");
        }

        if (string.IsNullOrWhiteSpace(rule.CofinsCst))
        {
            yield return Block("COFINS_CST_REQUIRED", $"Item {index}: regra fiscal sem CST de COFINS.", productCode, "cofins_cst", rule.Id, "Informe CST de COFINS.");
        }

        if (RequiresRate(rule.PisCst) && rule.PisRate <= 0)
        {
            yield return Block("PIS_RATE_REQUIRED", $"Item {index}: CST de PIS exige aliquota.", productCode, "pis_rate", rule.Id, "Informe a aliquota de PIS.");
        }

        if (RequiresRate(rule.CofinsCst) && rule.CofinsRate <= 0)
        {
            yield return Block("COFINS_RATE_REQUIRED", $"Item {index}: CST de COFINS exige aliquota.", productCode, "cofins_rate", rule.Id, "Informe a aliquota de COFINS.");
        }

        if (rule.HasIcmsSt && (string.IsNullOrWhiteSpace(rule.Cest) || rule.MvaRate <= 0))
        {
            yield return Block("ICMS_ST_REQUIRED_FIELDS", $"Item {index}: ICMS-ST exige CEST e MVA.", productCode, "cest", rule.Id, "Informe CEST e MVA da regra.");
        }
    }

    private static FiscalProduct? ResolveProduct(NfeItem item, IReadOnlyList<FiscalProduct> products)
    {
        if (!string.IsNullOrWhiteSpace(item.ProductId))
        {
            var exact = products.FirstOrDefault(product => product.Id.Equals(item.ProductId, StringComparison.OrdinalIgnoreCase));
            if (exact is not null)
            {
                return exact;
            }
        }

        if (!string.IsNullOrWhiteSpace(item.Codigo))
        {
            var byCode = products.FirstOrDefault(product => product.ProductCode.Equals(item.Codigo.Trim(), StringComparison.OrdinalIgnoreCase));
            if (byCode is not null)
            {
                return byCode;
            }
        }

        var itemNcm = NfeText.Digits(item.Ncm);
        var itemCest = NfeText.Digits(item.Cest);
        if (itemNcm.Length == 8)
        {
            var byNcmCest = products
                .Where(product => NfeText.Digits(product.Ncm) == itemNcm && NfeText.Digits(product.Cest) == itemCest)
                .ToList();
            if (byNcmCest.Count == 1)
            {
                return byNcmCest[0];
            }

            var byNcm = products.Where(product => NfeText.Digits(product.Ncm) == itemNcm).ToList();
            if (byNcm.Count == 1)
            {
                return byNcm[0];
            }
        }

        return null;
    }

    private static int? MatchRank(
        FiscalRule rule,
        NfeItem item,
        FiscalProduct? product,
        SupabaseCompany company,
        FiscalCompanyProfile? profile,
        NfeTaxPreviewRequest request)
    {
        if (!MatchesCommon(rule, item, company, profile, request))
        {
            return null;
        }

        var itemNcm = NfeText.Digits(string.IsNullOrWhiteSpace(item.Ncm) ? product?.Ncm ?? "" : item.Ncm);
        var itemCest = NfeText.Digits(string.IsNullOrWhiteSpace(item.Cest) ? product?.Cest ?? "" : item.Cest);

        if (!string.IsNullOrWhiteSpace(rule.ProductId))
        {
            return product is not null && rule.ProductId.Equals(product.Id, StringComparison.OrdinalIgnoreCase)
                ? 0
                : null;
        }

        if (!string.IsNullOrWhiteSpace(rule.Ncm) && !string.IsNullOrWhiteSpace(rule.Cest))
        {
            return NfeText.Digits(rule.Ncm) == itemNcm && NfeText.Digits(rule.Cest) == itemCest ? 1 : null;
        }

        if (!string.IsNullOrWhiteSpace(rule.Ncm))
        {
            return NfeText.Digits(rule.Ncm) == itemNcm ? 2 : null;
        }

        if (!string.IsNullOrWhiteSpace(rule.GroupId))
        {
            var itemGroup = string.IsNullOrWhiteSpace(item.ProductGroupId) ? product?.GroupId ?? "" : item.ProductGroupId;
            return !string.IsNullOrWhiteSpace(itemGroup) && rule.GroupId.Equals(itemGroup, StringComparison.OrdinalIgnoreCase)
                ? 3
                : null;
        }

        return 4;
    }

    private static bool MatchesCommon(
        FiscalRule rule,
        NfeItem item,
        SupabaseCompany company,
        FiscalCompanyProfile? profile,
        NfeTaxPreviewRequest request)
    {
        var destinationUf = request.Destinatario.Uf.Trim().ToUpperInvariant();
        var taxRegime = profile?.TaxRegime ?? company.TaxRegime;

        return MatchesText(rule.Direction, request.Direction)
            && MatchesText(rule.TaxRegime, taxRegime)
            && MatchesText(rule.OriginUf, company.State)
            && MatchesText(rule.DestinationUf, destinationUf)
            && MatchesText(rule.NfePurpose, request.Finalidade)
            && MatchesText(rule.RecipientTaxpayerIndicator, request.Destinatario.IndicadorIe)
            && MatchesText(rule.MerchandiseOrigin, item.OrigemIcms)
            && MatchesFinalConsumer(rule, request);
    }

    private static bool MatchesFinalConsumer(FiscalRule rule, NfeTaxPreviewRequest request)
    {
        if (rule.FinalConsumer is null)
        {
            return true;
        }

        var value = NfeText.Digits(request.Destinatario.Documento).Length == 11
            || request.Destinatario.IndicadorIe == "9";
        return rule.FinalConsumer == value;
    }

    private static bool MatchesText(string expected, string actual)
    {
        if (string.IsNullOrWhiteSpace(expected))
        {
            return true;
        }

        return expected.Trim().Equals(actual.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static bool RuleCanBeUsed(FiscalRule rule)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return rule.Active
            && rule.ApprovalStatus.Equals("Aprovada", StringComparison.OrdinalIgnoreCase)
            && rule.StartDate <= today
            && (rule.EndDate is null || rule.EndDate >= today);
    }

    private static string RuleIneligibilityReason(FiscalRule rule)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!rule.Active) return $"{rule.RuleCode} inativa";
        if (!rule.ApprovalStatus.Equals("Aprovada", StringComparison.OrdinalIgnoreCase)) return $"{rule.RuleCode} nao aprovada";
        if (rule.StartDate > today) return $"{rule.RuleCode} fora da vigencia inicial";
        if (rule.EndDate is not null && rule.EndDate < today) return $"{rule.RuleCode} vencida";
        return $"{rule.RuleCode} indisponivel";
    }

    private static NfeTaxPreviewItem PreviewWithErrors(
        int index,
        NfeItem item,
        List<FiscalBlockError> errors,
        List<string> warnings,
        FiscalProduct? product,
        FiscalRule? rule = null) => new()
        {
            AppliedRuleCode = rule?.RuleCode ?? "",
            AppliedRuleId = rule?.Id ?? "",
            AppliedRuleVersion = rule?.Version ?? 0,
            BlockingErrors = errors,
            CalculatedItem = CompleteItemFromProduct(item, product),
            Errors = errors.Select(error => error.Message).Distinct().ToList(),
            Index = index,
            Justification = errors.Count == 0 ? "Sem pendencias." : "Item bloqueado por pendencia fiscal.",
            OriginalItem = item,
            Warnings = warnings
        };

    private static NfeItem CompleteItemFromProduct(NfeItem item, FiscalProduct? product)
    {
        if (product is null)
        {
            return item;
        }

        return item with
        {
            Cest = string.IsNullOrWhiteSpace(item.Cest) ? product.Cest : item.Cest,
            Codigo = string.IsNullOrWhiteSpace(item.Codigo) ? product.ProductCode : item.Codigo,
            Descricao = string.IsNullOrWhiteSpace(item.Descricao) ? product.Description : item.Descricao,
            Ncm = string.IsNullOrWhiteSpace(item.Ncm) ? product.Ncm : item.Ncm,
            OrigemIcms = string.IsNullOrWhiteSpace(item.OrigemIcms) ? product.MerchandiseOrigin : item.OrigemIcms,
            ProductGroupId = string.IsNullOrWhiteSpace(item.ProductGroupId) ? product.GroupId : item.ProductGroupId,
            ProductId = string.IsNullOrWhiteSpace(item.ProductId) ? product.Id : item.ProductId,
            Unidade = string.IsNullOrWhiteSpace(item.Unidade) ? product.CommercialUnit : item.Unidade
        };
    }

    private static NfeItem ApplyRule(NfeItem item, FiscalRule rule)
    {
        var productTotal = item.ValorTotal > 0 ? item.ValorTotal : item.Quantidade * item.ValorUnitario;
        var icmsBase = Math.Max(0, productTotal - productTotal * rule.IcmsBaseReduction / 100);
        var icmsValue = icmsBase * rule.IcmsRate / 100;
        var pisBase = productTotal;
        var pisValue = pisBase * rule.PisRate / 100;
        var cofinsBase = productTotal;
        var cofinsValue = cofinsBase * rule.CofinsRate / 100;
        var ipiBase = productTotal;
        var ipiValue = ipiBase * rule.IpiRate / 100;

        return item with
        {
            AliquotaCofins = rule.CofinsRate,
            AliquotaIcms = rule.IcmsRate,
            AliquotaIpi = rule.IpiRate,
            AliquotaPis = rule.PisRate,
            Cest = string.IsNullOrWhiteSpace(rule.Cest) ? item.Cest : rule.Cest,
            Cfop = rule.Cfop,
            Csosn = rule.IcmsCsosn,
            CstCofins = rule.CofinsCst,
            CstIcms = rule.IcmsCsosn.Length > 0 ? "" : rule.IcmsCst,
            CstIpi = string.IsNullOrWhiteSpace(rule.IpiCst) ? item.CstIpi : rule.IpiCst,
            CstPis = rule.PisCst,
            InformacoesAdicionais = AppendBenefit(item.InformacoesAdicionais, rule.FiscalBenefitCode),
            Ncm = string.IsNullOrWhiteSpace(rule.Ncm) ? item.Ncm : rule.Ncm,
            OrigemIcms = string.IsNullOrWhiteSpace(rule.MerchandiseOrigin) ? item.OrigemIcms : rule.MerchandiseOrigin,
            ValorBaseCofins = cofinsBase,
            ValorBaseIcms = icmsBase,
            ValorBaseIpi = rule.IpiRate > 0 ? ipiBase : item.ValorBaseIpi,
            ValorBasePis = pisBase,
            ValorCofins = cofinsValue,
            ValorIcms = icmsValue,
            ValorIpi = ipiValue,
            ValorPis = pisValue
        };
    }

    private static string AppendBenefit(string current, string benefit)
    {
        if (string.IsNullOrWhiteSpace(benefit))
        {
            return current;
        }

        var note = $"Beneficio fiscal: {benefit.Trim()}";
        return string.IsNullOrWhiteSpace(current) ? note : $"{current.Trim()} | {note}";
    }

    private static bool RequiresRate(string cst)
    {
        var normalized = NfeText.Digits(cst);
        return normalized is "01" or "02";
    }

    private static string MatchRankLabel(int rank) => rank switch
    {
        0 => "produto",
        1 => "NCM+CEST",
        2 => "NCM",
        3 => "grupo",
        _ => "regra geral"
    };

    private static object SafeBlockError(FiscalBlockError error) => new
    {
        error.Code,
        error.Message,
        error.ProductCode,
        error.Field,
        error.RuleId,
        error.Action
    };

    private static FiscalBlockError Block(string code, string message, string productCode, string field, string ruleId, string action) => new()
    {
        Action = action,
        Code = code,
        Field = field,
        Message = message,
        ProductCode = productCode,
        RuleId = ruleId
    };

    private static NfeTaxPreviewResult Fail(FiscalBlockError error) => new()
    {
        BlockingErrors = [error],
        Errors = [error.Message],
        Message = error.Message,
        Status = "Erro",
        Success = false
    };

    private sealed record RuleCandidate(
        FiscalRule Rule,
        int? MatchRank,
        bool IsAllowed,
        string IneligibilityReason);
}
