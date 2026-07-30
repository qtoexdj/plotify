import { Anthropic, DeepSeek, Google, OpenAI } from 'developer-icons'

import type { Provider } from './llm-types'

interface LlmProviderIconProps {
  provider: Provider
  className?: string
}

export function LlmProviderIcon({ provider, className = 'size-5' }: LlmProviderIconProps) {
  const props = {
    'aria-hidden': true,
    className,
    'data-provider-icon': provider,
    focusable: false,
    size: 20,
  }

  if (provider === 'openai') return <OpenAI {...props} />
  if (provider === 'anthropic') return <Anthropic {...props} />
  if (provider === 'deepseek') return <DeepSeek {...props} />
  return <Google {...props} />
}
