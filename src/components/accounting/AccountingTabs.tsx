interface AccountingTabsProps<T extends string> {
  activeTab: T
  onChange: (tab: T) => void
  tabs: Array<{ id: T; label: string }>
}

export function AccountingTabs<T extends string>({
  activeTab,
  onChange,
  tabs,
}: AccountingTabsProps<T>) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition ${
            activeTab === tab.id
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
