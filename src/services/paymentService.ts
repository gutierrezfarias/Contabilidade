import type { AuthUser } from '../types/auth'
import type { AppSubscription, PaymentMethod } from '../types/payments'
import { applications, getApplication } from './appCatalog'
import { resolveOrganizationId } from './platformService'
import { supabase } from './supabase'

const SUBSCRIPTIONS_KEY = 'aurora-pessoal:subscriptions'

const wait = (milliseconds = 700) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function getStoredSubscriptions(): AppSubscription[] {
  const storedSubscriptions = window.localStorage.getItem(SUBSCRIPTIONS_KEY)

  if (!storedSubscriptions) {
    return []
  }

  try {
    return JSON.parse(storedSubscriptions) as AppSubscription[]
  } catch {
    window.localStorage.removeItem(SUBSCRIPTIONS_KEY)
    return []
  }
}

function saveSubscriptions(subscriptions: AppSubscription[]) {
  window.localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions))
}

function parsePrice(value?: string) {
  return Number((value ?? '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
}

function expandBundleAccess(applicationIds: string[]) {
  return Array.from(
    new Set(
      applicationIds.flatMap((applicationId) => [
        applicationId,
        ...(getApplication(applicationId)?.includedApplicationIds ?? []),
      ]),
    ),
  )
}

async function applyReferralReward(
  buyerOrganizationId: string,
  applicationId: string,
  applicationName: string,
  rewardAmount: number,
) {
  await supabase.rpc('grant_referral_reward', {
    buyer_organization_id: buyerOrganizationId,
    target_application_id: applicationId,
    target_application_name: applicationName,
    target_reward_amount: rewardAmount,
  })
}

export const paymentService = {
  getActiveApplicationIds(customerId: string): string[] {
    const activeSubscriptionIds = getStoredSubscriptions()
      .filter(
        (subscription) =>
          subscription.customerId === customerId && subscription.status === 'active',
      )
      .map((subscription) => subscription.applicationId)

    return expandBundleAccess(activeSubscriptionIds)
  },

  async getActiveApplicationIdsFromSupabase(customerId: string): Promise<string[]> {
    const organizationId = await resolveOrganizationId()
    if (!organizationId) {
      return this.getActiveApplicationIds(customerId)
    }

    const [profileResult, subscriptionsResult] = await Promise.all([
      supabase
        .from('admin_client_profiles')
        .select('subscription_exempt')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('organization_app_subscriptions')
        .select('application_id, status, subscription_exempt, exemption_until')
        .eq('organization_id', organizationId),
    ])

    if (profileResult.data?.subscription_exempt) {
      return applications
        .filter(
          (application) =>
            application.status !== 'coming-soon' && application.displayInCatalog !== false,
        )
        .map((application) => application.id)
    }

    if (subscriptionsResult.error) {
      return this.getActiveApplicationIds(customerId)
    }

    const supabaseAccess = (subscriptionsResult.data ?? [])
      .filter(
        (subscription) =>
          (subscription.subscription_exempt &&
            (!subscription.exemption_until ||
              String(subscription.exemption_until) >= new Date().toISOString().slice(0, 10))) ||
          subscription.status === 'ativo' ||
          subscription.status === 'teste',
      )
      .map((subscription) => String(subscription.application_id))

    return expandBundleAccess([...this.getActiveApplicationIds(customerId), ...supabaseAccess])
  },

  async hasActiveAccessFromSupabase(customerId: string, applicationId: string): Promise<boolean> {
    return (await this.getActiveApplicationIdsFromSupabase(customerId)).includes(applicationId)
  },

  hasActiveAccess(customerId: string, applicationId: string): boolean {
    return this.getActiveApplicationIds(customerId).includes(applicationId)
  },

  async purchase(
    applicationId: string,
    paymentMethod: PaymentMethod,
    customer: AuthUser,
  ): Promise<AppSubscription> {
    await wait()
    const subscriptions = getStoredSubscriptions()
    const existingSubscription = subscriptions.find(
      (subscription) =>
        subscription.applicationId === applicationId &&
        subscription.customerId === customer.id,
    )

    const subscription: AppSubscription = {
      id: existingSubscription?.id ?? `sub-${Date.now()}`,
      applicationId,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerOrganizationName: customer.organizationName ?? 'Não informado',
      paymentMethod,
      purchasedAt: new Date().toISOString(),
      status: 'active',
    }

    const updatedSubscriptions = existingSubscription
      ? subscriptions.map((stored) =>
          stored.id === existingSubscription.id ? subscription : stored,
        )
      : [...subscriptions, subscription]

    saveSubscriptions(updatedSubscriptions)

    const organizationId = await resolveOrganizationId()
    const application = getApplication(applicationId)
    if (organizationId && application) {
      const monthlyPrice = parsePrice(application.price)
      await supabase.from('organization_app_subscriptions').upsert(
        {
          organization_id: organizationId,
          application_id: application.id,
          application_name: application.name,
          status: 'ativo',
          monthly_price: monthlyPrice,
          discount_percent: 0,
          subscription_exempt: false,
          started_at: new Date().toISOString().slice(0, 10),
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,application_id' },
      )
      await applyReferralReward(organizationId, application.id, application.name, monthlyPrice)
    }

    return subscription
  },
}

// As assinaturas mockadas já registram cliente e status para uma futura tela Admin.
