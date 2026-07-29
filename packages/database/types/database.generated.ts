export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_custom_instructions: {
        Row: {
          created_at: string | null
          id: string
          instructions: string
          is_active: boolean | null
          organization_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructions: string
          is_active?: boolean | null
          organization_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructions?: string
          is_active?: boolean | null
          organization_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_custom_instructions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skill_versions: {
        Row: {
          approved_tool_slugs: string[]
          change_summary: string | null
          created_at: string
          created_by: string | null
          definition_markdown: string
          id: string
          organization_id: string | null
          requires_role: string[]
          skill_id: string
          tool_definition: Json
          validation_errors: Json
          validation_status: string
          version: number
        }
        Insert: {
          approved_tool_slugs?: string[]
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          definition_markdown: string
          id?: string
          organization_id?: string | null
          requires_role?: string[]
          skill_id: string
          tool_definition?: Json
          validation_errors?: Json
          validation_status?: string
          version: number
        }
        Update: {
          approved_tool_slugs?: string[]
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          definition_markdown?: string
          id?: string
          organization_id?: string | null
          requires_role?: string[]
          skill_id?: string
          tool_definition?: Json
          validation_errors?: Json
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_skill_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_skill_versions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          approved_tool_slugs: string[]
          category: string
          created_at: string | null
          created_by: string | null
          current_version: number
          definition_markdown: string | null
          description: string
          enabled_by_default: boolean | null
          id: string
          is_system: boolean | null
          mcp_provider: string | null
          name: string
          organization_id: string | null
          requires_mcp: boolean | null
          requires_role: string[] | null
          slug: string
          tool_definition: Json
          updated_at: string | null
          updated_by: string | null
          validation_errors: Json
          validation_status: string
        }
        Insert: {
          approved_tool_slugs?: string[]
          category?: string
          created_at?: string | null
          created_by?: string | null
          current_version?: number
          definition_markdown?: string | null
          description: string
          enabled_by_default?: boolean | null
          id?: string
          is_system?: boolean | null
          mcp_provider?: string | null
          name: string
          organization_id?: string | null
          requires_mcp?: boolean | null
          requires_role?: string[] | null
          slug: string
          tool_definition: Json
          updated_at?: string | null
          updated_by?: string | null
          validation_errors?: Json
          validation_status?: string
        }
        Update: {
          approved_tool_slugs?: string[]
          category?: string
          created_at?: string | null
          created_by?: string | null
          current_version?: number
          definition_markdown?: string | null
          description?: string
          enabled_by_default?: boolean | null
          id?: string
          is_system?: boolean | null
          mcp_provider?: string | null
          name?: string
          organization_id?: string | null
          requires_mcp?: boolean | null
          requires_role?: string[] | null
          slug?: string
          tool_definition?: Json
          updated_at?: string | null
          updated_by?: string | null
          validation_errors?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          admin_phone: string | null
          approved_transition_version: number
          created_at: string
          id: string
          idempotency_key: string | null
          lot_id: string
          operation_id: string | null
          organization_id: string
          payload: Json
          previous_lot_state: string | null
          request_hash: string | null
          request_type: string
          resolved_at: string | null
          sale_mode: string | null
          status: string
          vendor_id: string
          vendor_name: string
          vendor_phone: string
          vendor_platform: string
        }
        Insert: {
          admin_phone?: string | null
          approved_transition_version?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          lot_id: string
          operation_id?: string | null
          organization_id: string
          payload?: Json
          previous_lot_state?: string | null
          request_hash?: string | null
          request_type?: string
          resolved_at?: string | null
          sale_mode?: string | null
          status?: string
          vendor_id: string
          vendor_name: string
          vendor_phone: string
          vendor_platform: string
        }
        Update: {
          admin_phone?: string | null
          approved_transition_version?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          lot_id?: string
          operation_id?: string | null
          organization_id?: string
          payload?: Json
          previous_lot_state?: string | null
          request_hash?: string | null
          request_type?: string
          resolved_at?: string | null
          sale_mode?: string | null
          status?: string
          vendor_id?: string
          vendor_name?: string
          vendor_phone?: string
          vendor_platform?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          actor: string | null
          actor_user_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          event_key: string | null
          id: string
          operation_id: string | null
          organization_id: string | null
          payload: Json | null
          reason_code: string | null
          result: string
        }
        Insert: {
          action?: string | null
          actor?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          event_key?: string | null
          id?: string
          operation_id?: string | null
          organization_id?: string | null
          payload?: Json | null
          reason_code?: string | null
          result?: string
        }
        Update: {
          action?: string | null
          actor?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          event_key?: string | null
          id?: string
          operation_id?: string | null
          organization_id?: string | null
          payload?: Json | null
          reason_code?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_blobs: {
        Row: {
          blob: string | null
          channel: string
          checkpoint_ns: string
          thread_id: string
          type: string
          version: string
        }
        Insert: {
          blob?: string | null
          channel: string
          checkpoint_ns?: string
          thread_id: string
          type: string
          version: string
        }
        Update: {
          blob?: string | null
          channel?: string
          checkpoint_ns?: string
          thread_id?: string
          type?: string
          version?: string
        }
        Relationships: []
      }
      checkpoint_migrations: {
        Row: {
          v: number
        }
        Insert: {
          v: number
        }
        Update: {
          v?: number
        }
        Relationships: []
      }
      checkpoint_writes: {
        Row: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns: string
          idx: number
          task_id: string
          task_path: string
          thread_id: string
          type: string | null
        }
        Insert: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns?: string
          idx: number
          task_id: string
          task_path?: string
          thread_id: string
          type?: string | null
        }
        Update: {
          blob?: string
          channel?: string
          checkpoint_id?: string
          checkpoint_ns?: string
          idx?: number
          task_id?: string
          task_path?: string
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      checkpoints: {
        Row: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns: string
          metadata: Json
          parent_checkpoint_id: string | null
          thread_id: string
          type: string | null
        }
        Insert: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id: string
          type?: string | null
        }
        Update: {
          checkpoint?: Json
          checkpoint_id?: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      dead_letter_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          id: string
          job_function: string
          payload: Json
          traceback: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_function: string
          payload?: Json
          traceback?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_function?: string
          payload?: Json
          traceback?: string | null
        }
        Relationships: []
      }
      denied_operation_attempts: {
        Row: {
          attempt_id: string
          audit_log_id: string | null
          occurred_at: string
          operation_type: string
          organization_id: string | null
          principal_subject_hash: string
          principal_type: string
          reason_code: string
          reconciled_at: string | null
          resource_scope_hash: string
        }
        Insert: {
          attempt_id: string
          audit_log_id?: string | null
          occurred_at?: string
          operation_type: string
          organization_id?: string | null
          principal_subject_hash: string
          principal_type: string
          reason_code: string
          reconciled_at?: string | null
          resource_scope_hash: string
        }
        Update: {
          attempt_id?: string
          audit_log_id?: string | null
          occurred_at?: string
          operation_type?: string
          organization_id?: string | null
          principal_subject_hash?: string
          principal_type?: string
          reason_code?: string
          reconciled_at?: string | null
          resource_scope_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "denied_operation_attempts_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denied_operation_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_blocks: {
        Row: {
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          tags: string[] | null
          updated_at: string | null
          variables: string[] | null
          version: number | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          tags?: string[] | null
          updated_at?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          tags?: string[] | null
          updated_at?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_evidence: {
        Row: {
          bbox: Json | null
          chunk_index: number | null
          confidence: number | null
          created_at: string
          id: string
          legal_document_id: string
          legal_document_page_id: string | null
          organization_id: string
          project_id: string
          snippet: string | null
          snippet_hash: string
          variable_resolution_id: string
        }
        Insert: {
          bbox?: Json | null
          chunk_index?: number | null
          confidence?: number | null
          created_at?: string
          id?: string
          legal_document_id: string
          legal_document_page_id?: string | null
          organization_id: string
          project_id: string
          snippet?: string | null
          snippet_hash: string
          variable_resolution_id: string
        }
        Update: {
          bbox?: Json | null
          chunk_index?: number | null
          confidence?: number | null
          created_at?: string
          id?: string
          legal_document_id?: string
          legal_document_page_id?: string | null
          organization_id?: string
          project_id?: string
          snippet?: string | null
          snippet_hash?: string
          variable_resolution_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_evidence_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_evidence_legal_document_page_id_fkey"
            columns: ["legal_document_page_id"]
            isOneToOne: false
            referencedRelation: "legal_document_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_evidence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_evidence_variable_resolution_id_fkey"
            columns: ["variable_resolution_id"]
            isOneToOne: false
            referencedRelation: "variable_resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_ingestion_jobs: {
        Row: {
          attempt_number: number
          completed_at: string | null
          converter: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          legal_document_id: string
          organization_id: string
          pipeline_version: string
          project_id: string
          started_at: string | null
          stats: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          converter?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          legal_document_id: string
          organization_id: string
          pipeline_version?: string
          project_id: string
          started_at?: string | null
          stats?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          converter?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          legal_document_id?: string
          organization_id?: string
          pipeline_version?: string
          project_id?: string
          started_at?: string | null
          stats?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_ingestion_jobs_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_ingestion_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_ingestion_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          footer_config: Json | null
          header_config: Json | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          page_config: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type: string
          footer_config?: Json | null
          header_config?: Json | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          page_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          footer_config?: Json | null
          header_config?: Json | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          page_config?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_approval_attempts: {
        Row: {
          actor_user_id: string | null
          created_at: string
          error_code: string | null
          escritura_case_id: string | null
          evidence_manifest_hash: string
          finalized_at: string | null
          id: string
          legal_approval_grant_id: string
          matriz_id: string
          matriz_version: number
          operation_id: string
          organization_id: string
          origin: string
          project_id: string
          provenance_manifest_hash: string
          review_policy_fingerprint: string
          snapshot_hash: string
          status: string
          template_id: string
          template_version: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          error_code?: string | null
          escritura_case_id?: string | null
          evidence_manifest_hash: string
          finalized_at?: string | null
          id?: string
          legal_approval_grant_id: string
          matriz_id: string
          matriz_version: number
          operation_id: string
          organization_id: string
          origin: string
          project_id: string
          provenance_manifest_hash: string
          review_policy_fingerprint: string
          snapshot_hash: string
          status?: string
          template_id: string
          template_version: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          error_code?: string | null
          escritura_case_id?: string | null
          evidence_manifest_hash?: string
          finalized_at?: string | null
          id?: string
          legal_approval_grant_id?: string
          matriz_id?: string
          matriz_version?: number
          operation_id?: string
          organization_id?: string
          origin?: string
          project_id?: string
          provenance_manifest_hash?: string
          review_policy_fingerprint?: string
          snapshot_hash?: string
          status?: string
          template_id?: string
          template_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "escritura_approval_attempts_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_approval_attempts_legal_approval_grant_id_fkey"
            columns: ["legal_approval_grant_id"]
            isOneToOne: false
            referencedRelation: "legal_approval_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_approval_attempts_matriz_id_fkey"
            columns: ["matriz_id"]
            isOneToOne: false
            referencedRelation: "escritura_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_approval_attempts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_approval_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_approval_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_approval_attempts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escritura_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_cascade_runs: {
        Row: {
          attempt_number: number | null
          causes: Json
          created_at: string
          delivery_state: Json
          escritura_case_id: string
          finished_at: string | null
          generation_fingerprint: string | null
          id: string
          last_error_code: string | null
          organization_id: string
          outcome: string
          started_at: string | null
          steps: Json
          trigger: string
          workflow_outbox_id: string | null
        }
        Insert: {
          attempt_number?: number | null
          causes?: Json
          created_at?: string
          delivery_state?: Json
          escritura_case_id: string
          finished_at?: string | null
          generation_fingerprint?: string | null
          id?: string
          last_error_code?: string | null
          organization_id: string
          outcome: string
          started_at?: string | null
          steps?: Json
          trigger: string
          workflow_outbox_id?: string | null
        }
        Update: {
          attempt_number?: number | null
          causes?: Json
          created_at?: string
          delivery_state?: Json
          escritura_case_id?: string
          finished_at?: string | null
          generation_fingerprint?: string | null
          id?: string
          last_error_code?: string | null
          organization_id?: string
          outcome?: string
          started_at?: string | null
          steps?: Json
          trigger?: string
          workflow_outbox_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escritura_cascade_runs_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_cascade_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_cascade_runs_workflow_outbox_id_fkey"
            columns: ["workflow_outbox_id"]
            isOneToOne: false
            referencedRelation: "workflow_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_cases: {
        Row: {
          case_status: string
          created_at: string
          created_by: string | null
          evidence_snapshot: Json
          generated_document_id: string | null
          id: string
          lot_id: string
          organization_id: string
          project_id: string
          readiness_gates: Json
          readiness_status: string
          template_id: string | null
          updated_at: string
          variable_snapshot: Json
        }
        Insert: {
          case_status?: string
          created_at?: string
          created_by?: string | null
          evidence_snapshot?: Json
          generated_document_id?: string | null
          id?: string
          lot_id: string
          organization_id: string
          project_id: string
          readiness_gates?: Json
          readiness_status?: string
          template_id?: string | null
          updated_at?: string
          variable_snapshot?: Json
        }
        Update: {
          case_status?: string
          created_at?: string
          created_by?: string | null
          evidence_snapshot?: Json
          generated_document_id?: string | null
          id?: string
          lot_id?: string
          organization_id?: string
          project_id?: string
          readiness_gates?: Json
          readiness_status?: string
          template_id?: string | null
          updated_at?: string
          variable_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "escritura_cases_generated_document_id_fkey"
            columns: ["generated_document_id"]
            isOneToOne: false
            referencedRelation: "generated_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_cases_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_cases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_deliveries: {
        Row: {
          active_capability_id: string | null
          attempt_count: number
          authenticated_replacement_verified_at: string | null
          available_at: string | null
          capability_status: string
          channel: string
          created_at: string
          delivery_status: string
          escritura_case_id: string
          first_accessed_at: string | null
          generation_id: string
          id: string
          last_attempt_at: string | null
          last_error_class: string | null
          last_error_code: string | null
          legacy_cutover_status: string
          legacy_revoked_at: string | null
          link_expires_at: string | null
          link_token: string | null
          next_attempt_at: string | null
          operation_id: string | null
          organization_id: string
          project_id: string
          recipient_role: string | null
          recipient_user_id: string | null
          required: boolean
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active_capability_id?: string | null
          attempt_count?: number
          authenticated_replacement_verified_at?: string | null
          available_at?: string | null
          capability_status?: string
          channel: string
          created_at?: string
          delivery_status?: string
          escritura_case_id: string
          first_accessed_at?: string | null
          generation_id: string
          id?: string
          last_attempt_at?: string | null
          last_error_class?: string | null
          last_error_code?: string | null
          legacy_cutover_status?: string
          legacy_revoked_at?: string | null
          link_expires_at?: string | null
          link_token?: string | null
          next_attempt_at?: string | null
          operation_id?: string | null
          organization_id: string
          project_id: string
          recipient_role?: string | null
          recipient_user_id?: string | null
          required?: boolean
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active_capability_id?: string | null
          attempt_count?: number
          authenticated_replacement_verified_at?: string | null
          available_at?: string | null
          capability_status?: string
          channel?: string
          created_at?: string
          delivery_status?: string
          escritura_case_id?: string
          first_accessed_at?: string | null
          generation_id?: string
          id?: string
          last_attempt_at?: string | null
          last_error_class?: string | null
          last_error_code?: string | null
          legacy_cutover_status?: string
          legacy_revoked_at?: string | null
          link_expires_at?: string | null
          link_token?: string | null
          next_attempt_at?: string | null
          operation_id?: string | null
          organization_id?: string
          project_id?: string
          recipient_role?: string | null
          recipient_user_id?: string | null
          required?: boolean
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritura_deliveries_active_capability_id_fkey"
            columns: ["active_capability_id"]
            isOneToOne: false
            referencedRelation: "escritura_delivery_capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_deliveries_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_deliveries_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "escritura_minuta_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_deliveries_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_delivery_capabilities: {
        Row: {
          consumed_at: string | null
          created_at: string
          delivery_id: string
          expires_at: string
          id: string
          issued_at: string
          issued_by: string | null
          last_audit_id: string | null
          operation_id: string
          revoked_at: string | null
          revoked_by: string | null
          rotated_to_id: string | null
          status: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          delivery_id: string
          expires_at: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_audit_id?: string | null
          operation_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          rotated_to_id?: string | null
          status: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          delivery_id?: string
          expires_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_audit_id?: string | null
          operation_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          rotated_to_id?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritura_delivery_capabilities_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "escritura_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_delivery_capabilities_last_audit_id_fkey"
            columns: ["last_audit_id"]
            isOneToOne: false
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_delivery_capabilities_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_delivery_capabilities_rotated_to_id_fkey"
            columns: ["rotated_to_id"]
            isOneToOne: false
            referencedRelation: "escritura_delivery_capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_matrices: {
        Row: {
          approval_origin: string
          approved_at: string | null
          approved_by: string | null
          clause_order: Json
          clause_overrides: Json
          created_at: string
          escritura_case_id: string | null
          id: string
          organization_id: string
          project_id: string
          snapshot_case_status: string
          snapshot_hash: string
          source_project_matriz_id: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          template_id: string
          updated_at: string
          version: number
        }
        Insert: {
          approval_origin?: string
          approved_at?: string | null
          approved_by?: string | null
          clause_order?: Json
          clause_overrides?: Json
          created_at?: string
          escritura_case_id?: string | null
          id?: string
          organization_id: string
          project_id: string
          snapshot_case_status: string
          snapshot_hash: string
          source_project_matriz_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          approval_origin?: string
          approved_at?: string | null
          approved_by?: string | null
          clause_order?: Json
          clause_overrides?: Json
          created_at?: string
          escritura_case_id?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          snapshot_case_status?: string
          snapshot_hash?: string
          source_project_matriz_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "escritura_matrices_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_matrices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_matrices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_matrices_source_project_matriz_id_fkey"
            columns: ["source_project_matriz_id"]
            isOneToOne: false
            referencedRelation: "escritura_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_matrices_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escritura_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_minuta_generations: {
        Row: {
          approval_id: string | null
          artifact_sha256: string | null
          content_hash: string
          escritura_case_id: string
          generated_at: string
          generated_by: string | null
          generation_fingerprint: string | null
          generation_mode: string
          id: string
          matriz_id: string
          matriz_version: number
          normalization_version: string | null
          operation_id: string | null
          organization_id: string
          project_id: string
          provenance_manifest_hash: string | null
          readiness_status: string
          regeneration_reason: string | null
          renderer_version: string | null
          resolution_manifest: Json
          review_policy_fingerprint: string | null
          ruleset_version: string | null
          schema_version: string | null
          semantic_validation_id: string | null
          snapshot_hash: string
          storage_path: string
          template_id: string
          template_version: number | null
          warning_acknowledged_at: string
          warning_acknowledged_by: string
        }
        Insert: {
          approval_id?: string | null
          artifact_sha256?: string | null
          content_hash: string
          escritura_case_id: string
          generated_at?: string
          generated_by?: string | null
          generation_fingerprint?: string | null
          generation_mode?: string
          id?: string
          matriz_id: string
          matriz_version: number
          normalization_version?: string | null
          operation_id?: string | null
          organization_id: string
          project_id: string
          provenance_manifest_hash?: string | null
          readiness_status?: string
          regeneration_reason?: string | null
          renderer_version?: string | null
          resolution_manifest?: Json
          review_policy_fingerprint?: string | null
          ruleset_version?: string | null
          schema_version?: string | null
          semantic_validation_id?: string | null
          snapshot_hash: string
          storage_path: string
          template_id: string
          template_version?: number | null
          warning_acknowledged_at: string
          warning_acknowledged_by: string
        }
        Update: {
          approval_id?: string | null
          artifact_sha256?: string | null
          content_hash?: string
          escritura_case_id?: string
          generated_at?: string
          generated_by?: string | null
          generation_fingerprint?: string | null
          generation_mode?: string
          id?: string
          matriz_id?: string
          matriz_version?: number
          normalization_version?: string | null
          operation_id?: string | null
          organization_id?: string
          project_id?: string
          provenance_manifest_hash?: string | null
          readiness_status?: string
          regeneration_reason?: string | null
          renderer_version?: string | null
          resolution_manifest?: Json
          review_policy_fingerprint?: string | null
          ruleset_version?: string | null
          schema_version?: string | null
          semantic_validation_id?: string | null
          snapshot_hash?: string
          storage_path?: string
          template_id?: string
          template_version?: number | null
          warning_acknowledged_at?: string
          warning_acknowledged_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritura_minuta_generations_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "legal_review_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_matriz_id_fkey"
            columns: ["matriz_id"]
            isOneToOne: false
            referencedRelation: "escritura_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_semantic_validation_id_fkey"
            columns: ["semantic_validation_id"]
            isOneToOne: false
            referencedRelation: "escritura_semantic_validations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_minuta_generations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escritura_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_semantic_validations: {
        Row: {
          approval_attempt_id: string
          approval_id: string | null
          artifact_sha256: string
          escritura_case_id: string | null
          evidence_manifest_hash: string
          id: string
          issues: Json
          matriz_id: string
          matriz_version: number
          normalization_version: string
          organization_id: string
          project_id: string
          provenance_manifest_hash: string
          renderer_version: string
          resolved_content_hash: string
          ruleset_version: string
          schema_version: string
          snapshot_hash: string
          status: string
          template_id: string
          template_version: number
          validated_at: string
          validated_by: string | null
          validation_origin: string
        }
        Insert: {
          approval_attempt_id: string
          approval_id?: string | null
          artifact_sha256: string
          escritura_case_id?: string | null
          evidence_manifest_hash: string
          id?: string
          issues?: Json
          matriz_id: string
          matriz_version: number
          normalization_version: string
          organization_id: string
          project_id: string
          provenance_manifest_hash: string
          renderer_version: string
          resolved_content_hash: string
          ruleset_version: string
          schema_version: string
          snapshot_hash: string
          status: string
          template_id: string
          template_version: number
          validated_at?: string
          validated_by?: string | null
          validation_origin: string
        }
        Update: {
          approval_attempt_id?: string
          approval_id?: string | null
          artifact_sha256?: string
          escritura_case_id?: string | null
          evidence_manifest_hash?: string
          id?: string
          issues?: Json
          matriz_id?: string
          matriz_version?: number
          normalization_version?: string
          organization_id?: string
          project_id?: string
          provenance_manifest_hash?: string
          renderer_version?: string
          resolved_content_hash?: string
          ruleset_version?: string
          schema_version?: string
          snapshot_hash?: string
          status?: string
          template_id?: string
          template_version?: number
          validated_at?: string
          validated_by?: string | null
          validation_origin?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritura_semantic_validations_approval_attempt_id_fkey"
            columns: ["approval_attempt_id"]
            isOneToOne: false
            referencedRelation: "escritura_approval_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_semantic_validations_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "legal_review_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_semantic_validations_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_semantic_validations_matriz_id_fkey"
            columns: ["matriz_id"]
            isOneToOne: false
            referencedRelation: "escritura_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_semantic_validations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_semantic_validations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_semantic_validations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escritura_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_signature_events: {
        Row: {
          created_at: string
          escritura_case_id: string
          evidence_file_id: string
          evidence_sha256: string
          generation_id: string
          id: string
          lot_id: string
          operation_id: string
          organization_id: string
          project_id: string
          reason: string
          recorded_by: string
          request_hash: string
          signed_at: string
        }
        Insert: {
          created_at?: string
          escritura_case_id: string
          evidence_file_id: string
          evidence_sha256: string
          generation_id: string
          id?: string
          lot_id: string
          operation_id: string
          organization_id: string
          project_id: string
          reason: string
          recorded_by: string
          request_hash: string
          signed_at: string
        }
        Update: {
          created_at?: string
          escritura_case_id?: string
          evidence_file_id?: string
          evidence_sha256?: string
          generation_id?: string
          id?: string
          lot_id?: string
          operation_id?: string
          organization_id?: string
          project_id?: string
          reason?: string
          recorded_by?: string
          request_hash?: string
          signed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritura_signature_events_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_signature_events_evidence_file_id_fkey"
            columns: ["evidence_file_id"]
            isOneToOne: true
            referencedRelation: "project_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_signature_events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "escritura_minuta_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_signature_events_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_signature_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_signature_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_signature_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_template_clauses: {
        Row: {
          alert_tipo: string | null
          clause_key: string
          condition_key: string | null
          condition_mode: string | null
          content_json: Json
          created_at: string
          fixed_position: boolean
          id: string
          organization_id: string
          position: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_tipo?: string | null
          clause_key: string
          condition_key?: string | null
          condition_mode?: string | null
          content_json?: Json
          created_at?: string
          fixed_position?: boolean
          id?: string
          organization_id: string
          position: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_tipo?: string | null
          clause_key?: string
          condition_key?: string | null
          condition_mode?: string | null
          content_json?: Json
          created_at?: string
          fixed_position?: boolean
          id?: string
          organization_id?: string
          position?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escritura_template_clauses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escritura_template_clauses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escritura_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escritura_templates: {
        Row: {
          created_at: string
          document_type: string
          id: string
          name: string
          organization_id: string
          published_at: string | null
          published_by: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          document_type?: string
          id?: string
          name: string
          organization_id: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          name?: string
          organization_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "escritura_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_rollout_controls: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          last_audit_id: string
          mode: string
          operation_id: string
          organization_id: string
          reason: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          last_audit_id: string
          mode?: string
          operation_id: string
          organization_id: string
          reason: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          last_audit_id?: string
          mode?: string
          operation_id?: string
          organization_id?: string
          reason?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_rollout_controls_last_audit_id_fkey"
            columns: ["last_audit_id"]
            isOneToOne: false
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_rollout_controls_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_rollout_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_rollout_projects: {
        Row: {
          control_id: string
          created_at: string
          project_id: string
        }
        Insert: {
          control_id: string
          created_at?: string
          project_id: string
        }
        Update: {
          control_id?: string
          created_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_rollout_projects_control_id_fkey"
            columns: ["control_id"]
            isOneToOne: false
            referencedRelation: "feature_rollout_controls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_rollout_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          created_at: string | null
          delivery_error_message: string | null
          delivery_failed_attempts: number
          delivery_metadata: Json
          delivery_status: string
          document_type: string
          file_format: string
          file_url: string
          generated_by: string | null
          id: string
          lot_id: string | null
          lot_record_id: string | null
          missing_variables: Json
          missing_variables_accepted: boolean
          organization_id: string
          selected_recipients: string[]
          template_id: string
          variables_snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string | null
          delivery_error_message?: string | null
          delivery_failed_attempts?: number
          delivery_metadata?: Json
          delivery_status?: string
          document_type: string
          file_format?: string
          file_url: string
          generated_by?: string | null
          id?: string
          lot_id?: string | null
          lot_record_id?: string | null
          missing_variables?: Json
          missing_variables_accepted?: boolean
          organization_id: string
          selected_recipients?: string[]
          template_id: string
          variables_snapshot: Json
          version_number?: number
        }
        Update: {
          created_at?: string | null
          delivery_error_message?: string | null
          delivery_failed_attempts?: number
          delivery_metadata?: Json
          delivery_status?: string
          document_type?: string
          file_format?: string
          file_url?: string
          generated_by?: string | null
          id?: string
          lot_id?: string | null
          lot_record_id?: string | null
          missing_variables?: Json
          missing_variables_accepted?: boolean
          organization_id?: string
          selected_recipients?: string[]
          template_id?: string
          variables_snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_lot_record_id_fkey"
            columns: ["lot_record_id"]
            isOneToOne: false
            referencedRelation: "lot_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      geometries: {
        Row: {
          active: boolean
          content_hash: string | null
          created_at: string
          feature_key: string | null
          geometry: Json
          geometry_type: Database["public"]["Enums"]["geometry_type"]
          id: string
          import_id: string | null
          is_assigned: boolean
          lot_id: string | null
          name: string | null
          project_id: string
          properties: Json | null
          source_feature_index: number | null
          source_type: Database["public"]["Enums"]["source_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          content_hash?: string | null
          created_at?: string
          feature_key?: string | null
          geometry: Json
          geometry_type?: Database["public"]["Enums"]["geometry_type"]
          id?: string
          import_id?: string | null
          is_assigned?: boolean
          lot_id?: string | null
          name?: string | null
          project_id: string
          properties?: Json | null
          source_feature_index?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          content_hash?: string | null
          created_at?: string
          feature_key?: string | null
          geometry?: Json
          geometry_type?: Database["public"]["Enums"]["geometry_type"]
          id?: string
          import_id?: string | null
          is_assigned?: boolean
          lot_id?: string | null
          name?: string | null
          project_id?: string
          properties?: Json | null
          source_feature_index?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geometries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "geometry_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometries_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      geometry_assignment_history: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          geometry_id: string | null
          id: string
          lot_id: string
          operation_id: string
          organization_id: string
          previous_geometry_id: string | null
          project_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          geometry_id?: string | null
          id?: string
          lot_id: string
          operation_id: string
          organization_id: string
          previous_geometry_id?: string | null
          project_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          geometry_id?: string | null
          id?: string
          lot_id?: string
          operation_id?: string
          organization_id?: string
          previous_geometry_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geometry_assignment_history_geometry_id_fkey"
            columns: ["geometry_id"]
            isOneToOne: false
            referencedRelation: "geometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_assignment_history_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_assignment_history_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_assignment_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_assignment_history_previous_geometry_id_fkey"
            columns: ["previous_geometry_id"]
            isOneToOne: false
            referencedRelation: "geometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_assignment_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      geometry_derivations: {
        Row: {
          config: Json
          config_hash: string
          created_at: string
          derivation_type: string
          id: string
          operation_id: string
          organization_id: string
          project_id: string
          result: Json | null
          source_geometry_ids: string[]
          source_hash: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          config_hash: string
          created_at?: string
          derivation_type: string
          id?: string
          operation_id: string
          organization_id: string
          project_id: string
          result?: Json | null
          source_geometry_ids: string[]
          source_hash: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          config_hash?: string
          created_at?: string
          derivation_type?: string
          id?: string
          operation_id?: string
          organization_id?: string
          project_id?: string
          result?: Json | null
          source_geometry_ids?: string[]
          source_hash?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geometry_derivations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_derivations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_derivations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      geometry_enrichment_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          derivation_id: string | null
          geometry_id: string | null
          id: string
          job_kind: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lot_id: string | null
          operation_id: string
          organization_id: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          derivation_id?: string | null
          geometry_id?: string | null
          id?: string
          job_kind: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lot_id?: string | null
          operation_id: string
          organization_id: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          derivation_id?: string | null
          geometry_id?: string | null
          id?: string
          job_kind?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lot_id?: string | null
          operation_id?: string
          organization_id?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geometry_enrichment_jobs_derivation_id_fkey"
            columns: ["derivation_id"]
            isOneToOne: false
            referencedRelation: "geometry_derivations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_enrichment_jobs_geometry_id_fkey"
            columns: ["geometry_id"]
            isOneToOne: false
            referencedRelation: "geometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_enrichment_jobs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_enrichment_jobs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_enrichment_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_enrichment_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      geometry_imports: {
        Row: {
          created_at: string
          created_by: string
          feature_count: number
          id: string
          operation_id: string
          organization_id: string
          project_id: string
          source_file_id: string | null
          source_sha256: string
          source_type: Database["public"]["Enums"]["source_type"]
          status: string
          superseded_at: string | null
          supersedes_import_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          feature_count: number
          id?: string
          operation_id: string
          organization_id: string
          project_id: string
          source_file_id?: string | null
          source_sha256: string
          source_type: Database["public"]["Enums"]["source_type"]
          status?: string
          superseded_at?: string | null
          supersedes_import_id?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          feature_count?: number
          id?: string
          operation_id?: string
          organization_id?: string
          project_id?: string
          source_file_id?: string | null
          source_sha256?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: string
          superseded_at?: string | null
          supersedes_import_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "geometry_imports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_imports_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "project_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geometry_imports_supersedes_import_id_fkey"
            columns: ["supersedes_import_id"]
            isOneToOne: false
            referencedRelation: "geometry_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_operation_types: {
        Row: {
          contract_version: string
          created_at: string
          enabled: boolean
          operation_type: string
        }
        Insert: {
          contract_version?: string
          created_at?: string
          enabled?: boolean
          operation_type: string
        }
        Update: {
          contract_version?: string
          created_at?: string
          enabled?: boolean
          operation_type?: string
        }
        Relationships: []
      }
      idempotency_operations: {
        Row: {
          canonicalization_version: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          operation_type: string
          organization_id: string
          principal_subject: string
          principal_type: string
          provider_event_key: string | null
          request_hash: string
          resource_id: string | null
          resource_scope: string
          resource_type: string | null
          response_summary: Json
          source_kind: string
          status: string
          updated_at: string
        }
        Insert: {
          canonicalization_version?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          operation_type: string
          organization_id: string
          principal_subject: string
          principal_type: string
          provider_event_key?: string | null
          request_hash: string
          resource_id?: string | null
          resource_scope: string
          resource_type?: string | null
          response_summary?: Json
          source_kind: string
          status?: string
          updated_at?: string
        }
        Update: {
          canonicalization_version?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          operation_type?: string
          organization_id?: string
          principal_subject?: string
          principal_type?: string
          provider_event_key?: string | null
          request_hash?: string
          resource_id?: string | null
          resource_scope?: string
          resource_type?: string | null
          response_summary?: Json
          source_kind?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_operations_operation_type_fkey"
            columns: ["operation_type"]
            isOneToOne: false
            referencedRelation: "idempotency_operation_types"
            referencedColumns: ["operation_type"]
          },
          {
            foreignKeyName: "idempotency_operations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          id: string
          name: string | null
          organization_id: string | null
          phone: string
          platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          organization_id?: string | null
          phone: string
          platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          organization_id?: string | null
          phone?: string
          platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_approval_grants: {
        Row: {
          active: boolean
          evidence_fingerprint: string
          expires_at: string | null
          granted_at: string
          granted_by: string
          grantee_user_id: string
          id: string
          operation_id: string
          organization_id: string
          project_id: string | null
          reason: string
          revoke_operation_id: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          active?: boolean
          evidence_fingerprint: string
          expires_at?: string | null
          granted_at?: string
          granted_by: string
          grantee_user_id: string
          id?: string
          operation_id: string
          organization_id: string
          project_id?: string | null
          reason: string
          revoke_operation_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          active?: boolean
          evidence_fingerprint?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string
          grantee_user_id?: string
          id?: string
          operation_id?: string
          organization_id?: string
          project_id?: string | null
          reason?: string
          revoke_operation_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_approval_grants_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_approval_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_approval_grants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_approval_grants_revoke_operation_id_fkey"
            columns: ["revoke_operation_id"]
            isOneToOne: true
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_document_pages: {
        Row: {
          char_count: number
          checksum: string
          created_at: string
          id: string
          ingestion_job_id: string
          legal_document_id: string
          markdown_content: string | null
          organization_id: string
          page_kind: string
          page_number: number
          project_id: string
          text_content: string
        }
        Insert: {
          char_count?: number
          checksum: string
          created_at?: string
          id?: string
          ingestion_job_id: string
          legal_document_id: string
          markdown_content?: string | null
          organization_id: string
          page_kind?: string
          page_number: number
          project_id: string
          text_content?: string
        }
        Update: {
          char_count?: number
          checksum?: string
          created_at?: string
          id?: string
          ingestion_job_id?: string
          legal_document_id?: string
          markdown_content?: string | null
          organization_id?: string
          page_kind?: string
          page_number?: number
          project_id?: string
          text_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_document_pages_ingestion_job_id_fkey"
            columns: ["ingestion_job_id"]
            isOneToOne: false
            referencedRelation: "document_ingestion_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_document_pages_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_document_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_document_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          created_at: string
          document_type: string
          extraction_status: string
          file_size_bytes: number
          id: string
          lot_id: string | null
          mime_type: string
          organization_id: string
          original_filename: string
          project_file_object_id: string | null
          project_id: string
          sha256_hash: string
          source_field: string | null
          storage_bucket: string
          storage_path: string
          superseded_by: string | null
          updated_at: string
          upload_source: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_type: string
          extraction_status?: string
          file_size_bytes: number
          id?: string
          lot_id?: string | null
          mime_type: string
          organization_id: string
          original_filename: string
          project_file_object_id?: string | null
          project_id: string
          sha256_hash: string
          source_field?: string | null
          storage_bucket?: string
          storage_path: string
          superseded_by?: string | null
          updated_at?: string
          upload_source: string
          uploaded_by?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          extraction_status?: string
          file_size_bytes?: number
          id?: string
          lot_id?: string | null
          mime_type?: string
          organization_id?: string
          original_filename?: string
          project_file_object_id?: string | null
          project_id?: string
          sha256_hash?: string
          source_field?: string | null
          storage_bucket?: string
          storage_path?: string
          superseded_by?: string | null
          updated_at?: string
          upload_source?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_project_file_object_id_fkey"
            columns: ["project_file_object_id"]
            isOneToOne: false
            referencedRelation: "project_file_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_review_decisions: {
        Row: {
          decided_at: string
          decided_by: string | null
          decision_payload: Json | null
          decision_status: string
          decision_type: string
          escritura_case_id: string | null
          id: string
          inherited_from_matriz_id: string | null
          inherited_matriz_version: number | null
          lawyer_email: string | null
          lawyer_name: string | null
          lawyer_rut: string | null
          lot_id: string | null
          organization_id: string
          origin: string
          project_id: string
          reason: string | null
          title_analysis_id: string | null
          trigger: string | null
          variable_resolution_id: string | null
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decision_payload?: Json | null
          decision_status: string
          decision_type: string
          escritura_case_id?: string | null
          id?: string
          inherited_from_matriz_id?: string | null
          inherited_matriz_version?: number | null
          lawyer_email?: string | null
          lawyer_name?: string | null
          lawyer_rut?: string | null
          lot_id?: string | null
          organization_id: string
          origin?: string
          project_id: string
          reason?: string | null
          title_analysis_id?: string | null
          trigger?: string | null
          variable_resolution_id?: string | null
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decision_payload?: Json | null
          decision_status?: string
          decision_type?: string
          escritura_case_id?: string | null
          id?: string
          inherited_from_matriz_id?: string | null
          inherited_matriz_version?: number | null
          lawyer_email?: string | null
          lawyer_name?: string | null
          lawyer_rut?: string | null
          lot_id?: string | null
          organization_id?: string
          origin?: string
          project_id?: string
          reason?: string | null
          title_analysis_id?: string | null
          trigger?: string | null
          variable_resolution_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_review_decisions_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_review_decisions_inherited_from_matriz_id_fkey"
            columns: ["inherited_from_matriz_id"]
            isOneToOne: false
            referencedRelation: "escritura_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_review_decisions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_review_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_review_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_review_decisions_title_analysis_id_fkey"
            columns: ["title_analysis_id"]
            isOneToOne: false
            referencedRelation: "title_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_review_decisions_variable_resolution_id_fkey"
            columns: ["variable_resolution_id"]
            isOneToOne: false
            referencedRelation: "variable_resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_legal_data: {
        Row: {
          created_at: string
          id: string
          lot_id: string
          matching_score: number | null
          matching_status: string
          organization_id: string
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          role_status: string
          sii_comuna: string | null
          sii_definitive_role: string | null
          sii_lot_number_normalized: string | null
          sii_pre_role: string | null
          sii_role_in_process_text: string | null
          sii_role_matrix: string | null
          sii_role_record: Json | null
          sii_unit_name: string | null
          source_legal_document_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lot_id: string
          matching_score?: number | null
          matching_status?: string
          organization_id: string
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_status?: string
          sii_comuna?: string | null
          sii_definitive_role?: string | null
          sii_lot_number_normalized?: string | null
          sii_pre_role?: string | null
          sii_role_in_process_text?: string | null
          sii_role_matrix?: string | null
          sii_role_record?: Json | null
          sii_unit_name?: string | null
          source_legal_document_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lot_id?: string
          matching_score?: number | null
          matching_status?: string
          organization_id?: string
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_status?: string
          sii_comuna?: string | null
          sii_definitive_role?: string | null
          sii_lot_number_normalized?: string | null
          sii_pre_role?: string | null
          sii_role_in_process_text?: string | null
          sii_role_matrix?: string | null
          sii_role_record?: Json | null
          sii_unit_name?: string | null
          source_legal_document_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_legal_data_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: true
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_legal_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_legal_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_legal_data_source_legal_document_id_fkey"
            columns: ["source_legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_records: {
        Row: {
          abono: number | null
          cbr_estado: string | null
          cbr_fecha_salida_estimada: string | null
          cbr_numero_petitorio: string | null
          cbr_reparo: string | null
          cliente_comuna: string | null
          cliente_direccion: string | null
          cliente_email: string | null
          cliente_estado_civil: string | null
          cliente_nacionalidad: string | null
          cliente_nombre: string | null
          cliente_ocupacion: string | null
          cliente_region: string | null
          cliente_run: string | null
          cliente_run_normalizado: string | null
          cliente_telefono: string | null
          comision_monto: number | null
          comision_pagada_at: string | null
          created_at: string
          detalle_deuda: string | null
          etapa_proceso: string
          firma_estado: string | null
          firma_fecha: string | null
          firma_lugar: string | null
          gasto_abogado: number | null
          gasto_cbr: number | null
          gasto_notaria: number | null
          id: string
          lot_id: string
          saldo: number | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          abono?: number | null
          cbr_estado?: string | null
          cbr_fecha_salida_estimada?: string | null
          cbr_numero_petitorio?: string | null
          cbr_reparo?: string | null
          cliente_comuna?: string | null
          cliente_direccion?: string | null
          cliente_email?: string | null
          cliente_estado_civil?: string | null
          cliente_nacionalidad?: string | null
          cliente_nombre?: string | null
          cliente_ocupacion?: string | null
          cliente_region?: string | null
          cliente_run?: string | null
          cliente_run_normalizado?: string | null
          cliente_telefono?: string | null
          comision_monto?: number | null
          comision_pagada_at?: string | null
          created_at?: string
          detalle_deuda?: string | null
          etapa_proceso?: string
          firma_estado?: string | null
          firma_fecha?: string | null
          firma_lugar?: string | null
          gasto_abogado?: number | null
          gasto_cbr?: number | null
          gasto_notaria?: number | null
          id?: string
          lot_id: string
          saldo?: number | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          abono?: number | null
          cbr_estado?: string | null
          cbr_fecha_salida_estimada?: string | null
          cbr_numero_petitorio?: string | null
          cbr_reparo?: string | null
          cliente_comuna?: string | null
          cliente_direccion?: string | null
          cliente_email?: string | null
          cliente_estado_civil?: string | null
          cliente_nacionalidad?: string | null
          cliente_nombre?: string | null
          cliente_ocupacion?: string | null
          cliente_region?: string | null
          cliente_run?: string | null
          cliente_run_normalizado?: string | null
          cliente_telefono?: string | null
          comision_monto?: number | null
          comision_pagada_at?: string | null
          created_at?: string
          detalle_deuda?: string | null
          etapa_proceso?: string
          firma_estado?: string | null
          firma_fecha?: string | null
          firma_lugar?: string | null
          gasto_abogado?: number | null
          gasto_cbr?: number | null
          gasto_notaria?: number | null
          id?: string
          lot_id?: string
          saldo?: number | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_records_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: true
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          area_official_m2: number | null
          boundaries_official: Json | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_lote"]
          geometry_id: string | null
          id: string
          m2: number | null
          numero_lote: string
          observaciones: string | null
          perimeter_official_m: number | null
          precio: number | null
          project_id: string
          reserved_at: string | null
          servidumbre_ancho_label: string | null
          servidumbre_ancho_m: number | null
          servidumbre_calculated_at: string | null
          servidumbre_calculation_status: string
          servidumbre_calculation_version: string | null
          servidumbre_geometry: Json | null
          servidumbre_m2: number | null
          servidumbre_sources: Json | null
          servidumbre_widths_m: number[] | null
          sold_at: string | null
          superficie_neta_m2: number | null
          updated_at: string
          valor_reserva: number | null
          vendedor_id: string | null
          verified_at: string | null
          verified_by: string | null
          verified_status: string
        }
        Insert: {
          area_official_m2?: number | null
          boundaries_official?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_lote"]
          geometry_id?: string | null
          id?: string
          m2?: number | null
          numero_lote: string
          observaciones?: string | null
          perimeter_official_m?: number | null
          precio?: number | null
          project_id: string
          reserved_at?: string | null
          servidumbre_ancho_label?: string | null
          servidumbre_ancho_m?: number | null
          servidumbre_calculated_at?: string | null
          servidumbre_calculation_status?: string
          servidumbre_calculation_version?: string | null
          servidumbre_geometry?: Json | null
          servidumbre_m2?: number | null
          servidumbre_sources?: Json | null
          servidumbre_widths_m?: number[] | null
          sold_at?: string | null
          superficie_neta_m2?: number | null
          updated_at?: string
          valor_reserva?: number | null
          vendedor_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_status?: string
        }
        Update: {
          area_official_m2?: number | null
          boundaries_official?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_lote"]
          geometry_id?: string | null
          id?: string
          m2?: number | null
          numero_lote?: string
          observaciones?: string | null
          perimeter_official_m?: number | null
          precio?: number | null
          project_id?: string
          reserved_at?: string | null
          servidumbre_ancho_label?: string | null
          servidumbre_ancho_m?: number | null
          servidumbre_calculated_at?: string | null
          servidumbre_calculation_status?: string
          servidumbre_calculation_version?: string | null
          servidumbre_geometry?: Json | null
          servidumbre_m2?: number | null
          servidumbre_sources?: Json | null
          servidumbre_widths_m?: number[] | null
          sold_at?: string | null
          superficie_neta_m2?: number | null
          updated_at?: string
          valor_reserva?: number | null
          vendedor_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_geometry_fk"
            columns: ["geometry_id"]
            isOneToOne: false
            referencedRelation: "geometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_vendor_project_fkey"
            columns: ["vendedor_id", "project_id"]
            isOneToOne: false
            referencedRelation: "vendor_projects"
            referencedColumns: ["vendor_id", "project_id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          created_at: string | null
          credentials_encrypted: string
          display_name: string
          id: string
          last_error: string | null
          last_health_check: string | null
          organization_id: string
          provider: string
          scopes: string[] | null
          server_url: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credentials_encrypted: string
          display_name: string
          id?: string
          last_error?: string | null
          last_health_check?: string | null
          organization_id: string
          provider: string
          scopes?: string[] | null
          server_url?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credentials_encrypted?: string
          display_name?: string
          id?: string
          last_error?: string | null
          last_health_check?: string | null
          organization_id?: string
          provider?: string
          scopes?: string[] | null
          server_url?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          approval_id: string
          created_at: string
          delivery_channel: string
          delivery_status: string
          dismissed_at: string | null
          failed_reason: string | null
          id: string
          organization_id: string
          read_at: string | null
          recipient_id: string
          recipient_role: string
          updated_at: string
        }
        Insert: {
          approval_id: string
          created_at?: string
          delivery_channel: string
          delivery_status?: string
          dismissed_at?: string | null
          failed_reason?: string | null
          id?: string
          organization_id: string
          read_at?: string | null
          recipient_id: string
          recipient_role: string
          updated_at?: string
        }
        Update: {
          approval_id?: string
          created_at?: string
          delivery_channel?: string
          delivery_status?: string
          dismissed_at?: string | null
          failed_reason?: string | null
          id?: string
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          recipient_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_skill_configs: {
        Row: {
          config_overrides: Json | null
          created_at: string | null
          enabled: boolean | null
          enabled_by: string | null
          id: string
          organization_id: string
          skill_id: string
          updated_at: string | null
        }
        Insert: {
          config_overrides?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          enabled_by?: string | null
          id?: string
          organization_id: string
          skill_id: string
          updated_at?: string | null
        }
        Update: {
          config_overrides?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          enabled_by?: string | null
          id?: string
          organization_id?: string
          skill_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_skill_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_skill_configs_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_payment_info: {
        Row: {
          banco: string
          created_at: string | null
          email_transferencia: string | null
          id: string
          numero_cuenta: string
          organization_id: string
          razon_social: string
          rut: string
          tipo_cuenta: string
          updated_at: string | null
        }
        Insert: {
          banco: string
          created_at?: string | null
          email_transferencia?: string | null
          id?: string
          numero_cuenta: string
          organization_id: string
          razon_social: string
          rut: string
          tipo_cuenta?: string
          updated_at?: string | null
        }
        Update: {
          banco?: string
          created_at?: string | null
          email_transferencia?: string | null
          id?: string
          numero_cuenta?: string
          organization_id?: string
          razon_social?: string
          rut?: string
          tipo_cuenta?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_payment_info_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          escritura_review_policy: string
          id: string
          is_personal: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          escritura_review_policy?: string
          id?: string
          is_personal?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          escritura_review_policy?: string
          id?: string
          is_personal?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_readiness_findings: {
        Row: {
          budget: string | null
          details: Json
          detected_at: string
          fingerprint: string
          id: string
          impact: string | null
          kind: string
          organization_id: string | null
          owner: string | null
          resolution: string | null
          resolved_at: string | null
          resource_id: string | null
          resource_type: string | null
          review_due_at: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          budget?: string | null
          details?: Json
          detected_at?: string
          fingerprint: string
          id?: string
          impact?: string | null
          kind: string
          organization_id?: string | null
          owner?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          review_due_at?: string | null
          severity: string
          status?: string
          updated_at?: string
        }
        Update: {
          budget?: string | null
          details?: Json
          detected_at?: string
          fingerprint?: string
          id?: string
          impact?: string | null
          kind?: string
          organization_id?: string | null
          owner?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          review_due_at?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_readiness_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          first_name: string | null
          id: string
          is_super_admin: boolean
          last_name: string | null
          phone: string | null
          telegram_chat_id: string | null
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          first_name?: string | null
          id: string
          is_super_admin?: boolean
          last_name?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          first_name?: string | null
          id?: string
          is_super_admin?: boolean
          last_name?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      project_active_templates: {
        Row: {
          created_at: string
          document_type: string
          project_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          project_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          project_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_active_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_active_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_file_objects: {
        Row: {
          bound_escritura_case_id: string | null
          bound_generation_id: string | null
          bucket: string
          category: string
          content_type: string
          created_at: string
          created_by: string
          id: string
          object_path: string
          operation_id: string
          organization_id: string
          original_filename: string
          project_id: string
          replaces_file_id: string | null
          retention_class: string
          size_bytes: number
          source_sha256: string
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          bound_escritura_case_id?: string | null
          bound_generation_id?: string | null
          bucket: string
          category: string
          content_type: string
          created_at?: string
          created_by: string
          id?: string
          object_path: string
          operation_id: string
          organization_id: string
          original_filename: string
          project_id: string
          replaces_file_id?: string | null
          retention_class: string
          size_bytes: number
          source_sha256: string
          status?: string
          updated_at?: string
          visibility: string
        }
        Update: {
          bound_escritura_case_id?: string | null
          bound_generation_id?: string | null
          bucket?: string
          category?: string
          content_type?: string
          created_at?: string
          created_by?: string
          id?: string
          object_path?: string
          operation_id?: string
          organization_id?: string
          original_filename?: string
          project_id?: string
          replaces_file_id?: string | null
          retention_class?: string
          size_bytes?: number
          source_sha256?: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_file_objects_bound_escritura_case_id_fkey"
            columns: ["bound_escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_file_objects_bound_generation_id_fkey"
            columns: ["bound_generation_id"]
            isOneToOne: false
            referencedRelation: "escritura_minuta_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_file_objects_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_file_objects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_file_objects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_file_objects_replaces_file_id_fkey"
            columns: ["replaces_file_id"]
            isOneToOne: false
            referencedRelation: "project_file_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_legal_data: {
        Row: {
          created_at: string
          dominio_cbr_ano: string | null
          dominio_cbr_fojas: string | null
          dominio_cbr_numero: string | null
          dominio_fojas_vigente: string | null
          id: string
          matriz_cbr_ano: string | null
          matriz_cbr_fojas: string | null
          matriz_cbr_numero: string | null
          organization_id: string
          personeria_notario: string | null
          personeria_repre_nombre: string | null
          personeria_repre_rut: string | null
          plano_archivo_numero: string | null
          project_id: string
          review_status: string
          reviewed_at: string | null
          reviewer_id: string | null
          roles: Json | null
          sag_resolucion_ano: string | null
          sag_resolucion_numero: string | null
          sag_subdivision_aprobada: boolean | null
          sii_comuna: string | null
          sii_role_matrix: string | null
          sii_roles_source_legal_document_id: string | null
          sii_roles_status: string | null
          source_document: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dominio_cbr_ano?: string | null
          dominio_cbr_fojas?: string | null
          dominio_cbr_numero?: string | null
          dominio_fojas_vigente?: string | null
          id?: string
          matriz_cbr_ano?: string | null
          matriz_cbr_fojas?: string | null
          matriz_cbr_numero?: string | null
          organization_id: string
          personeria_notario?: string | null
          personeria_repre_nombre?: string | null
          personeria_repre_rut?: string | null
          plano_archivo_numero?: string | null
          project_id: string
          review_status?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          roles?: Json | null
          sag_resolucion_ano?: string | null
          sag_resolucion_numero?: string | null
          sag_subdivision_aprobada?: boolean | null
          sii_comuna?: string | null
          sii_role_matrix?: string | null
          sii_roles_source_legal_document_id?: string | null
          sii_roles_status?: string | null
          source_document?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dominio_cbr_ano?: string | null
          dominio_cbr_fojas?: string | null
          dominio_cbr_numero?: string | null
          dominio_fojas_vigente?: string | null
          id?: string
          matriz_cbr_ano?: string | null
          matriz_cbr_fojas?: string | null
          matriz_cbr_numero?: string | null
          organization_id?: string
          personeria_notario?: string | null
          personeria_repre_nombre?: string | null
          personeria_repre_rut?: string | null
          plano_archivo_numero?: string | null
          project_id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          roles?: Json | null
          sag_resolucion_ano?: string | null
          sag_resolucion_numero?: string | null
          sag_subdivision_aprobada?: boolean | null
          sii_comuna?: string | null
          sii_role_matrix?: string | null
          sii_roles_source_legal_document_id?: string | null
          sii_roles_status?: string | null
          source_document?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_legal_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_legal_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_legal_data_sii_roles_source_legal_document_id_fkey"
            columns: ["sii_roles_source_legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      project_road_segments: {
        Row: {
          created_at: string
          edge_side: string | null
          footprint_geometry: Json | null
          geometry_id: string | null
          id: string
          input_geometry: Json
          input_mode: string
          name: string | null
          project_id: string
          sort_order: number | null
          source_type: string
          status: string
          updated_at: string
          width_m: number | null
        }
        Insert: {
          created_at?: string
          edge_side?: string | null
          footprint_geometry?: Json | null
          geometry_id?: string | null
          id?: string
          input_geometry: Json
          input_mode: string
          name?: string | null
          project_id: string
          sort_order?: number | null
          source_type?: string
          status?: string
          updated_at?: string
          width_m?: number | null
        }
        Update: {
          created_at?: string
          edge_side?: string | null
          footprint_geometry?: Json | null
          geometry_id?: string | null
          id?: string
          input_geometry?: Json
          input_mode?: string
          name?: string | null
          project_id?: string
          sort_order?: number | null
          source_type?: string
          status?: string
          updated_at?: string
          width_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_road_segments_geometry_id_fkey"
            columns: ["geometry_id"]
            isOneToOne: false
            referencedRelation: "geometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_road_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          comuna: string | null
          created_at: string
          descripcion: string | null
          doc_dominio_vigente: string | null
          doc_hipoteca_gravamen: string | null
          doc_otros: string | null
          doc_plano_oficial: string | null
          doc_roles: string | null
          doc_subdivision: string | null
          estado: string
          id: string
          images: string[] | null
          minuta_warning_acknowledged_at: string | null
          minuta_warning_acknowledged_by: string | null
          name: string
          organization_id: string
          region: string | null
          road_geometry: Json | null
          road_width_m: number | null
          total_lotes: number
          updated_at: string
        }
        Insert: {
          comuna?: string | null
          created_at?: string
          descripcion?: string | null
          doc_dominio_vigente?: string | null
          doc_hipoteca_gravamen?: string | null
          doc_otros?: string | null
          doc_plano_oficial?: string | null
          doc_roles?: string | null
          doc_subdivision?: string | null
          estado?: string
          id?: string
          images?: string[] | null
          minuta_warning_acknowledged_at?: string | null
          minuta_warning_acknowledged_by?: string | null
          name: string
          organization_id: string
          region?: string | null
          road_geometry?: Json | null
          road_width_m?: number | null
          total_lotes: number
          updated_at?: string
        }
        Update: {
          comuna?: string | null
          created_at?: string
          descripcion?: string | null
          doc_dominio_vigente?: string | null
          doc_hipoteca_gravamen?: string | null
          doc_otros?: string | null
          doc_plano_oficial?: string | null
          doc_roles?: string | null
          doc_subdivision?: string | null
          estado?: string
          id?: string
          images?: string[] | null
          minuta_warning_acknowledged_at?: string | null
          minuta_warning_acknowledged_by?: string | null
          name?: string
          organization_id?: string
          region?: string | null
          road_geometry?: Json | null
          road_width_m?: number | null
          total_lotes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          author_id: string | null
          change_note: string | null
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          prompt_id: string
          tested_at: string | null
          version: number
        }
        Insert: {
          author_id?: string | null
          change_note?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          prompt_id: string
          tested_at?: string | null
          version: number
        }
        Update: {
          author_id?: string | null
          change_note?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          prompt_id?: string
          tested_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_release_attestations: {
        Row: {
          artifact_digest: string
          config_version: string
          deployment_id: string
          environment_fingerprint: string
          hard_off_automatic_escritura: boolean
          hard_off_canonical_geometry_import: boolean
          hard_off_document_capabilities: boolean
          hard_off_fingerprint: string
          heartbeat_at: string
          instance_id: string
          lifecycle: string
          metadata: Json
          release_sha: string
          retired_at: string | null
          retired_by_operation_id: string | null
          runtime_role: string
          slot_id: string
        }
        Insert: {
          artifact_digest: string
          config_version: string
          deployment_id: string
          environment_fingerprint: string
          hard_off_automatic_escritura: boolean
          hard_off_canonical_geometry_import: boolean
          hard_off_document_capabilities: boolean
          hard_off_fingerprint: string
          heartbeat_at?: string
          instance_id: string
          lifecycle?: string
          metadata?: Json
          release_sha: string
          retired_at?: string | null
          retired_by_operation_id?: string | null
          runtime_role: string
          slot_id: string
        }
        Update: {
          artifact_digest?: string
          config_version?: string
          deployment_id?: string
          environment_fingerprint?: string
          hard_off_automatic_escritura?: boolean
          hard_off_canonical_geometry_import?: boolean
          hard_off_document_capabilities?: boolean
          hard_off_fingerprint?: string
          heartbeat_at?: string
          instance_id?: string
          lifecycle?: string
          metadata?: Json
          release_sha?: string
          retired_at?: string | null
          retired_by_operation_id?: string | null
          runtime_role?: string
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_release_attestations_retired_by_operation_id_fkey"
            columns: ["retired_by_operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_bots: {
        Row: {
          bot_token_encrypted: string
          bot_username: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          bot_token_encrypted: string
          bot_username: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          bot_token_encrypted?: string
          bot_username?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_bots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_block_items: {
        Row: {
          block_id: string
          condition_field: string | null
          id: string
          is_optional: boolean | null
          overrides: Json | null
          position: number
          template_id: string
        }
        Insert: {
          block_id: string
          condition_field?: string | null
          id?: string
          is_optional?: boolean | null
          overrides?: Json | null
          position: number
          template_id: string
        }
        Update: {
          block_id?: string
          condition_field?: string | null
          id?: string
          is_optional?: boolean | null
          overrides?: Json | null
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_block_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "document_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_block_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      title_analyses: {
        Row: {
          alerts: Json
          analysis_json: Json
          approved_at: string | null
          approved_by: string | null
          created_at: string
          duration_ms: number | null
          extractor_name: string
          failure_code: string | null
          id: string
          model_name: string
          narrative_comparecencia_edited: string | null
          narrative_comparecencia_generated: string | null
          narrative_primero_edited: string | null
          narrative_primero_generated: string | null
          organization_id: string
          project_id: string
          prompt_version: string
          source_content_hash: string
          source_document_ids: string[]
          status: string
          structure_type: string | null
          superseded_by_id: string | null
          token_usage: Json | null
          updated_at: string
          verification_stats: Json
        }
        Insert: {
          alerts?: Json
          analysis_json?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          duration_ms?: number | null
          extractor_name: string
          failure_code?: string | null
          id?: string
          model_name: string
          narrative_comparecencia_edited?: string | null
          narrative_comparecencia_generated?: string | null
          narrative_primero_edited?: string | null
          narrative_primero_generated?: string | null
          organization_id: string
          project_id: string
          prompt_version: string
          source_content_hash: string
          source_document_ids: string[]
          status: string
          structure_type?: string | null
          superseded_by_id?: string | null
          token_usage?: Json | null
          updated_at?: string
          verification_stats?: Json
        }
        Update: {
          alerts?: Json
          analysis_json?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          duration_ms?: number | null
          extractor_name?: string
          failure_code?: string | null
          id?: string
          model_name?: string
          narrative_comparecencia_edited?: string | null
          narrative_comparecencia_generated?: string | null
          narrative_primero_edited?: string | null
          narrative_primero_generated?: string | null
          organization_id?: string
          project_id?: string
          prompt_version?: string
          source_content_hash?: string
          source_document_ids?: string[]
          status?: string
          structure_type?: string | null
          superseded_by_id?: string | null
          token_usage?: Json | null
          updated_at?: string
          verification_stats?: Json
        }
        Relationships: [
          {
            foreignKeyName: "title_analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_analyses_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "title_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      variable_resolutions: {
        Row: {
          approval_required: boolean
          attestation_ref: string | null
          confidence: number | null
          correction_reason: string | null
          created_at: string
          escritura_case_id: string | null
          evidence_hash: string | null
          extractor_name: string | null
          field_version: number | null
          id: string
          legal_approval_grant_id: string | null
          lot_id: string | null
          organization_id: string
          person_id: string | null
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_ref: Json
          source_type: string
          state: string
          superseded_by: string | null
          updated_at: string
          value_json: Json | null
          value_text: string | null
          variable_group: string
          variable_key: string
        }
        Insert: {
          approval_required?: boolean
          attestation_ref?: string | null
          confidence?: number | null
          correction_reason?: string | null
          created_at?: string
          escritura_case_id?: string | null
          evidence_hash?: string | null
          extractor_name?: string | null
          field_version?: number | null
          id?: string
          legal_approval_grant_id?: string | null
          lot_id?: string | null
          organization_id: string
          person_id?: string | null
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ref?: Json
          source_type?: string
          state?: string
          superseded_by?: string | null
          updated_at?: string
          value_json?: Json | null
          value_text?: string | null
          variable_group: string
          variable_key: string
        }
        Update: {
          approval_required?: boolean
          attestation_ref?: string | null
          confidence?: number | null
          correction_reason?: string | null
          created_at?: string
          escritura_case_id?: string | null
          evidence_hash?: string | null
          extractor_name?: string | null
          field_version?: number | null
          id?: string
          legal_approval_grant_id?: string | null
          lot_id?: string | null
          organization_id?: string
          person_id?: string | null
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ref?: Json
          source_type?: string
          state?: string
          superseded_by?: string | null
          updated_at?: string
          value_json?: Json | null
          value_text?: string | null
          variable_group?: string
          variable_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "variable_resolutions_escritura_case_id_fkey"
            columns: ["escritura_case_id"]
            isOneToOne: false
            referencedRelation: "escritura_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_resolutions_legal_approval_grant_id_fkey"
            columns: ["legal_approval_grant_id"]
            isOneToOne: false
            referencedRelation: "legal_approval_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_resolutions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_resolutions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_resolutions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_resolutions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "variable_resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_membership_operations: {
        Row: {
          approval_operation_id: string | null
          created_at: string
          error_code: string | null
          external_subject_hash: string | null
          finalized_at: string | null
          id: string
          idempotency_operation_id: string
          operation_kind: string
          organization_id: string
          requested_by: string
          status: string
          target_email_hash: string | null
          target_project_id: string | null
          target_user_id: string | null
          target_vendor_id: string | null
        }
        Insert: {
          approval_operation_id?: string | null
          created_at?: string
          error_code?: string | null
          external_subject_hash?: string | null
          finalized_at?: string | null
          id?: string
          idempotency_operation_id: string
          operation_kind: string
          organization_id: string
          requested_by: string
          status?: string
          target_email_hash?: string | null
          target_project_id?: string | null
          target_user_id?: string | null
          target_vendor_id?: string | null
        }
        Update: {
          approval_operation_id?: string | null
          created_at?: string
          error_code?: string | null
          external_subject_hash?: string | null
          finalized_at?: string | null
          id?: string
          idempotency_operation_id?: string
          operation_kind?: string
          organization_id?: string
          requested_by?: string
          status?: string
          target_email_hash?: string | null
          target_project_id?: string | null
          target_user_id?: string | null
          target_vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_membership_operations_approval_operation_id_fkey"
            columns: ["approval_operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_membership_operations_idempotency_operation_id_fkey"
            columns: ["idempotency_operation_id"]
            isOneToOne: true
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_membership_operations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_membership_operations_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_membership_operations_target_vendor_id_fkey"
            columns: ["target_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_projects: {
        Row: {
          created_at: string
          project_id: string
          rol: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          rol?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          rol?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_projects_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          organization_id: string | null
          owner_id: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_user_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_job_failures: {
        Row: {
          attempt_count: number
          error_class: string
          error_code: string
          first_failed_at: string
          id: string
          job_id: string
          last_audit_id: string | null
          last_failed_at: string
          max_attempts: number
          next_attempt_at: string | null
          operation_id: string
          payload_fingerprint: string
          queue_name: string
          resolution_operation_id: string | null
          resolved_at: string | null
          status: string
          task_name: string
        }
        Insert: {
          attempt_count: number
          error_class: string
          error_code: string
          first_failed_at?: string
          id?: string
          job_id: string
          last_audit_id?: string | null
          last_failed_at?: string
          max_attempts: number
          next_attempt_at?: string | null
          operation_id: string
          payload_fingerprint: string
          queue_name: string
          resolution_operation_id?: string | null
          resolved_at?: string | null
          status: string
          task_name: string
        }
        Update: {
          attempt_count?: number
          error_class?: string
          error_code?: string
          first_failed_at?: string
          id?: string
          job_id?: string
          last_audit_id?: string | null
          last_failed_at?: string
          max_attempts?: number
          next_attempt_at?: string | null
          operation_id?: string
          payload_fingerprint?: string
          queue_name?: string
          resolution_operation_id?: string | null
          resolved_at?: string | null
          status?: string
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_job_failures_last_audit_id_fkey"
            columns: ["last_audit_id"]
            isOneToOne: false
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_job_failures_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_job_failures_resolution_operation_id_fkey"
            columns: ["resolution_operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          deferred_control_fingerprint: string | null
          deferred_reason: string | null
          event_fingerprint: string
          event_type: string
          heartbeat_at: string | null
          id: string
          last_error_class: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          operation_id: string
          organization_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          deferred_control_fingerprint?: string | null
          deferred_reason?: string | null
          event_fingerprint: string
          event_type: string
          heartbeat_at?: string | null
          id?: string
          last_error_class?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          operation_id: string
          organization_id: string
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          deferred_control_fingerprint?: string | null
          deferred_reason?: string | null
          event_fingerprint?: string
          event_type?: string
          heartbeat_at?: string | null
          id?: string
          last_error_class?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          operation_id?: string
          organization_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_outbox_aggregate_id_fkey"
            columns: ["aggregate_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_outbox_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "idempotency_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_mcp_connection: {
        Args: {
          p_credentials: string
          p_display_name: string
          p_org_id: string
          p_provider: string
          p_scopes?: string[]
          p_server_url?: string
          p_user_id: string
        }
        Returns: string
      }
      approve_reservation: {
        Args: { p_admin_phone: string; p_approval_id: string }
        Returns: Json
      }
      approve_sale: {
        Args: { p_admin_phone: string; p_approval_id: string }
        Returns: Json
      }
      assert_sdd_007_project_lot_scope: {
        Args: {
          table_name: string
          target_lot_id: string
          target_organization_id: string
          target_project_id: string
        }
        Returns: undefined
      }
      assign_project_geometry: {
        Args: {
          p_actor_user_id: string
          p_expected_geometry_id: string
          p_geometry_id: string
          p_lot_id: string
          p_operation_id: string
          p_organization_id: string
          p_project_id: string
        }
        Returns: Json
      }
      begin_matriz_approval: {
        Args: {
          p_actor_user_id: string
          p_evidence_manifest_hash: string
          p_expected_matriz_version: number
          p_legal_approval_grant_id: string
          p_matriz_id: string
          p_operation_id: string
          p_origin: string
          p_provenance_manifest_hash: string
          p_review_policy_fingerprint: string
          p_snapshot_hash: string
          p_template_version: number
        }
        Returns: string
      }
      begin_vendor_membership_operation: {
        Args: {
          p_idempotency_operation_id: string
          p_operation_kind: string
          p_organization_id: string
          p_requested_by: string
          p_target_project_id: string
          p_target_user_id: string
          p_target_vendor_id: string
        }
        Returns: string
      }
      begin_workflow_outbox_attempt: {
        Args: { p_item_id: string; p_worker_id: string }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          deferred_control_fingerprint: string | null
          deferred_reason: string | null
          event_fingerprint: string
          event_type: string
          heartbeat_at: string | null
          id: string
          last_error_class: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          operation_id: string
          organization_id: string
          payload: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_outbox"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_manage_project_files: {
        Args: { project_id_text: string }
        Returns: boolean
      }
      can_read_project_files: {
        Args: { project_id_text: string }
        Returns: boolean
      }
      claim_geometry_enrichment_job: {
        Args: { p_worker_id: string }
        Returns: {
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          derivation_id: string | null
          geometry_id: string | null
          id: string
          job_kind: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lot_id: string | null
          operation_id: string
          organization_id: string
          project_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "geometry_enrichment_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_idempotency_operation: {
        Args: {
          p_idempotency_key: string
          p_operation_type: string
          p_organization_id: string
          p_principal_subject: string
          p_principal_type: string
          p_provider_event_key?: string
          p_request_hash: string
          p_resource_scope: string
          p_source_kind: string
        }
        Returns: {
          canonicalization_version: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          operation_type: string
          organization_id: string
          principal_subject: string
          principal_type: string
          provider_event_key: string | null
          request_hash: string
          resource_id: string | null
          resource_scope: string
          resource_type: string | null
          response_summary: Json
          source_kind: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "idempotency_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_workflow_outbox: {
        Args: { p_hard_off?: boolean; p_worker_id: string }
        Returns: Json
      }
      commit_geometry_import: {
        Args: {
          p_actor_user_id: string
          p_features: Json
          p_operation_id: string
          p_organization_id: string
          p_project_id: string
          p_source_file_id: string
          p_source_sha256: string
          p_source_type: Database["public"]["Enums"]["source_type"]
        }
        Returns: Json
      }
      commit_project_file_with_reference: {
        Args: {
          p_actor_user_id: string
          p_file_id: string
          p_legal_document_id: string
          p_operation_id: string
        }
        Returns: string
      }
      commit_project_infrastructure: {
        Args: {
          p_config: Json
          p_config_hash: string
          p_derivation_type: string
          p_operation_id: string
          p_organization_id: string
          p_project_id: string
          p_source_geometry_ids: string[]
          p_source_hash: string
        }
        Returns: Json
      }
      complete_idempotency_operation: {
        Args: {
          p_error_code?: string
          p_operation_id: string
          p_request_hash: string
          p_resource_id?: string
          p_resource_type?: string
          p_response_summary?: Json
          p_status: string
        }
        Returns: {
          canonicalization_version: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          operation_type: string
          organization_id: string
          principal_subject: string
          principal_type: string
          provider_event_key: string | null
          request_hash: string
          resource_id: string | null
          resource_scope: string
          resource_type: string | null
          response_summary: Json
          source_kind: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "idempotency_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_project_with_lots: {
        Args: {
          p_actor_user_id: string
          p_comuna: string
          p_descripcion: string
          p_lot_prefix: string
          p_name: string
          p_operation_id: string
          p_organization_id: string
          p_precio: number
          p_region: string
          p_total_lotes: number
          p_valor_reserva: number
        }
        Returns: Json
      }
      cutover_legacy_delivery_link: {
        Args: {
          p_actor_user_id: string
          p_delivery_id: string
          p_operation_id: string
        }
        Returns: {
          active_capability_id: string | null
          attempt_count: number
          authenticated_replacement_verified_at: string | null
          available_at: string | null
          capability_status: string
          channel: string
          created_at: string
          delivery_status: string
          escritura_case_id: string
          first_accessed_at: string | null
          generation_id: string
          id: string
          last_attempt_at: string | null
          last_error_class: string | null
          last_error_code: string | null
          legacy_cutover_status: string
          legacy_revoked_at: string | null
          link_expires_at: string | null
          link_token: string | null
          next_attempt_at: string | null
          operation_id: string | null
          organization_id: string
          project_id: string
          recipient_role: string | null
          recipient_user_id: string | null
          required: boolean
          sent_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "escritura_deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decrypt_credential: { Args: { p_encrypted: string }; Returns: string }
      encrypt_credential: { Args: { p_plaintext: string }; Returns: string }
      finalize_matriz_approval: {
        Args: {
          p_attempt_id: string
          p_operation_id: string
          p_validation_id: string
        }
        Returns: Json
      }
      finalize_vendor_membership_operation: {
        Args: {
          p_error_code?: string
          p_external_subject_hash: string
          p_operation_id: string
          p_succeeded: boolean
        }
        Returns: string
      }
      finish_workflow_outbox: {
        Args: {
          p_error_class?: string
          p_error_code?: string
          p_item_id: string
          p_retry_after_seconds?: number
          p_status: string
          p_worker_id: string
        }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          deferred_control_fingerprint: string | null
          deferred_reason: string | null
          event_fingerprint: string
          event_type: string
          heartbeat_at: string | null
          id: string
          last_error_class: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          operation_id: string
          organization_id: string
          payload: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_outbox"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_decrypted_bot_token: { Args: { p_org_id: string }; Returns: string }
      get_mcp_credentials: {
        Args: { p_org_id: string; p_provider: string; p_user_id: string }
        Returns: string
      }
      heartbeat_workflow_outbox: {
        Args: { p_item_id: string; p_worker_id: string }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          deferred_control_fingerprint: string | null
          deferred_reason: string | null
          event_fingerprint: string
          event_type: string
          heartbeat_at: string | null
          id: string
          last_error_class: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          operation_id: string
          organization_id: string
          payload: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_outbox"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_user: { Args: { org_id: string }; Returns: boolean }
      is_project_admin: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_project_vendor: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      issue_delivery_capability: {
        Args: {
          p_actor_user_id?: string
          p_delivery_id: string
          p_operation_id: string
          p_ttl_seconds: number
        }
        Returns: Json
      }
      record_escritura_signature: {
        Args: {
          p_escritura_case_id: string
          p_evidence_file_id: string
          p_generation_id: string
          p_operation_key: string
          p_reason: string
          p_recorded_by: string
          p_signed_at: string
        }
        Returns: Json
      }
      register_telegram_bot: {
        Args: {
          p_org_id: string
          p_token: string
          p_username: string
          p_webhook_url: string
        }
        Returns: undefined
      }
      reject_reservation: {
        Args: { p_admin_phone?: string; p_approval_id: string }
        Returns: Json
      }
      reject_sale: {
        Args: { p_admin_phone?: string; p_approval_id: string }
        Returns: Json
      }
      release_workflow_outbox_for_feature_off: {
        Args: {
          p_control_fingerprint: string
          p_item_id: string
          p_reason: string
          p_worker_id: string
        }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          deferred_control_fingerprint: string | null
          deferred_reason: string | null
          event_fingerprint: string
          event_type: string
          heartbeat_at: string | null
          id: string
          last_error_class: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          operation_id: string
          organization_id: string
          payload: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_outbox"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      renew_delivery_capability: {
        Args: {
          p_actor_user_id?: string
          p_delivery_id: string
          p_operation_id: string
          p_ttl_seconds: number
        }
        Returns: Json
      }
      resolve_feature_rollout: {
        Args: {
          p_feature_key: string
          p_organization_id: string
          p_project_id?: string
        }
        Returns: boolean
      }
      retire_runtime_slot: {
        Args: {
          p_actor: string
          p_deployment_id: string
          p_expected_heartbeat_at: string
          p_instance_id: string
          p_operation_id: string
          p_reason: string
          p_runtime_role: string
          p_slot_id: string
        }
        Returns: {
          artifact_digest: string
          config_version: string
          deployment_id: string
          environment_fingerprint: string
          hard_off_automatic_escritura: boolean
          hard_off_canonical_geometry_import: boolean
          hard_off_document_capabilities: boolean
          hard_off_fingerprint: string
          heartbeat_at: string
          instance_id: string
          lifecycle: string
          metadata: Json
          release_sha: string
          retired_at: string | null
          retired_by_operation_id: string | null
          runtime_role: string
          slot_id: string
        }
        SetofOptions: {
          from: "*"
          to: "runtime_release_attestations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_default_document_blocks: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: number
      }
      seed_escritura_blocks: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: number
      }
      set_feature_rollout_control: {
        Args: {
          p_actor: string
          p_expected_version: number
          p_feature_key: string
          p_mode: string
          p_operation_id: string
          p_organization_id: string
          p_project_ids: string[]
          p_reason: string
        }
        Returns: {
          created_at: string
          feature_key: string
          id: string
          last_audit_id: string
          mode: string
          operation_id: string
          organization_id: string
          reason: string
          updated_at: string
          updated_by: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "feature_rollout_controls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      supersede_geometry_import: {
        Args: {
          p_actor_user_id: string
          p_expected_source_sha256: string
          p_features: Json
          p_operation_id: string
          p_organization_id: string
          p_project_id: string
          p_source_file_id: string
          p_source_sha256: string
          p_source_type: Database["public"]["Enums"]["source_type"]
        }
        Returns: Json
      }
      verify_legacy_delivery_replacement: {
        Args: {
          p_actor_user_id: string
          p_delivery_id: string
          p_operation_id: string
        }
        Returns: {
          active_capability_id: string | null
          attempt_count: number
          authenticated_replacement_verified_at: string | null
          available_at: string | null
          capability_status: string
          channel: string
          created_at: string
          delivery_status: string
          escritura_case_id: string
          first_accessed_at: string | null
          generation_id: string
          id: string
          last_attempt_at: string | null
          last_error_class: string | null
          last_error_code: string | null
          legacy_cutover_status: string
          legacy_revoked_at: string | null
          link_expires_at: string | null
          link_token: string | null
          next_attempt_at: string | null
          operation_id: string | null
          organization_id: string
          project_id: string
          recipient_role: string | null
          recipient_user_id: string | null
          required: boolean
          sent_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "escritura_deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_lot_as_admin: {
        Args: {
          p_admin_id: string
          p_area_calc_m2: number
          p_lot_id: string
          p_perimeter_calc_m: number
        }
        Returns: undefined
      }
    }
    Enums: {
      estado_lote: "disponible" | "reservado" | "vendido"
      geometry_type: "lot" | "road" | "common_area"
      org_role: "admin" | "user"
      sale_state: "propuesta" | "reservado" | "vendido" | "cancelado"
      source_type: "kmz" | "kml" | "dxf" | "dwg"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_lote: ["disponible", "reservado", "vendido"],
      geometry_type: ["lot", "road", "common_area"],
      org_role: ["admin", "user"],
      sale_state: ["propuesta", "reservado", "vendido", "cancelado"],
      source_type: ["kmz", "kml", "dxf", "dwg"],
    },
  },
} as const
