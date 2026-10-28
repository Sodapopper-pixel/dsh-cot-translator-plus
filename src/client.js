/** Browser half: reasoning-body translation controls and the plugin settings card. */

/** Locale namespace for this plugin. */
export const NS = 'cotTranslator'

const PROVIDER_KEY = 'dsh-cot-translator-plus.provider'
const STYLE_ID = 'dsh-cot-translator-plus/style'

/** The reasoning disclosure whose expanded body mounts this card. */
const REASONING_ROW = '[data-variant="think"]'
/** Header attribute that flips the nested process group from capped to full height. */
const GROUP_MODE = 'data-cot-group-mode'
/** Header class that keeps a group in single-row mode while its body is scrolled. */
const PINNED = 'cot-group-pinned'

/** English copy and key source. */
export const en = {
  provider: 'Translation service',
  translation: 'View translation',
  original: 'View original',
  retry: 'Retry',
  failed: 'Translation failed. Showing the original.',
  translating: 'Translating reasoning',
  settings: 'Reasoning translation',
  privacy: 'Expanded reasoning is sent to the selected service. It may contain private code or conversation details.',
  providerHint: 'Choose the service used when reasoning expands.',
  defaultProvider: 'Default service',
  targetLanguage: 'Target language',
  targetLanguageHint: 'auto follows the interface language; language codes such as zh, en or ja also work.',
  maxTextChars: 'Fragment limit',
  maxTextCharsHint: 'UTF-16 characters per provider request; longer paragraphs are split.',
  cacheMaxEntries: 'Cached translations',
  cacheMaxEntriesHint: 'Reused across reloads and restarts; 0 disables the cache.',
  timeouts: 'Advanced',
  siteTimeoutMs: 'Site timeout (ms)',
  llmTimeoutMs: 'LLM timeout (ms)',
  llmTitle: 'LLM translation',
  llmHint: 'Leave the provider empty to hide the LLM service.',
  llmSource: 'Model source',
  llmSourceBuiltin: 'DSH model provider',
  llmSourceCustom: 'Custom provider',
  llmSourceHint: 'A built-in provider reuses models already registered in the Harness. A custom provider sends requests to its own OpenAI-compatible endpoint with its own key, is stored only in this plugin, and does not change the Harness provider settings.',
  llmProvider: 'Model provider',
  customProvider: 'Custom provider',
  customProviderHint: 'Used while the model source is a custom provider.',
  llmModel: 'Model',
  llmModelHint: 'The list follows the selected provider.',
  llmProviderMissing: 'Choose a provider first.',
  models: 'Load models',
  modelsBusy: 'Loading models…',
  modelsFailed: 'Could not list models',
  modelsLoaded: 'Models loaded.',
  modelsEmpty: 'The provider reported no models.',
  customProviders: 'Custom providers',
  customProvidersHint: 'JSON array; each entry has id, label, baseUrl (the API root, such as https://host/v1), apiKey, and models. Requests leave the Host process, so baseUrl reaches whatever that process can reach.',
  invalidProvidersJson: 'Providers must be valid JSON.',
  reasoningEffort: 'Reasoning effort',
  reasoningEffortHint: 'Empty uses the model default; off disables thinking where the model supports it.',
  maxTokens: 'Max output tokens',
  maxTokensHint: '0 uses the model default.',
  temperature: 'Temperature',
  temperatureHint: 'Empty uses the model default.',
  systemPrompt: 'System prompt',
  systemPromptHint: 'Placeholders {{source}} and {{target}} are substituted. The field starts with the built-in instruction; clearing it sends no system prompt at all.',
  systemPromptReset: 'Reset to built-in',
  regenerate: 'Regenerate translation',
  sites: 'Translation sites',
  sitesHint: 'JSON array. Each site names an endpoint template ({{text}}, {{source}}, {{target}}, with |url or |json filters), optional body and headers, then where the translation appears in the response. Saving without editing keeps the shipped presets live.',
  invalidSitesJson: 'Sites must be valid JSON.',
  probe: 'Try a translation',
  probeRun: 'Translate',
  probeResult: 'Result',
  probeFailed: 'Failed',
  probeTarget: 'Service under test',
  probeTargetHint: 'Runs one request with the saved configuration and names the service that answered.',
  probeNoService: 'No translation service is configured.',
  probeSource: 'Source',
  viaSite: 'Translation site',
  viaBuiltin: 'DSH model',
  viaCustom: 'Custom model',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
  reload: 'Reload',
  clearCache: 'Clear cache',
  cleared: 'Cache cleared.',
  settingsPath: 'Stored at',
  unavailable: 'Translation settings are unavailable.',
}

/** Chinese copy. */
export const zh = {
  provider: '翻译服务',
  translation: '查看译文',
  original: '查看原文',
  retry: '重试',
  failed: '翻译暂不可用，已显示原文',
  translating: '正在翻译思考内容',
  settings: '思考内容翻译',
  privacy: '展开的思考内容会发送给所选翻译服务，可能包含私有代码或对话细节。',
  providerHint: '选择展开思考内容时使用的翻译服务。',
  defaultProvider: '默认服务',
  targetLanguage: '目标语言',
  targetLanguageHint: 'auto 跟随界面语言；也可填写语言代码，例如 zh、en、ja。',
  maxTextChars: '单次文本上限',
  maxTextCharsHint: '每个请求的 UTF-16 字符数，超出会切分段落。',
  cacheMaxEntries: '缓存译文条数',
  cacheMaxEntriesHint: '刷新页面或重启后复用；0 表示不缓存。',
  timeouts: '高级',
  siteTimeoutMs: '站点超时（毫秒）',
  llmTimeoutMs: 'LLM 超时（毫秒）',
  llmTitle: 'LLM 翻译',
  llmHint: 'provider 留空即不提供 LLM 翻译服务。',
  llmSource: '模型来源',
  llmSourceBuiltin: 'DSH 内置提供商',
  llmSourceCustom: '自定义提供商',
  llmSourceHint: '内置提供商复用 Harness 已注册的模型；自定义提供商使用自己的 OpenAI 兼容地址与密钥，只保存在本插件里，不修改 Harness 的提供商配置。',
  llmProvider: '模型提供商',
  customProvider: '自定义提供商',
  customProviderHint: '模型来源为自定义提供商时使用。',
  llmModel: '模型',
  llmModelHint: '列表来自所选提供商。',
  llmProviderMissing: '请先选择提供商。',
  models: '拉取模型',
  modelsBusy: '正在拉取模型…',
  modelsFailed: '模型列表获取失败',
  modelsLoaded: '模型列表已载入。',
  modelsEmpty: '提供商未返回模型。',
  customProviders: '自定义提供商',
  customProvidersHint: 'JSON 数组；每项包含 id、label、baseUrl（API 根地址，例如 https://host/v1）、apiKey 与 models。请求从 Host 进程发出，baseUrl 可达 Host 能访问的地址。',
  invalidProvidersJson: '提供商必须是合法 JSON。',
  reasoningEffort: '推理档位',
  reasoningEffortHint: '留空用模型默认值；off 在模型支持时关闭思考。',
  maxTokens: '最大输出 token',
  maxTokensHint: '0 表示用模型默认值。',
  temperature: '温度',
  temperatureHint: '留空用模型默认值。',
  systemPrompt: '系统提示词',
  systemPromptHint: '可用 {{source}} 与 {{target}} 占位；输入框默认显示内置指令，清空后即不发送系统提示词。',
  systemPromptReset: '重置为内置提示词',
  regenerate: '重新生成翻译',
  sites: '翻译站点',
  sitesHint: 'JSON 数组。每项给出接口地址模板（{{text}}、{{source}}、{{target}}，可加 |url 或 |json 过滤器）、可选的请求体与请求头，以及译文在响应中的位置。未编辑时保存不会写入站点列表，预置站点保持随版本生效。',
  invalidSitesJson: '站点必须是合法 JSON。',
  probe: '试译',
  probeRun: '翻译',
  probeResult: '结果',
  probeFailed: '失败',
  probeTarget: '测试对象',
  probeTargetHint: '使用已保存的配置发出一次请求，并标出实际应答的服务。',
  probeNoService: '尚未配置翻译服务。',
  probeSource: '来源',
  viaSite: '翻译站点',
  viaBuiltin: '内置模型',
  viaCustom: '自定义模型',
  save: '保存',
  saving: '保存中…',
  saved: '已保存。',
  reload: '重新读取',
  clearCache: '清空缓存',
  cleared: '缓存已清空。',
  settingsPath: '存储位置',
  unavailable: '翻译设置暂不可用。',
}

function createStore(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      if (Object.is(next, snapshot)) return
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

async function requestJson(path, init, signal) {
  const response = await fetch(path, { credentials: 'same-origin', ...init, signal })
  let body
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof body.message === 'string' && body.message !== ''
      ? body.message
      : `HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

function readStoredProvider() {
  try {
    return window.localStorage.getItem(PROVIDER_KEY) ?? ''
  } catch {
    return ''
  }
}

function storeProvider(id) {
  try {
    window.localStorage.setItem(PROVIDER_KEY, id)
  } catch {
    // A browser with storage disabled keeps the in-memory selection for this disclosure.
  }
}

function injectStyle() {
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-cot-translator-plus'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

function translatedBody(renderFactorySlot, text, running) {
  return renderFactorySlot('conversation.chat.reasoning.content', { text, running })
}

/**
 * Fit the card and its disclosure ancestors to the viewport width.
 *
 * The official reasoning row indents its body by 22px and the Host caps a nested process group body at
 * `min(400px, 50vh)`. A phone then has about 200px of content between two folds: the reasoning
 * disclosure and the group it belongs to. `overflow-y: auto` on that capped body also computes
 * `overflow-x: auto`, so the toolbar cannot extend past the box either. Narrow screens drop both
 * indents and lift the cap, and the group header stays one row while its body scrolls.
 * @param card - the mounted translation card.
 * @param narrow - whether the viewport is phone-width.
 */
function fitToolbar(card, narrow) {
  const body = card.closest('[data-step-process-body]')
  const header = body === null ? null : body.previousElementSibling
  const row = card.closest(REASONING_ROW)
  if (header === null) { /* The row sits outside any process group. */ }
  else if (narrow) header.setAttribute(GROUP_MODE, 'content')
  else header.removeAttribute(GROUP_MODE)
  if (row !== null) {
    if (narrow) row.setAttribute('data-cot-fit', 'true')
    else row.removeAttribute('data-cot-fit')
  }
  markScrolledGroups()
}

/**
 * Republish the fitted state when the viewport crosses the phone width.
 * @param read - the measurement callback.
 * @returns the disconnect function.
 */
function followViewport(read) {
  const narrow = window.matchMedia('(max-width: 767px)')
  narrow.addEventListener('change', read)
  return () => { narrow.removeEventListener('change', read) }
}

/**
 * Keep a scrolled group body in single-row mode across reloads and remounts.
 *
 * The card sets `data-cot-group-mode` on the group header, which is not a React-owned attribute, so it
 * survives re-renders. This marks every group whose body currently scrolls, and the stylesheet collapses
 * those headers to one row.
 */
function markScrolledGroups() {
  for (const body of document.querySelectorAll('[data-step-process-body]')) {
    const header = body.previousElementSibling
    if (header === null || header.getAttribute(GROUP_MODE) === null) continue
    header.classList.toggle(PINNED, body.scrollTop > 0)
  }
}

/**
 * Re-read the layout when a scroll inside a group body changes which row the header should show.
 * @param read - the measurement callback, run once per animation frame.
 * @returns the disconnect function.
 */
function followGroupScroll(read) {
  const schedule = () => {
    const flag = 'data-cot-layout'
    if (document.documentElement.getAttribute(flag) !== null) return
    document.documentElement.setAttribute(flag, '')
    requestAnimationFrame(() => {
      document.documentElement.removeAttribute(flag)
      read()
    })
  }
  const scroll = (event) => {
    const target = event.target
    if (target instanceof Element && target.closest('[data-step-process-body]') !== null) schedule()
  }
  window.addEventListener('scroll', scroll, true)
  return () => { window.removeEventListener('scroll', scroll, true) }
}

/**
 * Keep the card's disclosure ancestors fitted as the viewport and the group scroll change.
 * @param card - the mounted translation card.
 * @returns the cleanup function.
 */
function bindToolbarLayer(card) {
  const narrow = window.matchMedia('(max-width: 767px)')
  const read = () => {
    if (!card.isConnected) return
    fitToolbar(card, narrow.matches)
  }
  read()
  const stopFollowingScroll = followGroupScroll(read)
  const stopFollowingViewport = followViewport(read)
  return () => {
    stopFollowingScroll()
    stopFollowingViewport()
    const row = card.closest(REASONING_ROW)
    if (row !== null) row.removeAttribute('data-cot-fit')
    const body = card.closest('[data-step-process-body]')
    const header = body === null ? null : body.previousElementSibling
    if (header !== null) header.removeAttribute(GROUP_MODE)
  }
}

/**
 * Render translated reasoning beside the original, with a per-disclosure service choice.
 * @param props - original reasoning, streaming state, framework Factory renderer, locale, and injected state.
 * @returns compact reasoning plus its translation toolbar.
 */
function CotTranslationBody(props) {
  const { text, running, renderFactorySlot, t, translate } = props
  const config = props.useCotTranslatorState(value => value)
  const loadStatus = props.useCotTranslatorStatus(value => value)
  const activeLocale = props.useCotTranslatorLocale(value => value)
  const [providerId, setProviderId] = React.useState(readStoredProvider)
  const [shown, setShown] = React.useState({ text, pending: false, failed: false })
  const [original, setOriginal] = React.useState(false)
  const controller = React.useRef(null)
  const card = React.useRef(null)
  const providers = config === null ? [] : config.providers
  const resolvedProvider = providers.some(entry => entry.id === providerId)
    ? providerId
    : (config === null ? '' : providers.some(entry => entry.id === config.defaultProvider) ? config.defaultProvider : providers[0]?.id ?? '')
  // Without the settings the Host still resolves its own default provider and text limit, so only the
  // target language has to come from the browser locale the card already knows.
  const targetLanguage = config === null ? activeLocale : (config.targetLanguage === 'auto' ? activeLocale : config.targetLanguage)
  const maxTextChars = config === null ? 4000 : config.maxTextChars

  React.useEffect(() => {
    const instance = new ReasoningTranslation({ provider: resolvedProvider, targetLanguage }, maxTextChars, translate, setShown)
    controller.current = instance
    instance.update(text, running)
    return () => {
      instance.dispose()
      controller.current = null
    }
  }, [resolvedProvider, targetLanguage, maxTextChars])
  React.useEffect(() => {
    controller.current?.update(text, running)
  }, [text, running, resolvedProvider, targetLanguage, maxTextChars])
  React.useEffect(() => (card.current === null ? undefined : bindToolbarLayer(card.current)), [])

  const failed = shown.failed
  const showOriginal = original || failed
  const body = translatedBody(renderFactorySlot, showOriginal ? text : shown.text, running)
  return React.createElement('div', { ref: card, className: 'cot-body', 'data-cot-translator': 'true', 'data-cot-state': failed ? 'failed' : shown.pending ? 'pending' : 'ready' },
    React.createElement('div', { className: 'cot-toolbar' },
      providers.length > 1
        ? React.createElement('select', {
          className: 'cot-select',
          value: resolvedProvider,
          'aria-label': t('provider'),
          onChange: (event) => {
            setProviderId(event.target.value)
            storeProvider(event.target.value)
          },
        }, providers.map(entry => React.createElement('option', { key: entry.id, value: entry.id }, entry.label)))
        : null,
      loadStatus === 'failed'
        ? React.createElement('span', { className: 'cot-failed', role: 'status' }, t('unavailable'))
        : null,
      React.createElement(UI.Button, {
        size: 'sm',
        variant: 'ghost',
        disabled: failed,
        onClick: () => { setOriginal(!showOriginal) },
      }, t(showOriginal ? 'translation' : 'original')),
      React.createElement(UI.Button, {
        className: 'cot-icon-button',
        size: 'sm',
        variant: 'ghost',
        icon: React.createElement(UI.IconRefreshOutlineRegular, { size: 14 }),
        'aria-label': t('regenerate'),
        title: t('regenerate'),
        disabled: shown.pending,
        onClick: () => { controller.current?.regenerate() },
      }),
      shown.pending ? React.createElement('span', { className: 'cot-spinner', role: 'status', 'aria-label': t('translating') }) : null,
      failed ? React.createElement('span', { className: 'cot-failed', role: 'status' }, t('failed')) : null,
      failed ? React.createElement(UI.Button, { size: 'sm', variant: 'ghost', onClick: () => { controller.current?.retry() } }, t('retry')) : null,
      loadStatus === 'failed'
        ? React.createElement(UI.Button, { size: 'sm', variant: 'ghost', onClick: () => { void props.reload() } }, t('reload'))
        : null),
    body)
}

function numberInput(id, label, hint, value, disabled, onEdit, options = {}) {
  return React.createElement('div', { className: 'cot-field' },
    React.createElement('label', { htmlFor: id }, label),
    React.createElement('input', {
      id,
      type: 'number',
      className: 'cot-input',
      value,
      disabled,
      min: options.min ?? 0,
      step: options.step ?? 1,
      onChange: event => onEdit(event.target.value),
    }),
    hint === '' ? null : React.createElement('p', { className: 'cot-hint' }, hint))
}

function textInput(id, label, hint, value, disabled, onEdit, placeholder = '') {
  return React.createElement('div', { className: 'cot-field' },
    React.createElement('label', { htmlFor: id }, label),
    React.createElement('input', {
      id,
      type: 'text',
      className: 'cot-input',
      value,
      disabled,
      placeholder,
      onChange: event => onEdit(event.target.value),
    }),
    hint === '' ? null : React.createElement('p', { className: 'cot-hint' }, hint))
}

/**
 * Render the plugin's settings card: route choice, LLM controls, and the site list.
 * @param props - locale, injected state, and save/reload/probe callbacks.
 * @returns the staged settings form.
 */
function CotTranslationSettings(props) {
  const { t, save, reload, clearCache, translateDetailed, listModels } = props
  const config = props.useCotTranslatorState(value => value)
  const activeLocale = props.useCotTranslatorLocale(value => value)
  const [draft, setDraft] = React.useState(null)
  const [sitesText, setSitesText] = React.useState('')
  const [sitesDirty, setSitesDirty] = React.useState(false)
  const [providersText, setProvidersText] = React.useState('')
  const [providersDirty, setProvidersDirty] = React.useState(false)
  const [modelList, setModelList] = React.useState({ key: '', ids: [] })
  const [modelsBusy, setModelsBusy] = React.useState(false)
  const [status, setStatus] = React.useState({ kind: 'idle' })
  const [probeText, setProbeText] = React.useState('Hello, world.')
  const [probeTarget, setProbeTarget] = React.useState('')
  const [probe, setProbe] = React.useState({ pending: false, result: '', via: null, error: '' })

  React.useEffect(() => {
    if (config === null) return
    setDraft({
      defaultProvider: config.defaultProvider,
      targetLanguage: config.targetLanguage,
      maxTextChars: config.maxTextChars,
      cacheMaxEntries: config.cacheMaxEntries,
      siteTimeoutMs: config.siteTimeoutMs,
      llmTimeoutMs: config.llmTimeoutMs,
      llm: { ...config.llm },
    })
    setSitesText(JSON.stringify(config.sites, null, 2))
    setSitesDirty(false)
    setProvidersText(JSON.stringify(config.llmProviders ?? [], null, 2))
    setProvidersDirty(false)
  }, [config])

  React.useEffect(() => {
    if (config === null) return
    setProbeTarget(previous => config.providers.some(entry => entry.id === previous) ? previous : config.defaultProvider)
  }, [config])

  if (config === null || draft === null) {
    return React.createElement('div', { className: 'cot-field' },
      React.createElement('p', { className: 'cot-hint' }, t('unavailable')),
      React.createElement(UI.Button, { size: 'sm', variant: 'ghost', onClick: () => { void reload() } }, t('reload')))
  }
  const providers = config.providers
  const busy = status.kind === 'saving'
  const edit = (key, value) => { setDraft({ ...draft, [key]: value }) }
  const editLlm = (key, value) => { setDraft({ ...draft, llm: { ...draft.llm, [key]: value } }) }
  const source = draft.llm.source ?? 'builtin'
  const customProviders = config.llmProviders ?? []
  const builtinCatalog = config.builtinLlmProviders ?? []
  const savedModels = config.llmModels ?? []
  let parsedProviders = []
  try {
    const value = JSON.parse(providersText)
    if (Array.isArray(value)) parsedProviders = value.filter(entry => entry !== null && typeof entry === 'object' && typeof entry.id === 'string')
  } catch {
    parsedProviders = []
  }
  const providerChoices = [...customProviders]
  for (const entry of parsedProviders) {
    const index = providerChoices.findIndex(row => row.id === entry.id)
    if (index === -1) providerChoices.push(entry)
    else providerChoices[index] = { ...providerChoices[index], ...entry }
  }
  const selectedCustom = source === 'custom' ? providerChoices.find(entry => entry.id === draft.llm.customProvider) : undefined
  const providerKey = source === 'custom' ? `custom:${draft.llm.customProvider}` : `builtin:${draft.llm.provider}`
  const defaultModels = source === 'custom'
    ? selectedCustom?.models ?? []
    : (draft.llm.provider !== '' && draft.llm.provider === config.llm.provider ? savedModels : [])
  const modelIds = modelList.key === providerKey ? modelList.ids : defaultModels
  const modelOptions = draft.llm.model !== '' && !modelIds.includes(draft.llm.model) ? [...modelIds, draft.llm.model] : modelIds
  const builtinProviders = builtinCatalog.some(entry => entry.id === draft.llm.provider) || draft.llm.provider === ''
    ? builtinCatalog
    : [...builtinCatalog, { id: draft.llm.provider, name: draft.llm.provider }]
  const customOptions = providerChoices.some(entry => entry.id === draft.llm.customProvider) || draft.llm.customProvider === ''
    ? providerChoices
    : [...providerChoices, { id: draft.llm.customProvider, label: draft.llm.customProvider }]
  const viaText = (via) => {
    if (via === null || via === undefined) return ''
    if (via.kind === 'site') return `${t('viaSite')} · ${via.name}`
    if (via.source === 'custom') return `${t('viaCustom')} · ${via.name}/${via.model}`
    return `${t('viaBuiltin')} · ${via.provider}/${via.model}`
  }
  const probeLabel = providers.find(entry => entry.id === probeTarget)?.label ?? ''

  const onSave = async () => {
    setStatus({ kind: 'saving' })
    try {
      const body = { ...draft }
      if (sitesDirty) {
        try {
          body.sites = JSON.parse(sitesText)
        } catch {
          throw new Error(t('invalidSitesJson'))
        }
      }
      if (providersDirty) {
        try {
          body.llmProviders = JSON.parse(providersText)
        } catch {
          throw new Error(t('invalidProvidersJson'))
        }
      } else {
        body.llmProviders = config.llmProviders ?? []
      }
      body.llm = {
        ...draft.llm,
        systemPrompt: draft.llm.systemPrompt === undefined || draft.llm.systemPrompt === '' ? null : draft.llm.systemPrompt,
        maxTokens: Number(draft.llm.maxTokens) || 0,
        temperature: draft.llm.temperature === '' || draft.llm.temperature === null ? null : Number(draft.llm.temperature),
      }
      for (const key of ['maxTextChars', 'cacheMaxEntries', 'siteTimeoutMs', 'llmTimeoutMs']) body[key] = Number(draft[key])
      await save(body)
      setStatus({ kind: 'saved' })
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message ?? String(error) })
    }
  }

  const onLoadModels = async () => {
    if (modelsBusy) return
    setModelsBusy(true)
    setStatus({ kind: 'idle' })
    try {
      if (source === 'custom') {
        if (draft.llm.customProvider === '') throw new Error(t('llmProviderMissing'))
        let entries
        try {
          entries = JSON.parse(providersText)
        } catch {
          throw new Error(t('invalidProvidersJson'))
        }
        if (!Array.isArray(entries)) throw new Error(t('invalidProvidersJson'))
        const entry = entries.find(row => row?.id === draft.llm.customProvider)
        if (entry === undefined || typeof entry.baseUrl !== 'string') throw new Error(t('llmProviderMissing'))
        const ids = await listModels({
          source: 'custom',
          providerId: draft.llm.customProvider,
          baseUrl: entry.baseUrl,
          apiKey: typeof entry.apiKey === 'string' ? entry.apiKey : '',
        })
        let found = false
        const updated = entries.map(row => {
          if (row?.id !== draft.llm.customProvider) return row
          found = true
          return { ...row, models: ids }
        })
        if (!found) throw new Error(t('llmProviderMissing'))
        setProvidersText(JSON.stringify(updated, null, 2))
        setProvidersDirty(true)
        setModelList({ key: providerKey, ids })
      } else {
        if (draft.llm.provider === '') throw new Error(t('llmProviderMissing'))
        const ids = await listModels({ source: 'builtin', provider: draft.llm.provider })
        setModelList({ key: providerKey, ids })
      }
      setStatus({ kind: 'saved', message: t('modelsLoaded') })
    } catch (error) {
      setStatus({ kind: 'error', message: `${t('modelsFailed')}: ${error?.message ?? String(error)}` })
    } finally {
      setModelsBusy(false)
    }
  }

  const onProbe = async () => {
    setProbe({ pending: true, result: '', via: null, error: '' })
    try {
      const body = await translateDetailed({
        provider: probeTarget === '' ? undefined : probeTarget,
        text: probeText,
        targetLanguage: draft.targetLanguage === 'auto' ? activeLocale : draft.targetLanguage,
      })
      setProbe({ pending: false, result: body.text, via: body.via ?? null, error: '' })
    } catch (error) {
      setProbe({ pending: false, result: '', via: null, error: error?.message ?? String(error) })
    }
  }

  return React.createElement('div', { className: 'cot-settings', 'data-cot-settings': 'true' },
    React.createElement('p', { className: 'cot-hint' }, t('privacy')),
    React.createElement('div', { className: 'cot-field' },
      React.createElement('label', { htmlFor: 'cot-provider' }, t('defaultProvider')),
      React.createElement('select', {
        id: 'cot-provider',
        className: 'cot-input',
        value: draft.defaultProvider,
        disabled: busy,
        onChange: event => edit('defaultProvider', event.target.value),
      }, providers.map(entry => React.createElement('option', { key: entry.id, value: entry.id }, entry.label))),
      React.createElement('p', { className: 'cot-hint' }, t('providerHint'))),
    textInput('cot-language', t('targetLanguage'), t('targetLanguageHint'), draft.targetLanguage, busy,
      value => edit('targetLanguage', value)),
    numberInput('cot-max-chars', t('maxTextChars'), t('maxTextCharsHint'), draft.maxTextChars, busy,
      value => edit('maxTextChars', value), { min: 2 }),
    numberInput('cot-cache', t('cacheMaxEntries'), t('cacheMaxEntriesHint'), draft.cacheMaxEntries, busy,
      value => edit('cacheMaxEntries', value)),
    React.createElement('details', { className: 'cot-details' },
      React.createElement('summary', null, t('timeouts')),
      numberInput('cot-site-timeout', t('siteTimeoutMs'), '', draft.siteTimeoutMs, busy,
        value => edit('siteTimeoutMs', value), { min: 100, step: 100 }),
      numberInput('cot-llm-timeout', t('llmTimeoutMs'), '', draft.llmTimeoutMs, busy,
        value => edit('llmTimeoutMs', value), { min: 100, step: 100 })),
    React.createElement('h4', { className: 'cot-heading' }, t('llmTitle')),
    React.createElement('p', { className: 'cot-hint' }, t('llmHint')),
    React.createElement('div', { className: 'cot-field' },
      React.createElement('label', { htmlFor: 'cot-llm-source' }, t('llmSource')),
      React.createElement('select', {
        id: 'cot-llm-source',
        className: 'cot-input',
        value: source,
        disabled: busy,
        onChange: event => editLlm('source', event.target.value),
      },
      React.createElement('option', { value: 'builtin' }, t('llmSourceBuiltin')),
      React.createElement('option', { value: 'custom' }, t('llmSourceCustom'))),
      React.createElement('p', { className: 'cot-hint' }, t('llmSourceHint'))),
    source === 'custom'
      ? React.createElement('div', { className: 'cot-field' },
        React.createElement('label', { htmlFor: 'cot-llm-custom-provider' }, t('customProvider')),
        React.createElement('select', {
          id: 'cot-llm-custom-provider',
          className: 'cot-input',
          value: draft.llm.customProvider,
          disabled: busy,
          onChange: event => editLlm('customProvider', event.target.value),
        },
        [React.createElement('option', { key: '', value: '' }, '—'), ...customOptions.map(entry =>
          React.createElement('option', { key: entry.id, value: entry.id }, entry.label))]),
        React.createElement('p', { className: 'cot-hint' }, t('customProviderHint')))
      : React.createElement('div', { className: 'cot-field' },
        React.createElement('label', { htmlFor: 'cot-llm-provider' }, t('llmProvider')),
        React.createElement('select', {
          id: 'cot-llm-provider',
          className: 'cot-input',
          value: draft.llm.provider,
          disabled: busy,
          onChange: event => editLlm('provider', event.target.value),
        },
        [React.createElement('option', { key: '', value: '' }, '—'), ...builtinProviders.map(entry =>
          React.createElement('option', { key: entry.id, value: entry.id }, entry.name))])),
    React.createElement('div', { className: 'cot-field' },
      React.createElement('label', { htmlFor: 'cot-llm-model' }, t('llmModel')),
      React.createElement('div', { className: 'cot-row' },
        React.createElement('select', {
          id: 'cot-llm-model',
          className: 'cot-input',
          value: draft.llm.model,
          disabled: busy,
          onChange: event => editLlm('model', event.target.value),
        },
        [React.createElement('option', { key: '', value: '' }, '—'), ...modelOptions.map(id =>
          React.createElement('option', { key: id, value: id }, id))]),
        React.createElement(UI.Button, {
          size: 'sm',
          variant: 'ghost',
          disabled: busy || modelsBusy
            || (source === 'custom' ? draft.llm.customProvider === '' : draft.llm.provider === ''),
          onClick: onLoadModels,
        }, t(modelsBusy ? 'modelsBusy' : 'models'))),
      React.createElement('p', { className: 'cot-hint' }, t('llmModelHint'))),
    textInput('cot-llm-effort', t('reasoningEffort'), t('reasoningEffortHint'), draft.llm.reasoningEffort, busy,
      value => editLlm('reasoningEffort', value), 'off'),
    numberInput('cot-llm-tokens', t('maxTokens'), t('maxTokensHint'), draft.llm.maxTokens, busy,
      value => editLlm('maxTokens', value)),
    React.createElement('div', { className: 'cot-field' },
      React.createElement('label', { htmlFor: 'cot-llm-temperature' }, t('temperature')),
      React.createElement('input', {
        id: 'cot-llm-temperature',
        type: 'number',
        className: 'cot-input',
        min: 0,
        max: 2,
        step: 0.1,
        value: draft.llm.temperature ?? '',
        disabled: busy,
        onChange: event => editLlm('temperature', event.target.value === '' ? null : event.target.value),
      }),
      React.createElement('p', { className: 'cot-hint' }, t('temperatureHint'))),
    React.createElement('div', { className: 'cot-field' },
      React.createElement('label', { htmlFor: 'cot-llm-system' }, t('systemPrompt')),
      React.createElement('textarea', {
        id: 'cot-llm-system',
        className: 'cot-textarea',
        rows: 4,
        value: draft.llm.systemPrompt ?? '',
        disabled: busy,
        onChange: event => editLlm('systemPrompt', event.target.value),
      }),
      React.createElement('div', { className: 'cot-row' },
        React.createElement(UI.Button, {
          size: 'sm',
          variant: 'ghost',
          disabled: busy || (draft.llm.systemPrompt ?? '') === (config.defaultSystemPrompt ?? ''),
          onClick: () => editLlm('systemPrompt', config.defaultSystemPrompt ?? ''),
        }, t('systemPromptReset'))),
      React.createElement('p', { className: 'cot-hint' }, t('systemPromptHint'))),
    source === 'custom'
      ? React.createElement(React.Fragment, null,
        React.createElement('h4', { className: 'cot-heading' }, t('customProviders')),
        React.createElement('p', { className: 'cot-hint' }, t('customProvidersHint')),
        React.createElement('textarea', {
          className: 'cot-textarea cot-json',
          rows: 8,
          spellCheck: false,
          value: providersText,
          disabled: busy,
          'aria-label': t('customProviders'),
          onChange: event => {
            setProvidersText(event.target.value)
            setProvidersDirty(true)
          },
        }))
      : null,
    React.createElement('h4', { className: 'cot-heading' }, t('sites')),
    React.createElement('p', { className: 'cot-hint' }, t('sitesHint')),
    React.createElement('textarea', {
      className: 'cot-textarea cot-json',
      rows: 14,
      spellCheck: false,
      value: sitesText,
      disabled: busy,
      'aria-label': t('sites'),
      onChange: event => {
        setSitesText(event.target.value)
        setSitesDirty(true)
      },
    }),
    React.createElement('div', { className: 'cot-actions' },
      React.createElement(UI.Button, { size: 'sm', variant: 'primary', disabled: busy, onClick: onSave }, t(busy ? 'saving' : 'save')),
      React.createElement(UI.Button, {
        size: 'sm',
        variant: 'ghost',
        disabled: busy,
        onClick: () => { setStatus({ kind: 'idle' }); void reload() },
      }, t('reload')),
      React.createElement(UI.Button, {
        size: 'sm',
        variant: 'ghost',
        disabled: busy,
        onClick: async () => {
          try {
            await clearCache()
            setStatus({ kind: 'saved', message: t('cleared') })
          } catch (error) {
            setStatus({ kind: 'error', message: error?.message ?? String(error) })
          }
        },
      }, t('clearCache'))),
    status.kind === 'idle' ? null : React.createElement('p', {
      className: status.kind === 'error' ? 'cot-status cot-status-error' : 'cot-status',
      role: 'status',
    }, status.kind === 'error' ? status.message : status.message ?? t('saved')),
    React.createElement('p', { className: 'cot-hint' }, `${t('settingsPath')}: ${config.paths.settings}`),
    React.createElement('h4', { className: 'cot-heading' }, t('probe')),
    React.createElement('div', { className: 'cot-probe' },
      React.createElement('select', {
        className: 'cot-input',
        value: probeTarget,
        disabled: probe.pending || busy || providers.length === 0,
        'aria-label': t('probeTarget'),
        onChange: event => setProbeTarget(event.target.value),
      }, providers.length === 0
        ? React.createElement('option', { value: '' }, t('probeNoService'))
        : providers.map(entry => React.createElement('option', { key: entry.id, value: entry.id }, entry.label))),
      React.createElement('input', {
        type: 'text',
        className: 'cot-input',
        value: probeText,
        disabled: probe.pending || busy,
        'aria-label': t('probe'),
        onChange: event => setProbeText(event.target.value),
      }),
      React.createElement(UI.Button, {
        size: 'sm',
        variant: 'outline',
        disabled: probe.pending || busy || providers.length === 0 || probeText.trim() === '',
        onClick: onProbe,
      }, t('probeRun'))),
    React.createElement('p', { className: 'cot-hint' }, t('probeTargetHint')),
    probe.via === null ? null : React.createElement('p', { className: 'cot-status' }, `${t('probeSource')}: ${viaText(probe.via)}`),
    probe.result === '' ? null : React.createElement('p', { className: 'cot-status' }, `${t('probeResult')}: ${probe.result}`),
    probe.error === '' ? null : React.createElement('p', {
      className: 'cot-status cot-status-error',
    }, `${t('probeFailed')} (${t('probeSource')}: ${probeLabel}): ${probe.error}`))
}

/** Client plugin entry points; the build wraps these in the module-loader factory. */
export const inject = ['slots', 'locale']

/**
 * Mount the reasoning-body contribution and the plugin settings card.
 * @param ctx - browser plugin context with the slot registry and locale service.
 */
export async function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'cot-translator: dictionaries')
  const state = createStore(null)
  const loadStatus = createStore('loading')
  const activeLocale = createStore(ctx.locale.getSnapshot().active)
  ctx.effect(() => ctx.locale.subscribe(() => { activeLocale.set(ctx.locale.getSnapshot().active) }), 'cot-translator: active locale')

  const refresh = async () => {
    try {
      state.set(await requestJson('/cot-translator/state', {}))
      loadStatus.set('ready')
    } catch (error) {
      loadStatus.set('failed')
      ctx.logger?.warn?.(`cot-translator: could not read settings: ${error?.message ?? error}`)
    }
  }
  const save = async (body) => {
    const next = await requestJson('/cot-translator/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    state.set(next)
    return next
  }
  const clearCache = async () => {
    await requestJson('/cot-translator/cache/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  }
  const translateDetailed = async (request, signal) => {
    return await requestJson('/cot-translator/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }, signal)
  }
  const translate = async (request, signal) => (await translateDetailed(request, signal)).text
  const listModels = async (request) => {
    const body = await requestJson('/cot-translator/llm/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return (body.models ?? []).map(model => model.id)
  }

  ctx.effect(() => {
    const removeStyle = injectStyle()
    void refresh()
    return removeStyle
  }, 'cot-translator: styles and initial settings')

  ctx.slots.inject('conversation.chat.reasoning.body', () => ctx.slots.register({
    name: 'conversation.chat.reasoning.body',
    priority: 50,
    locale: NS,
    inject: () => ({
      hooks: { cotTranslatorState: state, cotTranslatorStatus: loadStatus, cotTranslatorLocale: activeLocale },
      translate,
      reload: refresh,
    }),
  }, CotTranslationBody))

  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'dsh-cot-translator-plus',
    locale: NS,
    inject: () => ({
      hooks: { cotTranslatorState: state, cotTranslatorStatus: loadStatus, cotTranslatorLocale: activeLocale },
      save,
      reload: refresh,
      clearCache,
      translateDetailed,
      listModels,
    }),
  }, CotTranslationSettings))
}
