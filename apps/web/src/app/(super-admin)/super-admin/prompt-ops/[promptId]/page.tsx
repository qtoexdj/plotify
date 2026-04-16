import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PromptEditor } from '@/components/super-admin/prompt-ops/prompt-editor'
import { PromptHistory } from '@/components/super-admin/prompt-ops/prompt-history'
import { PromptSandbox } from '@/components/super-admin/prompt-ops/prompt-sandbox'
import type { PromptVersion, SystemPrompt } from '@/types/v2'

interface Props {
  params: Promise<{ promptId: string }>
}

export default async function PromptDetailPage({ params }: Props) {
  const { promptId } = await params
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user || !isSuperAdmin) {
    redirect('/super-admin')
  }

  const supabase = await createClient()

  const { data: prompt } = await supabase
    .from('system_prompts')
    .select('*')
    .eq('id', promptId)
    .single()

  if (!prompt) notFound()

  const { data: versions } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('prompt_id', promptId)
    .order('version', { ascending: false })

  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name', { ascending: true })

  // Obtener JWT del user para llamadas al microservicio desde el cliente
  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.access_token ?? ''

  const activeVersion = (versions ?? []).find((v: PromptVersion) => v.is_active) ?? null
  const promptTyped = prompt as SystemPrompt

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
          <Link href="/super-admin/prompt-ops" className="hover:underline">Prompt Ops</Link>
          <span>/</span>
          <span className="font-mono text-slate-700">{promptTyped.slug}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{promptTyped.name}</h1>
        {promptTyped.description && (
          <p className="text-slate-600 mt-1">{promptTyped.description}</p>
        )}
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-6">
          <PromptEditor
            prompt={promptTyped}
            activeVersion={activeVersion}
            accessToken={accessToken}
          />
        </TabsContent>

        <TabsContent value="historial" className="mt-6">
          <PromptHistory
            promptId={promptId}
            versions={versions ?? []}
            accessToken={accessToken}
          />
        </TabsContent>

        <TabsContent value="sandbox" className="mt-6">
          <PromptSandbox
            promptId={promptId}
            activeVersion={activeVersion}
            organizations={organizations ?? []}
            accessToken={accessToken}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
